import type {
  Wllama,
  ChatCompletionMessage,
} from "@wllama/wllama/esm/index.js";
import type { MLCEngine } from "@mlc-ai/web-llm";
import type { Provider } from "@/lib/brandIcons";

const HF_BASE = "https://huggingface.co";

export type ModelCategory =
  | "tiny"
  | "balanced"
  | "powerful"
  | "coding"
  | "math"
  | "reasoning";

export interface ModelEntry {
  id: string;
  label: string;
  /** MLC-format id used by the WebGPU (web-llm) engine. Always required. */
  mlcId: string;
  /** GGUF repo/file used by the WASM (wllama) fallback engine. Models without
   *  these only run on WebGPU — see webgpuOnly. */
  repo?: string;
  file?: string;
  /** One-line blurb shown in the Model Hub browsing UI. */
  hubDescription?: string;
  /** Approximate download/VRAM size in GB, for the Hub's size badge and the
   *  low-memory-device warning. */
  sizeGB: number;
  /** Store-style genre tag shown on Hub cards. */
  category: ModelCategory;
  /** Who makes this model, for the Hub's company filter and badge. */
  provider: Provider;
}

/** The original 3 models: hand-verified on both WebGPU and WASM, and the
 *  only ones offered before a device has picked a model at all. */
export const AVAILABLE_MODELS: ModelEntry[] = [
  {
    id: "llama3.2-1b",
    label: "Llama 3.2 1B (fastest, ~0.7GB)",
    repo: "bartowski/Llama-3.2-1B-Instruct-GGUF",
    file: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    mlcId: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    sizeGB: 0.7,
    category: "tiny",
    provider: "meta",
  },
  {
    id: "gemma2-2b",
    label: "Gemma 2 2B (balanced, ~1.6GB)",
    repo: "bartowski/gemma-2-2b-it-GGUF",
    file: "gemma-2-2b-it-Q4_K_M.gguf",
    mlcId: "gemma-2-2b-it-q4f16_1-MLC",
    sizeGB: 1.6,
    category: "balanced",
    provider: "google",
  },
  {
    id: "llama3.2-3b",
    label: "Llama 3.2 3B (better quality, ~1.9GB)",
    repo: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    file: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    mlcId: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    sizeGB: 1.9,
    category: "balanced",
    provider: "meta",
  },
  // Model Hub additions below. WebGPU-only: mlcId values are copied verbatim
  // from @mlc-ai/web-llm's own prebuiltAppConfig.model_list, which is the
  // authoritative, tested catalog for that engine. None have a matching
  // hand-verified GGUF file, so they're skipped entirely on WASM-only
  // devices (see webgpuOnly() below) rather than risk a broken download.
  {
    id: "llama3.1-8b",
    label: "Llama 3.1 8B (powerful, ~4.9GB)",
    mlcId: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
    hubDescription: "Meta's larger general purpose model. A strong generalist if your device can take it.",
    sizeGB: 4.9,
    category: "powerful",
    provider: "meta",
  },
  {
    id: "qwen2.5-7b",
    label: "Qwen 2.5 7B (powerful, ~5GB)",
    mlcId: "Qwen2.5-7B-Instruct-q4f16_1-MLC",
    hubDescription: "Alibaba's flagship small model. Excellent general reasoning and writing.",
    sizeGB: 5,
    category: "powerful",
    provider: "qwen",
  },
  {
    id: "qwen2.5-3b",
    label: "Qwen 2.5 3B (balanced, ~2.4GB)",
    mlcId: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    hubDescription: "A lighter Qwen 2.5, good middle ground between speed and quality.",
    sizeGB: 2.4,
    category: "balanced",
    provider: "qwen",
  },
  {
    id: "qwen2.5-0.5b",
    label: "Qwen 2.5 0.5B (tiny, ~0.9GB)",
    mlcId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    hubDescription: "Very small and fast. Best for quick, simple questions on weaker devices.",
    sizeGB: 0.9,
    category: "tiny",
    provider: "qwen",
  },
  {
    id: "qwen2.5-coder-7b",
    label: "Qwen 2.5 Coder 7B (coding, ~5GB)",
    mlcId: "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC",
    hubDescription: "Tuned specifically for code generation and debugging.",
    sizeGB: 5,
    category: "coding",
    provider: "qwen",
  },
  {
    id: "qwen2.5-math-1.5b",
    label: "Qwen 2.5 Math 1.5B (math, ~1.6GB)",
    mlcId: "Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC",
    hubDescription: "Tuned specifically for math problem solving and reasoning that shows each step.",
    sizeGB: 1.6,
    category: "math",
    provider: "qwen",
  },
  {
    id: "phi-3.5-mini",
    label: "Phi 3.5 Mini (balanced, ~3.6GB)",
    mlcId: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    hubDescription: "Microsoft's efficient midsize model, strong for its footprint.",
    sizeGB: 3.6,
    category: "balanced",
    provider: "microsoft",
  },
  {
    id: "phi-4-mini",
    label: "Phi 4 Mini (powerful, ~3.4GB)",
    mlcId: "Phi-4-mini-instruct-q4f16_1-MLC",
    hubDescription: "Microsoft's newest small model. Better reasoning than Phi 3.5 at a similar size.",
    sizeGB: 3.4,
    category: "powerful",
    provider: "microsoft",
  },
  {
    id: "mistral-7b-v0.3",
    label: "Mistral 7B v0.3 (powerful, ~4.5GB)",
    mlcId: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
    hubDescription: "An established, well rounded open model.",
    sizeGB: 4.5,
    category: "powerful",
    provider: "mistral",
  },
  {
    id: "gemma2-9b",
    label: "Gemma 2 9B (powerful, ~6.3GB)",
    mlcId: "gemma-2-9b-it-q4f16_1-MLC",
    hubDescription: "Google's larger Gemma 2. Needs a capable GPU but gives noticeably better answers.",
    sizeGB: 6.3,
    category: "powerful",
    provider: "google",
  },
  {
    id: "gemma3-1b",
    label: "Gemma 3 1B (tiny, ~0.7GB)",
    mlcId: "gemma3-1b-it-q4f16_1-MLC",
    hubDescription: "Google's newest generation at a very small size.",
    sizeGB: 0.7,
    category: "tiny",
    provider: "google",
  },
  {
    id: "smollm2-1.7b",
    label: "SmolLM2 1.7B (fast, ~1.7GB)",
    mlcId: "SmolLM2-1.7B-Instruct-q4f16_1-MLC",
    hubDescription: "Hugging Face's compact model, built to punch above its size.",
    sizeGB: 1.7,
    category: "tiny",
    provider: "huggingface",
  },
  {
    id: "smollm2-360m",
    label: "SmolLM2 360M (tiny, ~0.4GB)",
    mlcId: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    hubDescription: "Extremely small and fast. Best for simple tasks on low power devices.",
    sizeGB: 0.4,
    category: "tiny",
    provider: "huggingface",
  },
  {
    id: "deepseek-r1-qwen-7b",
    label: "DeepSeek R1 Distill Qwen 7B (reasoning, ~5GB)",
    mlcId: "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC",
    hubDescription: "Distilled from DeepSeek R1, shows its reasoning steps before answering.",
    sizeGB: 5,
    category: "reasoning",
    provider: "deepseek",
  },
  {
    id: "qwen3-4b",
    label: "Qwen 3 4B (balanced, ~3.4GB)",
    mlcId: "Qwen3-4B-q4f16_1-MLC",
    hubDescription: "The latest Qwen generation at a midrange size.",
    provider: "qwen",
    sizeGB: 3.4,
    category: "balanced",
  },
];

