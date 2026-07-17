// pdf.js loads its worker from a URL string, not an import, so it has to be
// served from a stable path rather than resolved through the bundler (which
// is where this integration usually breaks under Turbopack). Copying it here
// keeps it from drifting off the installed pdfjs-dist version — runs before
// every dev and build, same as sync-katex.mjs.
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destDir = join(root, "public", "pdfjs");

await mkdir(destDir, { recursive: true });
await copyFile(src, join(destDir, "pdf.worker.min.mjs"));

console.log("pdfjs: synced worker");
