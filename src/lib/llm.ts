import { Wllama, type ChatCompletionMessage } from "@wllama/wllama/esm/index.js";

export const AVAILABLE_MODELS = [
  {
    id: "qwen2.5-0.5b",
    label: "Qwen2.5 0.5B (fastest, ~0.5GB)",
    repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
    file: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
  },
  {
    id: "qwen2.5-1.5b",
    label: "Qwen2.5 1.5B (balanced, ~1GB)",
    repo: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
  },
  {
    id: "qwen2.5-3b",
    label: "Qwen2.5 3B (better quality, ~2GB)",
    repo: "Qwen/Qwen2.5-3B-Instruct-GGUF",
    file: "qwen2.5-3b-instruct-q4_k_m.gguf",
  },
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number]["id"];

let wllama: Wllama | null = null;
let loadedModelId: ModelId | null = null;
let loadingPromise: Promise<Wllama> | null = null;
let lastTimings: { predicted_per_second?: number } | null = null;

export function isWasmSupported(): boolean {
  return typeof WebAssembly !== "undefined";
}

export async function loadEngine(
  modelId: ModelId,
  onProgress?: (progress: { loaded: number; total: number }) => void
): Promise<Wllama> {
  if (wllama && loadedModelId === modelId) {
    return wllama;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  loadingPromise = (async () => {
    if (wllama) {
      await wllama.exit().catch(() => {});
      wllama = null;
      loadedModelId = null;
    }

    const instance = new Wllama(
      { default: "/wllama/wllama.wasm" },
      { allowOffline: true }
    );
    await instance.loadModelFromHF(
      { repo: model.repo, file: model.file },
      {
        n_ctx: 4096,
        progressCallback: onProgress
          ? ({ loaded, total }) => onProgress({ loaded, total })
          : undefined,
      }
    );
    wllama = instance;
    loadedModelId = modelId;
    loadingPromise = null;
    return instance;
  })();

  return loadingPromise;
}

export function getLoadedModelId(): ModelId | null {
  return loadedModelId;
}

export function getLastStatsText(): string | null {
  if (!lastTimings?.predicted_per_second) return null;
  return `${lastTimings.predicted_per_second.toFixed(1)} tokens/sec`;
}

export async function* streamChat(
  messages: ChatCompletionMessage[]
): AsyncGenerator<string> {
  if (!wllama) {
    throw new Error("Engine not loaded yet");
  }

  const result = await wllama.createChatCompletion({
    messages,
    stream: true,
    timings_per_token: true,
    max_tokens: 220,
    // Small models (0.5B-3B) degrade into repetition/rambling without these —
    // temperature alone isn't enough sampling control for low-parameter models.
    temp: 0.7,
    top_p: 0.9,
    min_p: 0.05,
    penalty_repeat: 1.15,
    penalty_last_n: 128,
  });

  for await (const chunk of result) {
    if (chunk.timings) lastTimings = chunk.timings;
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
