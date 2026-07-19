type HapticPattern = "tap" | "success" | "warning";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 10,
  success: [10, 40, 15],
  warning: [15, 60, 15, 60, 15],
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
