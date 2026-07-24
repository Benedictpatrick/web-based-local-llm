import type {
  Wllama,
  ChatCompletionMessage,
} from "@wllama/wllama/esm/index.js";
import type { ChatOptions as WebllmChatOptions, MLCEngine } from "@mlc-ai/web-llm";
import type { Provider } from "@/lib/brandIcons";

const HF_BASE = "https://huggingface.co";

export type ModelCategory =
  | "tiny"
  | "balanced"
  | "powerful"
  | "coding"
  | "math"
  | "reasoning"
  | "uncensored";

export interface ModelEntry {
  id: string;
  label: string;
  /** MLC-format id used by the WebGPU (web-llm) engine. Omit for models with
   *  no MLC-compiled build available -- these only run on WASM regardless of
   *  whether the device supports WebGPU. See isWasmOnly. */
  mlcId?: string;
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
  // No MLC-compiled build exists for this anywhere (checked): community
  // fine-tunes like this only get GGUF quantizations, not the WebGPU-format
  // conversion MLC requires. WASM-only, so no mlcId -- see isWasmOnly.
  {
    id: "llama3.2-3b-uncensored",
    label: "Llama 3.2 3B Uncensored (~2.2GB)",
    repo: "bartowski/Llama-3.2-3B-Instruct-uncensored-GGUF",
    file: "Llama-3.2-3B-Instruct-uncensored-Q4_K_M.gguf",
    hubDescription: "Community fine-tune of Llama 3.2 3B with refusal behavior removed.",
    sizeGB: 2.24,
    category: "uncensored",
    provider: "meta",
  },
];

export type ModelId = (typeof AVAILABLE_MODELS)[number]["id"];

/** True for Model Hub entries with no verified WASM fallback — these only
 *  run on WebGPU and are hidden on WASM-only devices. */
export function isWebgpuOnly(model: Pick<ModelEntry, "repo" | "file">): boolean {
  return !model.repo || !model.file;
}

/** True for entries with no MLC-compiled build — these only run on the WASM
 *  (wllama) engine, even on devices that do support WebGPU. */