export type ModelId = (typeof AVAILABLE_MODELS)[number]["id"];

/** True for Model Hub entries with no verified WASM fallback — these only
 *  run on WebGPU and are hidden on WASM-only devices. */
export function isWebgpuOnly(model: Pick<ModelEntry, "repo" | "file">): boolean {
  return !model.repo || !model.file;
}

/** Splits a label like "Llama 3.2 3B (better quality, ~1.9GB)" into a clean
 *  name and a "qualifier · size" meta string, so callers can show the size
 *  as a muted secondary line/badge instead of cramming it into the name. */
export function modelDisplayParts(model: Pick<ModelEntry, "label">): {
  name: string;
  meta: string | null;
} {
  const match = model.label.match(/^(.*?)\s*\(([^,]+),\s*~?([\d.]+)\s*GB\)\s*$/);
  if (!match) return { name: model.label, meta: null };
  const [, name, qualifier, size] = match;
  return { name, meta: `${qualifier} · ${size} GB` };
}
export type ProgressInfo = { loaded: number; total: number; text?: string };

export type GenerationStats = {
  engine: "webgpu" | "wasm";
  tokens: number;
  seconds: number;
  tokensPerSec: number;
};

let wllama: Wllama | null = null;
let wllamaLoadingPromise: Promise<Wllama> | null = null;

/**
 * Loads the wllama bundle on demand. It is only needed for the WASM fallback
 * path, so keeping it out of the initial bundle spares every WebGPU user the
 * download.
 */
function importWllama() {
  return import("@wllama/wllama/esm/index.js");
}

let webllmEngine: MLCEngine | null = null;
let webllmLoadingPromise: Promise<MLCEngine> | null = null;
let webllmMlcId: string | null = null;

