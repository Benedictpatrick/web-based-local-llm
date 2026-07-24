import { createWorker, OEM, type Worker } from "tesseract.js";

// Every path below points at scripts/sync-tesseract.mjs's output instead of
// tesseract.js's own defaults (which fetch the worker script, WASM core, and
// English trained data from jsdelivr's CDN) -- Navo's whole pitch is that
// nothing a user scans ever leaves their browser, so the OCR engine can't be
// allowed to phone a CDN for its own runtime.
let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/core",
      langPath: "/tesseract/lang-data",
    }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Runs on-device OCR over a captured/uploaded photo and returns the text it
 *  found. Feeds into the same attach-file pipeline as a text/PDF upload (see
 *  fileExtraction.ts), so a scanned question gets chunked and retrieved the
 *  same way. */
export async function extractTextFromImage(file: File): Promise<string> {
  const worker = await getWorker();
  const {
    data: { text },
  } = await worker.recognize(file);
  return text;
}
