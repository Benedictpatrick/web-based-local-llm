// Pyodide's loader fetches its own runtime assets (wasm, stdlib, lock file)
// from a plain URL at runtime rather than through the bundler, same as the
// pdf.js worker — so they're vendored into public/ instead of imported.
// Self-hosting these (rather than pointing at Pyodide's CDN) keeps the
// "Run" feature working after the first load, consistent with everything
// else in this app.
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pyodide");
const destDir = join(root, "public", "pyodide");

await mkdir(destDir, { recursive: true });

const files = [
  // The UMD build, loaded via a real <script> tag rather than a bundler
  // import — its ESM sibling (pyodide.mjs) has a genuinely dynamic
  // import(url) call for its wasm loader that Turbopack can't statically
  // analyze and errors on at runtime ("Cannot find module as expression is
  // too dynamic"). pyodide.js has /* webpackIgnore */ annotations to survive
  // exactly this, but only if the bundler never touches it in the first
  // place — a <script> tag guarantees that.
  "pyodide.js",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "pyodide-lock.json",
  "python_stdlib.zip",
];
await Promise.all(files.map((f) => copyFile(join(src, f), join(destDir, f))));

console.log(`pyodide: synced ${files.length} runtime files`);
