import type { PyodideAPI, loadPyodide as LoadPyodideFn } from "pyodide";

declare global {
  interface Window {
    loadPyodide?: typeof LoadPyodideFn;
  }
}

// Lazily loaded and cached — pages that never click "Run" never pay for the
// ~13MB Pyodide runtime. Self-hosted from public/pyodide (see
// scripts/sync-pyodide.mjs) rather than Pyodide's CDN, so the feature keeps
// working offline after the first run, same as everything else here.
//
// Honest exception to "works offline after first load": that first Run
// still needs a real network fetch for the runtime, same as the LLM models
// on first use — this isn't pre-cached by the service worker the way the
// KaTeX assets are.
//
// Loaded via a real <script> tag rather than `import("pyodide")` — the
// package's ESM build has a fully-dynamic import(url) internally that
// Turbopack can't statically analyze and fails on at runtime. The UMD
// build loaded this way is untouched by the bundler entirely.
let pyodidePromise: Promise<PyodideAPI> | null = null;

function loadPyodideScript(): Promise<void> {
  if (window.loadPyodide) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/pyodide/pyodide.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load the Python runtime."));
    document.head.appendChild(script);
  });
}

async function getPyodide(): Promise<PyodideAPI> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      await loadPyodideScript();
      if (!window.loadPyodide) throw new Error("Python runtime failed to initialize.");
      return window.loadPyodide({ indexURL: "/pyodide/" });
    })();
  }
  return pyodidePromise;
}

export interface PythonRunResult {
  output: string;
  ok: boolean;
}

export async function runPython(code: string): Promise<PythonRunResult> {
  const pyodide = await getPyodide();
  const lines: string[] = [];
  pyodide.setStdout({ batched: (line) => lines.push(line) });
  pyodide.setStderr({ batched: (line) => lines.push(line) });
  // Left unconfigured, Pyodide's default stdin falls back to the browser's
  // native window.prompt() — a blank, unstyled dialog with no indication of
  // what it wants, popping up over the app. There's no UI here to feed it a
  // real answer, so make input() fail loud and readable (a normal Python
  // EOFError in the output pane) instead of surfacing that dialog at all.
  pyodide.setStdin({ stdin: () => null });

  try {
    const result = await pyodide.runPythonAsync(code);
    // A bare expression on the last line (e.g. a REPL-style `x + 1`) returns
    // a value instead of printing — surface it the way a notebook cell would.
    if (result !== undefined && result !== null) {
      lines.push(String(result));
    }
    return { output: lines.join("\n").trim() || "(no output)", ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lines.push(message);
    return { output: lines.join("\n").trim(), ok: false };
  }
}
