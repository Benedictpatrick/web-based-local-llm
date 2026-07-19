type HapticPattern = "tap" | "success" | "warning";

// Durations are floored well above typical ERM motor spin-up time (~20-50ms) —
// anything shorter is often accepted by the OS but never physically felt.
const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 30,
  success: [30, 50, 40],
  warning: [40, 80, 40, 80, 40],
};

export function isHapticSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** Returns whether the browser accepted the vibration request — not whether the device actually buzzed. */
export function haptic(pattern: HapticPattern = "tap"): boolean {
  if (!isHapticSupported()) return false;
  try {
    return navigator.vibrate(PATTERNS[pattern]);
  } catch {
    return false;
  }
}