export function isWasmOnly(model: Pick<ModelEntry, "mlcId">): boolean {
  return !model.mlcId;
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

/** How long a load can go with zero progress-callback activity before it's
 *  treated as stalled. Mobile networks are the main reason this exists: a
 *  WiFi/cellular handoff or a backgrounded tab can leave a fetch neither
 *  resolving nor rejecting, and without this, that hangs the app forever
 *  (see withStallWatchdog below for why a plain timeout isn't enough). */
export const STALL_TIMEOUT_MS = 20_000;

export class LoadStalledError extends Error {
  constructor() {
    super("Loading stalled with no progress. This usually means a flaky connection.");
    this.name = "LoadStalledError";
  }
}

/**
 * Races `run` against a "no progress for STALL_TIMEOUT_MS" watchdog, so a
 * stalled fetch (common on mobile: network handoff, backgrounded tab) fails
 * fast instead of hanging forever. `run` receives a `touch()` callback to
 * invoke from its own progress handler to reset the stall clock.
 *
 * The underlying `run` promise cannot actually be cancelled -- there's no
 * public API to abort a web-llm/wllama fetch -- so when the watchdog wins
 * the race, that promise keeps running orphaned in the background. Callers
 * must guard their own state writes with an attempt-id check so a late
 * resolution from an abandoned attempt can't clobber a newer one.
 */
export function withStallWatchdog<T>(run: (touch: () => void) => Promise<T>): Promise<T> {
  let lastProgressAt = performance.now();
  const touch = () => {
    lastProgressAt = performance.now();
  };
  const attempt = run(touch);
  attempt.catch(() => {}); // mark handled so losing the race isn't an unhandled rejection
  const watchdog = new Promise<never>((_, reject) => {
    const interval = setInterval(() => {
      if (performance.now() - lastProgressAt > STALL_TIMEOUT_MS) {
        clearInterval(interval);
        reject(new LoadStalledError());
      }
    }, 2000);
    // .finally() returns a derived promise that mirrors attempt's rejection;
    // it's only here for the clearInterval side effect and nothing else
    // consumes it, so without this catch a genuine load failure surfaces as
    // an unhandled promise rejection on top of the real, handled one above.
    attempt.finally(() => clearInterval(interval)).catch(() => {});
  });
  return Promise.race([attempt, watchdog]);
}

let wllama: Wllama | null = null;
let wllamaLoadingPromise: Promise<Wllama> | null = null;
let wllamaAttemptId = 0;

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
let webllmAttemptId = 0;

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

  // Re-checked (not read from the `engineKind` cache) on every call: hasWebGpu()
  // is memoized so this is cheap, and it means a single transient WebGPU
  // failure (a stall, a one-off context loss) can't permanently downgrade the
  // whole session to WASM. `engineKind` below only *records* which engine is
  // currently active for getEngineKind() -- it must not gate this decision.
  if (!isWasmOnly(model) && (await hasWebGpu())) {
    try {
      await loadWebgpuEngine(model.mlcId!, onProgress);
      engineKind = "webgpu";
      loadedModelId = modelId;
      return;
    } catch (err) {
      console.error("WebGPU engine failed:", err);
      // No WASM fallback to drop to, so this load is done either way. Surface
      // the real failure (network/CORS/stall/etc) instead of the misleading
      // "requires WebGPU" message below, which is only true when WebGPU
      // itself is unavailable -- not when it's available but this attempt
      // failed for some other reason.
      if (isWebgpuOnly(model)) throw err;
    }
  }

  if (isWebgpuOnly(model)) {
    throw new Error(`${model.label} requires WebGPU, which isn't available on this device.`);
  }

  await loadWasmEngine(model, onProgress);
  engineKind = "wasm";
  loadedModelId = modelId;
}

/** Per-model ChatOptions overrides for models whose bundled web-llm config is
 *  broken as shipped. Gemma 3 1B's downloaded mlc-chat-config.json sets a
 *  positive sliding_window_size on top of web-llm's own context_window_size
 *  override, and the engine refuses to start with both positive: "Only one
 *  of context_window_size and sliding_window_size can be positive."
 *
 *  Resolve it by dropping *our* context_window_size override instead of the
 *  model's sliding_window_size: Gemma 3's local/global attention layers are
 *  compiled expecting the sliding-window KV cache path (engine's
 *  slidingWindowSize != -1 branch), and disabling it produced gibberish --
 *  attention math the compiled weights weren't trained/compiled for, not a
 *  cache-capacity issue. The model's own sliding_window_size still caps
 *  prompt length (see engine's ContextWindowSizeExceededError, gated on
 *  slidingWindowSize == -1), so no context limit is lost by removing ours. */
const CHAT_OPTS_OVERRIDES: Partial<Record<string, WebllmChatOptions>> = {
  "gemma3-1b-it-q4f16_1-MLC": { context_window_size: -1 },
};

