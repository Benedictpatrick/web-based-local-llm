import type { ChatCompletionMessage } from "@wllama/wllama/esm/index.js";
import { abortGeneration, isAbortError, isEngineLostError, streamChat } from "./llm";
import { looksGarbled } from "./garbledOutput";

/** How long a generation can go with no new chunk before it's treated as stuck
 *  (as opposed to just slow) and aborted for a retry. */
const STUCK_GENERATION_TIMEOUT_MS = 45_000;
const MAX_STUCK_RETRIES = 1;
/** Rare WebGPU compute glitches occasionally produce word-salad output
 *  (see garbledOutput.ts); one silent retry clears it in practice, and a
 *  second bad attempt in a row is treated as a real (if unusual) reply
 *  rather than retried forever. */
const MAX_GARBLED_RETRIES = 1;

export interface GenerateOnceOptions {
  temperature?: number;
  /** Caps this generation's length. Omit for the engine's normal default --
   *  only set this where a small model rambling past its instructions would
   *  actually break the surrounding UI (see research.ts's sub-question cap). */
  maxTokens?: number;
  /** Called (rAF-batched) with the full accumulated text so far, for streaming display. */
  onDelta?: (fullTextSoFar: string) => void;
  /** Called when the engine was unloaded mid-generation (e.g. to free memory),
   *  so the caller can trigger a reload; the friendly message is already
   *  substituted into the returned text regardless. */
  onEngineLost?: () => void;
}

/**
 * Runs a single streamed generation to completion, handling the "stuck
 * generation" watchdog/retry and turning engine-lost/abort/generic errors
 * into a friendly message. This is the inner primitive both the agent-mode
 * step loop (Chat.tsx's streamReply) and Navo Research's sub-question/
 * synthesis passes are built on -- callers that need multi-step behavior
 * (agent code execution, research decomposition) layer their own loop on
 * top of repeated calls to this function.
 */
export async function generateOnce(
  messages: ChatCompletionMessage[],
  opts: GenerateOnceOptions = {}
): Promise<{ text: string; aborted: boolean }> {
  let aborted = false;
  let full = "";

  for (let attempt = 0; ; attempt++) {
    full = "";
    let pendingText = "";
    let flushScheduled = false;
    let lastChunkAt = performance.now();
    let sawFirstChunk = false;
    let watchdogFired = false;
    const watchdog = setInterval(() => {
      if (sawFirstChunk && performance.now() - lastChunkAt > STUCK_GENERATION_TIMEOUT_MS) {
        watchdogFired = true;
        abortGeneration();
      }
    }, 2000);

    const scheduleFlush = () => {
      if (flushScheduled) return;
      flushScheduled = true;
      requestAnimationFrame(() => {
        opts.onDelta?.(pendingText);
        flushScheduled = false;
      });
    };

    try {
      for await (const chunk of streamChat(messages, {
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
      })) {
        sawFirstChunk = true;
        lastChunkAt = performance.now();
        full += chunk;
        pendingText = full;
        scheduleFlush();
      }
      clearInterval(watchdog);
      if (watchdogFired) {
        if (attempt < MAX_STUCK_RETRIES) continue;
        console.error("Generation stalled with no response");
        full = full || "Generation stalled — please try again.";
        break;
      }
      if (looksGarbled(full) && attempt < MAX_GARBLED_RETRIES) {
        console.error("Generation looked garbled, retrying once");
        continue;
      }
      break;
    } catch (err) {
      clearInterval(watchdog);
      if (watchdogFired && attempt < MAX_STUCK_RETRIES) {
        continue;
      }
      if (watchdogFired) {
        console.error("Generation stalled with no response", err);
        full = full || "Generation stalled — please try again.";
        break;
      }
      if (isEngineLostError(err)) {
        console.error(err);
        full =
          full ||
          "Your device unloaded the model to free up memory. Reloading it now — please try again in a moment.";
        opts.onEngineLost?.();
      } else if (isAbortError(err)) {
        aborted = true;
        full = full || "Stopped.";
      } else {
        console.error(err);
        const detail = err instanceof Error ? err.message : String(err);
        full = full || `Sorry, generation failed: ${detail}`;
      }
      break;
    }
  }

  return { text: full, aborted };
}
