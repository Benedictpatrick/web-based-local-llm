import { Wllama, CacheManager, type ChatCompletionMessage } from "@wllama/wllama/esm/index.js";
import type { MLCEngine } from "@mlc-ai/web-llm";

const HF_BASE = "https://huggingface.co";

export const AVAILABLE_MODELS = [
  {
    id: "llama3.2-1b",
    label: "Llama 3.2 1B (fastest, ~0.7GB)",
    repo: "bartowski/Llama-3.2-1B-Instruct-GGUF",
    file: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    mlcId: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  },
  {
    id: "gemma2-2b",
    label: "Gemma 2 2B (balanced, ~1.6GB)",
    repo: "bartowski/gemma-2-2b-it-GGUF",
    file: "gemma-2-2b-it-Q4_K_M.gguf",
    mlcId: "gemma-2-2b-it-q4f16_1-MLC",
  },
  {
    id: "llama3.2-3b",
    label: "Llama 3.2 3B (better quality, ~1.9GB)",
    repo: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    file: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    mlcId: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
  },
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number]["id"];
export type ProgressInfo = { loaded: number; total: number; text?: string };

// wllama (CPU/WASM) state — always available as the universal fallback.
let wllama: Wllama | null = null;
let wllamaLoadingPromise: Promise<Wllama> | null = null;
let lastWasmTimings: { predicted_per_second?: number } | null = null;

// web-llm (WebGPU) state — used only on devices with a real GPU adapter.
let webllmEngine: MLCEngine | null = null;
let webllmLoadingPromise: Promise<MLCEngine> | null = null;
let lastWebgpuTokPerSec: number | null = null;

let loadedModelId: ModelId | null = null;
let engineKind: "webgpu" | "wasm" | null = null;
let webGpuAvailablePromise: Promise<boolean> | null = null;

export function isWasmSupported(): boolean {
  return typeof WebAssembly !== "undefined";
}

async function hasWebGpu(): Promise<boolean> {
  if (webGpuAvailablePromise) return webGpuAvailablePromise;
  webGpuAvailablePromise = (async () => {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) return false;
    try {
      // A returned adapter (even a "fallback" one, per the spec) means the
      // browser can actually initialize WebGPU here — the field to avoid is
      // adapter.info.isFallbackAdapter, which moved locations across Chrome
      // versions and isn't worth trusting for a simple go/no-go check.
      const adapter = await (
        navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown | null> } }
      ).gpu.requestAdapter();
      return !!adapter;
    } catch {
      return false;
    }
  })();
  return webGpuAvailablePromise;
}

export async function isStoragePersisted(): Promise<boolean | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted) {
    return null;
  }
  try {
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}

export async function loadEngine(
  modelId: ModelId,
  onProgress?: (progress: ProgressInfo) => void
): Promise<void> {
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  if (typeof navigator !== "undefined" && navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }

  if (engineKind === null) {
    engineKind = (await hasWebGpu()) ? "webgpu" : "wasm";
  }

  if (engineKind === "webgpu") {
    try {
      await loadWebgpuEngine(model.mlcId, onProgress);
      loadedModelId = modelId;
      return;
    } catch (err) {
      // A real adapter existing doesn't guarantee the model actually runs
      // on it (shader-compile OOM, driver quirks, etc.) — fall back to the
      // universal CPU path rather than leaving the device stuck.
      console.error("WebGPU engine failed, falling back to CPU/WASM:", err);
      engineKind = "wasm";
    }
  }

  await loadWasmEngine(model, onProgress);
  loadedModelId = modelId;
}