async function loadWebgpuEngine(
  mlcId: string,
  onProgress?: (progress: ProgressInfo) => void
): Promise<MLCEngine> {
  if (webllmEngine) {
    await webllmEngine.unload().catch(() => {});
    webllmEngine = null;
  }
  if (webllmLoadingPromise) return webllmLoadingPromise;

  const myAttemptId = ++webllmAttemptId;

  webllmLoadingPromise = withStallWatchdog((touch) =>
    (async () => {
      try {
        const webllm = await import("@mlc-ai/web-llm");
        const engine = await webllm.CreateMLCEngine(
          mlcId,
          {
            initProgressCallback: (report) => {
              touch();
              onProgress?.({
                loaded: Math.round(report.progress * 1000),
                total: 1000,
                text: report.text,
              });
            },
          },
          CHAT_OPTS_OVERRIDES[mlcId]
        );
        if (myAttemptId === webllmAttemptId) {
          webllmEngine = engine;
          webllmMlcId = mlcId;
        }
        return engine;
      } finally {
        if (myAttemptId === webllmAttemptId) webllmLoadingPromise = null;
      }
    })()
  );

  // If the watchdog wins the race, the finally above never runs (the real
  // attempt is still hanging), so this is what actually frees the singleton
  // for a fresh retry.
  webllmLoadingPromise.catch(() => {
    if (myAttemptId === webllmAttemptId) webllmLoadingPromise = null;
  });

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

  const myAttemptId = ++wllamaAttemptId;

  wllamaLoadingPromise = withStallWatchdog((touch) =>
    (async () => {
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

      // Once the download itself hits 100%, wllama moves into parsing the
      // GGUF and building the WASM-side context -- a CPU-bound step with no
      // progress callbacks of its own. For large enough models that step can
      // legitimately take longer than STALL_TIMEOUT_MS, and with no further
      // callback to touch() the watchdog, it reads as a stalled connection
      // even though the network part is long done. Once we've seen the
      // download complete, keep touching on an interval so this phase can't
      // be mistaken for flakiness -- there's no "connection" left to stall.
      let postDownloadHeartbeat: ReturnType<typeof setInterval> | null = null;
      const loadParams = {
        n_ctx: nCtx,
        n_batch: isLowMemory ? 64 : isMobile ? 128 : undefined,
        n_threads: isMobile ? 1 : undefined,
        progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
          touch();
          onProgress?.({ loaded, total });
          if (loaded >= total && !postDownloadHeartbeat) {
            postDownloadHeartbeat = setInterval(touch, 5000);
          }
        },
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

        if (myAttemptId === wllamaAttemptId) {
          wllama = instance;
          loadedNCtx = nCtx;
        }
        return instance;
      } finally {
        if (postDownloadHeartbeat) clearInterval(postDownloadHeartbeat);
        if (myAttemptId === wllamaAttemptId) wllamaLoadingPromise = null;
      }
    })()
  );

  // If the watchdog wins the race, the finally above never runs (the real
  // attempt is still hanging), so this is what actually frees the singleton
  // for a fresh retry.
  wllamaLoadingPromise.catch(() => {
    if (myAttemptId === wllamaAttemptId) wllamaLoadingPromise = null;
  });

  return wllamaLoadingPromise;
}

/** Forces the next loadEngine() call to do a real rebuild instead of hitting
 *  the "already loaded" short-circuit at the top of loadWasmEngine/
 *  loadWebgpuEngine. Needed before recovering from an engine-lost/desynced
 *  error raised mid-generation: those state guards only see a normal
 *  `loadedModelId`/`wllama` pair, so without this the "reload" would just
 *  hand back the same broken engine. Teardown itself intentionally best-
 *  effort (`.catch(() => {})`): the engine is already known-bad, so a
 *  failure here shouldn't block the rebuild. */
