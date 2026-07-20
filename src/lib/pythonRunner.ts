import type { PyodideAPI, loadPyodide as LoadPyodideFn } from "pyodide";

declare global {
  interface Window {
    loadPyodide?: typeof LoadPyodideFn;
  }
}

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
    })().catch((err) => {
      pyodidePromise = null;
      throw err;
    });
  }
  return pyodidePromise;
}

export interface PythonRunResult {
  output: string;
  ok: boolean;
}

export async function runPython(code: string, stdin = ""): Promise<PythonRunResult> {
  const pyodide = await getPyodide();
  const lines: string[] = [];
  pyodide.setStdout({ batched: (line) => lines.push(line) });
  pyodide.setStderr({ batched: (line) => lines.push(line) });

  // Feed the provided standard input to input() one line at a time. When the
  // program reads past what was supplied, returning null signals EOF, which
  // surfaces below as a clear note rather than a raw traceback.
  const stdinLines = stdin.length > 0 ? stdin.split("\n") : [];
  let stdinIndex = 0;
  pyodide.setStdin({
    stdin: () => (stdinIndex < stdinLines.length ? stdinLines[stdinIndex++] + "\n" : null),
  });

  try {
    const result = await pyodide.runPythonAsync(code);
    if (result !== undefined && result !== null) {
      lines.push(String(result));
    }
    return { output: lines.join("\n").trim() || "(no output)", ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // input() reads past the supplied lines and hits EOF. Replace the noisy
    // traceback with a clear note and keep whatever the code printed first.
    if (/EOFError/.test(message)) {
      lines.push(
        stdinLines.length > 0
          ? "The program asked for more input than the box provided. Add another line to the input box, one value per line."
          : "This code asks for input(). Type the values it should read into the input box below, one per line, then run it again."
      );
    } else {
      lines.push(message);
    }
    return { output: lines.join("\n").trim(), ok: false };
  }
}