async function loadWebgpuEngine(
  mlcId: string,
  onProgress?: (progress: ProgressInfo) => void
): Promise<MLCEngine> {
  if (webllmEngine) {
    await webllmEngine.unload().catch(() => {});
    webllmEngine = null;
  }
  if (webllmLoadingPromise) return webllmLoadingPromise;

  webllmLoadingPromise = (async () => {
    const webllm = await import("@mlc-ai/web-llm");
    const engine = await webllm.CreateMLCEngine(mlcId, {
      initProgressCallback: onProgress
        ? (report) =>
            onProgress({
              loaded: Math.round(report.progress * 1000),
              total: 1000,
              text: report.text,
            })
        : undefined,
    });
    webllmEngine = engine;
    webllmLoadingPromise = null;
    return engine;
  })();

  return webllmLoadingPromise;
}

async function loadWasmEngine(
  model: (typeof AVAILABLE_MODELS)[number],
  onProgress?: (progress: ProgressInfo) => void
): Promise<Wllama> {
  if (wllama && loadedModelId === model.id) {
    return wllama;
  }

  if (wllamaLoadingPromise) {
    return wllamaLoadingPromise;
  }

  wllamaLoadingPromise = (async () => {
    if (wllama) {
      await wllama.exit().catch(() => {});
      wllama = null;
    }

    const instance = new Wllama(
      { default: "/wllama/wllama.wasm" },
      { allowOffline: true }
    );

    // wllama's multi-thread startup speculatively tries to allocate a large
    // (up to 4GB) SharedArrayBuffer-backed WASM memory block, stepping down
    // in ~128MB increments until one succeeds. On a desktop with plenty of
    // RAM that's a non-issue; on a phone it can plausibly thrash the whole
    // device, not just this tab, while it works through failing attempts —
    // a very plausible cause of "lagging everywhere, not just generation".
    // Force single-thread on mobile to skip that path entirely: slower
    // tokens/sec, but avoids that memory-pressure cliff.
    const isMobile =
      typeof navigator !== "undefined" && /Mobi|Android/i.test(navigator.userAgent);

    const loadParams = {
      // Smaller context = smaller KV-cache allocation up front. On a
      // memory-constrained phone (often a few hundred MB per tab), a
      // large reserved allocation is a real source of slowdowns and
      // tab kills, not just a theoretical concern — 2048 is still
      // plenty for a short chat/journal conversation.
      n_ctx: isMobile ? 1024 : 2048,
      // llama.cpp's default n_batch (2048) sizes the compute buffer as
      // n_batch * vocab_size; Qwen2.5's vocab is ~152k tokens, so the
      // default alone reserves close to 1GB just for that buffer. That's
      // a strong candidate for the WASM memory-growth abort ("(ABORT)")
      // seen on phones — cut it down hard on mobile since a chat prompt
      // doesn't need a large batch anyway.
      n_batch: isMobile ? 128 : undefined,
      // Tested 2-thread mode here (n_batch capped, so the earlier OOM
      // theory didn't apply): it hung for 60+s on a simple 3-sentence
      // prompt on a desktop with plenty of RAM/cores, vs ~13s total on
      // single-thread. That's a real deadlock in this build's pthread
      // sync path, not a speed tradeoff — keep single-thread on mobile.
      n_threads: isMobile ? 1 : undefined,
      progressCallback: onProgress
        ? ({ loaded, total }: { loaded: number; total: number }) =>
            onProgress({ loaded, total })
        : undefined,
    };

    try {
      await instance.loadModelFromHF({ repo: model.repo, file: model.file }, loadParams);
    } catch (err) {
      // Storage eviction on the device can leave stale cache metadata
      // behind (the index says a file is cached, but the actual bytes are
      // gone) — wllama surfaces that as "Model file not found" instead of
      // just re-downloading. Clear the stale entry and retry fresh rather
      // than surfacing that as a scary, unrecoverable error.
      const isStaleCacheError =
        err instanceof Error && /model file not found/i.test(err.message);
      if (!isStaleCacheError) throw err;

      await instance.cacheManager.clear().catch(() => {});
      await instance.loadModelFromHF({ repo: model.repo, file: model.file }, loadParams);
    }

    wllama = instance;
    wllamaLoadingPromise = null;
    return instance;
  })();

  return wllamaLoadingPromise;
}

