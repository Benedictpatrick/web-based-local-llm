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

  // Without this, the model file is written to browser storage as
  // "best-effort" — Chrome (especially on phones with limited space) can
  // silently evict it between sessions, causing a full re-download every
  // time even though nothing actually failed. This requests a durable grant
  // instead. Chrome is far more likely to grant it for an installed PWA /
  // bookmarked site than a plain one-off tab.
  if (typeof navigator !== "undefined" && navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }

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
      n_ctx: 2048,
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
    if (chunk.timings) lastTimings = chunk.timings;
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