export function invalidateEngine(): void {
  if (wllama) {
    wllama.exit().catch(() => {});
    wllama = null;
  }
  if (webllmEngine) {
    webllmEngine.unload().catch(() => {});
    webllmEngine = null;
    webllmMlcId = null;
  }
  loadedModelId = null;
  engineKind = null;
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

  // getSize() only accepts the hashed storage key from getNameFromURL()/list(),
  // not a raw URL -- wllama stores cached files under sha1(url), so passing
  // the URL straight through always misses, even for a genuinely cached file.
  const wllamaCached = model.repo && model.file
    ? await importWllama()
        .then(async ({ CacheManager }) => {
          const cacheManager = new CacheManager();
          const key = await cacheManager.getNameFromURL(
            `${HF_BASE}/${model.repo}/resolve/main/${model.file}`
          );
          return cacheManager.getSize(key);
        })
        .then((size) => size > 0)
        .catch(() => false)
    : false;
  if (wllamaCached) return true;
  if (!model.mlcId) return false;

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

  if (model.mlcId) {
    try {
      const webllm = await import("@mlc-ai/web-llm");
      await webllm.deleteModelAllInfoInCache(model.mlcId);
    } catch {}
  }
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

export type ModelPurpose = "general" | "coding" | "math" | "reasoning" | "explore";
export type SpeedPreference = "fast" | "balanced" | "quality";

export type ModelRecommendation = {
  model: ModelEntry;
  reason: string;
};

/**
 * Turns a couple of quick answers into one specific model instead of leaving
 * the user to compare 18 similar-looking cards. Only the 3 original baseline
 * models (llama3.2-1b, gemma2-2b, llama3.2-3b) have a WASM fallback -- every
 * other catalog entry is WebGPU-only -- so on a device without WebGPU this
 * always falls back to one of those 3, regardless of purpose, rather than
 * recommending something the device can't actually run.
 */
export function recommendModel(
  purpose: ModelPurpose,
  speed: SpeedPreference,
  hasWebGpuSupport: boolean,
  memoryGb: number | null
): ModelRecommendation {
  const byId = (id: ModelId) => AVAILABLE_MODELS.find((m) => m.id === id)!;

  if (!hasWebGpuSupport) {
    if (purpose === "explore" || speed === "fast") {
      return {
        model: byId("llama3.2-1b"),
        reason:
          "Your device doesn't support WebGPU, so the specialized models aren't available. This is the fastest model that still runs, over WASM/CPU.",
      };
    }
    return {
      model: byId("llama3.2-3b"),
      reason:
        "Your device doesn't support WebGPU, so the specialized models aren't available. This is the strongest general model that still runs, over WASM/CPU.",
    };
  }

  switch (purpose) {
    case "coding":
      return {
        model: byId("qwen2.5-coder-7b"),
        reason: "The only model here built specifically for code: tuned for generation and debugging.",
      };
    case "math":
      return {
        model: byId("qwen2.5-math-1.5b"),
        reason: "Small and tuned specifically for solving math problems step by step.",
      };
    case "reasoning":
      return {
        model: byId("deepseek-r1-qwen-7b"),
        reason: "Distilled from DeepSeek R1: shows its reasoning before giving a final answer.",
      };
    case "explore":
      return {
        model: byId("smollm2-360m"),
        reason: "The smallest model in the catalog (0.4GB) — the fastest way to try Navo out.",
      };
    case "general":
    default: {
      if (speed === "fast") {
        return {
          model: byId("llama3.2-1b"),
          reason: "Meta's smallest Llama: quick replies without a long download.",
        };
      }
      if (speed === "quality") {
        const model = byId("qwen2.5-7b");
        if (isLikelyTooLargeForDevice(model.sizeGB, memoryGb)) {
          return {
            model: byId("llama3.2-3b"),
            reason:
              "Your device reports limited memory, so the largest general model likely won't fit. This is the best generalist that should still run comfortably.",
          };
        }
        return {
          model,
          reason: "Alibaba's flagship small model — excellent general reasoning and writing when you want the best answers.",
        };
      }
      return {
        model: byId("llama3.2-3b"),
        reason: "The best balance of quality and speed for everyday chat.",
      };
    }
  }
}

export type ChatOptions = { temperature?: number; maxTokens?: number };

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
    /model not loaded|device.*lost|engine not loaded/i.test(err.message) ||
    // wllama's JS<->worker "glue" message framing rejects a message whose
    // leading bytes don't match its own protocol magic (unrelated to GGUF
    // file parsing). In practice this only shows up when a new completion
    // request gets sent to the wasm worker while a prior one is still being
    // torn down (e.g. the stuck-generation watchdog aborting and immediately
    // retrying) -- the worker's message stream desyncs. There's no way to
    // resume a desynced worker, so treat it the same as engine-lost: reload.
    /invalid magic number/i.test(err.message)
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
    max_tokens: opts?.maxTokens ?? 768,
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
    max_tokens: opts?.maxTokens ?? 512,
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
