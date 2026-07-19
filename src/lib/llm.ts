import {
  Wllama,
  CacheManager,
  WllamaAbortError,
  type ChatCompletionMessage,
} from "@wllama/wllama/esm/index.js";
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

export type GenerationStats = {
  engine: "webgpu" | "wasm";
  tokens: number;
  seconds: number;
  tokensPerSec: number;
};

let wllama: Wllama | null = null;
let wllamaLoadingPromise: Promise<Wllama> | null = null;

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

/** True when the browser reports <=2GB of device memory. Under-reports on some devices
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

async function hasWebGpu(): Promise<boolean> {
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
        await instance.loadModelFromHF({ repo: model.repo, file: model.file }, loadParams);
      } catch (err) {
        const isStaleCacheError =
          err instanceof Error && /model file not found/i.test(err.message);
        if (!isStaleCacheError) throw err;

        await instance.cacheManager.clear().catch(() => {});
        await instance.loadModelFromHF({ repo: model.repo, file: model.file }, loadParams);
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
  } catch {}
}

export function getLastGenerationStats(): GenerationStats | null {
  return lastGenerationStats;
}

/** Context window size in tokens for the loaded WASM model, or null (WebGPU uses the model's built-in default). */
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
  return err instanceof WllamaAbortError || (err instanceof Error && err.name === "AbortError");
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
