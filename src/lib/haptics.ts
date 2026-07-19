type HapticPattern = "tap" | "success" | "warning";

// Durations are floored well above the time a typical ERM motor takes to spin
// up (~20-50ms): anything shorter is often accepted by the OS but never
// physically felt. Always use an array, even for a single pulse: a bare
// number has been observed on real devices to be accepted (navigator.vibrate
// returns true) without the motor ever actually firing, while the equivalent
// array with one element works.
const PATTERNS: Record<HapticPattern, number[]> = {
  tap: [30],
  success: [30, 50, 40],
  warning: [40, 80, 40, 80, 40],
};

function isHapticSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function haptic(pattern: HapticPattern = "tap"): void {
  if (!isHapticSupported()) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {}
}