let lastGenerationStats: GenerationStats | null = null;
let loadedNCtx: number | null = null;

let loadedModelId: ModelId | null = null;
let engineKind: "webgpu" | "wasm" | null = null;
let webGpuAvailablePromise: Promise<boolean> | null = null;

let wasmAbortController: AbortController | null = null;

export function isWasmSupported(): boolean {
  return typeof WebAssembly !== "undefined";
}

function isMobileDevice(): boolean {
  return typeof navigator !== "undefined" && /Mobi|Android/i.test(navigator.userAgent);
}

/** True when the browser reports <=2GB of device memory. Reports low on some devices
 *  (deviceMemory is capped/rounded for fingerprinting) but is the best signal available. */
function isLowMemoryDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  return typeof mem === "number" && mem <= 2;
}

export async function getDefaultModelId(): Promise<ModelId> {
  if (isMobileDevice()) return "llama3.2-1b";
  return (await hasWebGpu()) ? "llama3.2-3b" : "llama3.2-1b";
}

export async function hasWebGpu(): Promise<boolean> {
  if (webGpuAvailablePromise) return webGpuAvailablePromise;
  webGpuAvailablePromise = (async () => {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) return false;
    try {
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

/**
 * Asks the browser to keep this origin's storage durable so the cached model
 * weights are not evicted between visits, and returns the resulting state.
 * On Chrome this is decided by engagement heuristics with no prompt; on Firefox
 * it may prompt. Already-granted storage resolves true without re-prompting.
 * Returns null when the API is unavailable.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return null;
  }
  try {
    return await navigator.storage.persist();
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

  if (engineKind === null) {
    engineKind = (await hasWebGpu()) ? "webgpu" : "wasm";
  }

  if (engineKind === "webgpu") {
    try {
      await loadWebgpuEngine(model.mlcId, onProgress);
      loadedModelId = modelId;
      return;
    } catch (err) {
      console.error("WebGPU engine failed, falling back to CPU/WASM:", err);
      engineKind = "wasm";
    }
  }

  if (isWebgpuOnly(model)) {
    throw new Error(`${model.label} requires WebGPU, which isn't available on this device.`);
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
    try {
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
      webllmMlcId = mlcId;
      return engine;
    } finally {
      webllmLoadingPromise = null;
    }
  })();

  return webllmLoadingPromise;
}

async function loadWasmEngine(
  model: (typeof AVAILABLE_MODELS)[number],
  onProgress?: (progress: ProgressInfo) => void
): Promise<Wllama> {
  // Callers must check isWebgpuOnly() first; loadEngine() already does.
  if (!model.repo || !model.file) {
    throw new Error(`${model.label} has no WASM fallback and requires WebGPU.`);
  }
  const { repo, file } = model;

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

    const { Wllama } = await importWllama();
    const instance = new Wllama(
      { default: "/wllama/wllama.wasm" },
      { allowOffline: true }
    );

    const isMobile = isMobileDevice();
    const isLowMemory = isLowMemoryDevice();
    const nCtx = isLowMemory ? 512 : isMobile ? 1024 : 2048;

    const loadParams = {
      n_ctx: nCtx,
      n_batch: isLowMemory ? 64 : isMobile ? 128 : undefined,
      n_threads: isMobile ? 1 : undefined,
      progressCallback: onProgress
        ? ({ loaded, total }: { loaded: number; total: number }) =>
            onProgress({ loaded, total })
        : undefined,
    };

    try {
      try {
        await instance.loadModelFromHF({ repo, file }, loadParams);
      } catch (err) {
        const isStaleCacheError =
          err instanceof Error && /model file not found/i.test(err.message);
        if (!isStaleCacheError) throw err;

        await instance.cacheManager.clear().catch(() => {});
        await instance.loadModelFromHF({ repo, file }, loadParams);
      }

      wllama = instance;
      loadedNCtx = nCtx;
      return instance;
    } finally {
      wllamaLoadingPromise = null;
    }
  })();

  return wllamaLoadingPromise;
}

export function getLoadedModelId(): ModelId | null {
  return loadedModelId;
}

export function getEngineKind(): "webgpu" | "wasm" | null {
  return engineKind;
}

export async function isModelCached(modelId: ModelId): Promise<boolean> {
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!model) return false;

  const wllamaCached = model.repo && model.file
    ? await importWllama()
        .then(({ CacheManager }) =>
          new CacheManager().getSize(`${HF_BASE}/${model.repo}/resolve/main/${model.file}`)
        )
        .then((size) => size > 0)
        .catch(() => false)
    : false;
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

  if (model.repo && model.file) {
    await importWllama()
      .then(({ CacheManager }) =>
        new CacheManager().delete(`${HF_BASE}/${model.repo}/resolve/main/${model.file}`)
      )
      .catch(() => {});
  }

  try {
    const webllm = await import("@mlc-ai/web-llm");
    await webllm.deleteModelAllInfoInCache(model.mlcId);
  } catch {}
}

export function getLastGenerationStats(): GenerationStats | null {
  return lastGenerationStats;
}

/** Context window size in tokens for the loaded WASM model, or null (WebGPU uses the model's own default). */
export function getLoadedContextSize(): number | null {
  return engineKind === "wasm" ? loadedNCtx : null;
}

export function getDeviceInfo(): { cores: number | null; memoryGb: number | null } {
  if (typeof navigator === "undefined") return { cores: null, memoryGb: null };
  return {
    cores: navigator.hardwareConcurrency ?? null,
    memoryGb: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
  };
}

/** Rough "will this probably crash the tab" check for a model's size against
 *  the browser's reported device memory. Chrome caps deviceMemory at 8GB for
 *  fingerprinting reasons, so a reported 8 could mean much more — treated as
 *  "enough" rather than guessed at. Unknown memory (Safari, etc.) never warns. */
export function isLikelyTooLargeForDevice(sizeGB: number, memoryGb: number | null): boolean {
  if (memoryGb === null || memoryGb >= 8) return false;
  return sizeGB > memoryGb * 0.6;
}

export type ChatOptions = { temperature?: number };

export async function* streamChat(
  messages: ChatCompletionMessage[],
  opts?: ChatOptions
): AsyncGenerator<string> {
  if (engineKind === "webgpu") {
    yield* streamWebgpuChat(messages, opts);
    return;
  }
  yield* streamWasmChat(messages, opts);
}

export function abortGeneration(): void {
  if (engineKind === "webgpu") {
    webllmEngine?.interruptGenerate();
    return;
  }
  wasmAbortController?.abort();
}

export function isAbortError(err: unknown): boolean {
  // WllamaAbortError sets its own name to "AbortError", so the name check covers it too.
  return err instanceof Error && err.name === "AbortError";
}

export function isEngineLostError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "ModelNotLoadedError" ||
    err.name === "DeviceLostError" ||
    /model not loaded|device.*lost|engine not loaded/i.test(err.message)
  );
}

function createWebgpuCompletion(
  engine: MLCEngine,
  messages: ChatCompletionMessage[],
  opts?: ChatOptions
) {
  return engine.chat.completions.create({
    messages: messages as never,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 768,
    temperature: opts?.temperature ?? 0.5,
    top_p: 0.9,
    repetition_penalty: 1.1,
  });
}

async function* streamWebgpuChat(
  messages: ChatCompletionMessage[],
  opts?: ChatOptions
): AsyncGenerator<string> {
  const engine = webllmEngine;
  if (!engine) {
    throw new Error("Engine not loaded yet");
  }

  let result: Awaited<ReturnType<typeof createWebgpuCompletion>>;
  try {
    result = await createWebgpuCompletion(engine, messages, opts);
  } catch (err) {
    if (!isEngineLostError(err) || !webllmMlcId) throw err;
    await engine.reload(webllmMlcId);
    result = await createWebgpuCompletion(engine, messages, opts);
  }

  for await (const chunk of result) {
    const usage = chunk.usage as
      | {
          completion_tokens?: number;
          extra?: { decode_tokens_per_s?: number; e2e_latency_s?: number };
        }
      | undefined;
    if (usage?.extra?.decode_tokens_per_s) {
      lastGenerationStats = {
        engine: "webgpu",
        tokens: usage.completion_tokens ?? 0,
        seconds: usage.extra.e2e_latency_s ?? 0,
        tokensPerSec: usage.extra.decode_tokens_per_s,
      };
    }
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

async function* streamWasmChat(
  messages: ChatCompletionMessage[],
  opts?: ChatOptions
): AsyncGenerator<string> {
  if (!wllama) {
    throw new Error("Engine not loaded yet");
  }

  wasmAbortController = new AbortController();

  const result = await wllama.createChatCompletion({
    messages,
    stream: true,
    timings_per_token: true,
    abortSignal: wasmAbortController.signal,
    max_tokens: 512,
    temp: opts?.temperature ?? 0.5,
    top_p: 0.9,
    min_p: 0.05,
    penalty_repeat: 1.1,
    penalty_last_n: 128,
  });

  for await (const chunk of result) {
    if (chunk.timings?.predicted_per_second) {
      lastGenerationStats = {
        engine: "wasm",
        tokens: chunk.timings.predicted_n,
        seconds: chunk.timings.predicted_ms / 1000,
        tokensPerSec: chunk.timings.predicted_per_second,
      };
    }
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
