import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Self-hosts every asset Tesseract.js would otherwise fetch from jsdelivr's
// CDN at runtime (worker script, WASM core, English trained data) -- Navo's
// whole pitch is that nothing a user scans ever leaves their browser, so the
// OCR engine can't be allowed to phone a CDN for its own runtime.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(root, "public", "tesseract");
await mkdir(join(destDir, "core"), { recursive: true });
await mkdir(join(destDir, "lang-data"), { recursive: true });

await copyFile(
  join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"),
  join(destDir, "worker.min.js")
);

// Both the SIMD and non-SIMD LSTM-only core builds: the worker feature-detects
// WASM SIMD support at runtime and picks whichever of these it needs, so both
// have to be present even though only one is ever actually fetched per device.
const coreDir = join(root, "node_modules", "tesseract.js-core");
await Promise.all(
  ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"].map((f) =>
    copyFile(join(coreDir, f), join(destDir, "core", f))
  )
);

await copyFile(
  join(root, "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"),
  join(destDir, "lang-data", "eng.traineddata.gz")
);

console.log("tesseract: synced worker + core + eng lang data");