export function getLoadedModelId(): ModelId | null {
  return loadedModelId;
}

export function getEngineKind(): "webgpu" | "wasm" | null {
  return engineKind;
}

// Both engines cache to browser storage independently (wllama to OPFS via
// CacheManager, web-llm to the Cache API), and which one a given device
// used depends on WebGPU availability at load time — which could differ
// between visits. Check/delete both so "delete this model" actually frees
// the space regardless of which engine downloaded it.
export async function isModelCached(modelId: ModelId): Promise<boolean> {
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!model) return false;

  const wllamaCached = await new CacheManager()
    .getSize(`${HF_BASE}/${model.repo}/resolve/main/${model.file}`)
    .then((size) => size > 0)
    .catch(() => false);
  if (wllamaCached) return true;

  try {
    const webllm = await import("@mlc-ai/web-llm");
    return await webllm.hasModelInCache(model.mlcId);
  } catch {
    return false;
  }
}

export async function deleteModelCache(modelId: ModelId): Promise<void> {
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!model) return;

  if (loadedModelId === modelId) {
    if (wllama) {
      await wllama.exit().catch(() => {});
      wllama = null;
    }
    if (webllmEngine) {
      await webllmEngine.unload().catch(() => {});
      webllmEngine = null;
    }
    loadedModelId = null;
  }

  await new CacheManager()
    .delete(`${HF_BASE}/${model.repo}/resolve/main/${model.file}`)
    .catch(() => {});

  try {
    const webllm = await import("@mlc-ai/web-llm");
    await webllm.deleteModelAllInfoInCache(model.mlcId);
  } catch {
    // Not cached via web-llm, or web-llm unavailable — nothing to do.
  }
}

export function getLastStatsText(): string | null {
  if (engineKind === "webgpu") {
    if (!lastWebgpuTokPerSec) return null;
    return `${lastWebgpuTokPerSec.toFixed(1)} tokens/sec (GPU)`;
  }
  if (!lastWasmTimings?.predicted_per_second) return null;
  return `${lastWasmTimings.predicted_per_second.toFixed(1)} tokens/sec`;
}

export async function* streamChat(
  messages: ChatCompletionMessage[]
): AsyncGenerator<string> {
  if (engineKind === "webgpu") {
    yield* streamWebgpuChat(messages);
    return;
  }
  yield* streamWasmChat(messages);
}

async function* streamWebgpuChat(
  messages: ChatCompletionMessage[]
): AsyncGenerator<string> {
  if (!webllmEngine) {
    throw new Error("Engine not loaded yet");
  }

  const result = await webllmEngine.chat.completions.create({
    messages: messages as never,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 150,
    temperature: 0.7,
    top_p: 0.9,
  });

  for await (const chunk of result) {
    const usage = chunk.usage as { extra?: { decode_tokens_per_s?: number } } | undefined;
    if (usage?.extra?.decode_tokens_per_s) {
      lastWebgpuTokPerSec = usage.extra.decode_tokens_per_s;
    }
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

async function* streamWasmChat(
  messages: ChatCompletionMessage[]
): AsyncGenerator<string> {
  if (!wllama) {
    throw new Error("Engine not loaded yet");
  }

  const result = await wllama.createChatCompletion({
    messages,
    stream: true,
    timings_per_token: true,
    // Caps worst-case wall-clock wait on slow phone CPUs; the system
    // prompt already asks for 1-3 sentences, so this is just a safety
    // ceiling, not the typical reply length.
    max_tokens: 150,
    // Small models (0.5B-3B) degrade into repetition/rambling without these —
    // temperature alone isn't enough sampling control for low-parameter models.
    temp: 0.7,
    top_p: 0.9,
    min_p: 0.05,
    penalty_repeat: 1.15,
    penalty_last_n: 128,
  });

  for await (const chunk of result) {
    if (chunk.timings) lastWasmTimings = chunk.timings;
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
