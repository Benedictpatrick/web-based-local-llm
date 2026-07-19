type HapticPattern = "tap" | "success" | "warning";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 10,
  success: [10, 40, 15],
  warning: [15, 60, 15, 60, 15],
};

export function haptic(pattern: HapticPattern = "tap"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {}
}
