import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVAILABLE_MODELS,
  LoadStalledError,
  STALL_TIMEOUT_MS,
  isWebgpuOnly,
  recommendModel,
  withStallWatchdog,
} from "./llm";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withStallWatchdog", () => {
  it("rejects with LoadStalledError when the promise makes no progress", async () => {
    const hang = withStallWatchdog(() => new Promise(() => {}));
    hang.catch(() => {});

    // +3s clears both the strict-inequality boundary and the watchdog's 2s
    // poll granularity, so the rejecting tick is guaranteed to fire within
    // this window (see the off-by-one this caught: +1s landed exactly on a
    // tick where elapsed === threshold, which is not "stalled" yet, and the
    // next tick that would trip it fell just outside the advanced window).
    await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS + 3000);

    let error: unknown;
    try {
      await hang;
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(LoadStalledError);
  });

  it("does not stall while touch() is called before the timeout elapses", async () => {
    let resolveRun: (value: string) => void;
    const result = withStallWatchdog((touch) => {
      const intervalId = setInterval(touch, STALL_TIMEOUT_MS / 2);
      return new Promise<string>((resolve) => {
        resolveRun = (value) => {
          clearInterval(intervalId);
          resolve(value);
        };
      });
    });

    // Advance well past STALL_TIMEOUT_MS in total, but touch() keeps firing
    // more often than the stall threshold, so it must never reject.
    await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS * 3);
    resolveRun!("done");
    await expect(result).resolves.toBe("done");
  });

  it("resolves normally when the promise finishes before any stall check", async () => {
    const result = withStallWatchdog(() => Promise.resolve("fast"));
    await expect(result).resolves.toBe("fast");
  });
});

describe("recommendModel", () => {
  it("recommends the one dedicated model for each specialized purpose", () => {
    expect(recommendModel("coding", "balanced", true, null).model.id).toBe("qwen2.5-coder-7b");
    expect(recommendModel("math", "balanced", true, null).model.id).toBe("qwen2.5-math-1.5b");
    expect(recommendModel("reasoning", "balanced", true, null).model.id).toBe("deepseek-r1-qwen-7b");
    expect(recommendModel("explore", "balanced", true, null).model.id).toBe("smollm2-360m");
  });

  it("uses the speed preference for general-purpose chat", () => {
    expect(recommendModel("general", "fast", true, null).model.id).toBe("llama3.2-1b");
    expect(recommendModel("general", "balanced", true, null).model.id).toBe("llama3.2-3b");
    expect(recommendModel("general", "quality", true, 16).model.id).toBe("qwen2.5-7b");
  });

  it("downgrades the quality pick when it likely won't fit reported device memory", () => {
    const rec = recommendModel("general", "quality", true, 4);
    expect(rec.model.id).toBe("llama3.2-3b");
    expect(rec.reason).toMatch(/memory/i);
  });

  it("only ever recommends a WASM-capable model when WebGPU is unavailable", () => {
    const purposes = ["general", "coding", "math", "reasoning", "explore"] as const;
    const speeds = ["fast", "balanced", "quality"] as const;
    for (const purpose of purposes) {
      for (const speed of speeds) {
        const rec = recommendModel(purpose, speed, false, null);
        expect(isWebgpuOnly(rec.model)).toBe(false);
      }
    }
  });

  it("every model the function can return actually exists in the catalog", () => {
    const ids = new Set(AVAILABLE_MODELS.map((m) => m.id));
    const purposes = ["general", "coding", "math", "reasoning", "explore"] as const;
    const speeds = ["fast", "balanced", "quality"] as const;
    for (const webgpu of [true, false]) {
      for (const purpose of purposes) {
        for (const speed of speeds) {
          for (const memoryGb of [null, 2, 4, 8, 16]) {
            expect(ids.has(recommendModel(purpose, speed, webgpu, memoryGb).model.id)).toBe(true);
          }
        }
      }
    }
  });
});
