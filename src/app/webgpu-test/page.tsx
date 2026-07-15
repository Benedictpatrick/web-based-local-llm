"use client";

import { useState } from "react";

const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

export default function WebGpuTest() {
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  function append(line: string) {
    setLog((prev) => [...prev, line]);
  }

  async function runTest() {
    setRunning(true);
    setLog([]);

    if (!("gpu" in navigator)) {
      append("FAIL: navigator.gpu does not exist in this browser.");
      setRunning(false);
      return;
    }
    append("navigator.gpu exists.");

    try {
      const adapter = await (navigator as unknown as { gpu: { requestAdapter: () => Promise<{ isFallbackAdapter?: boolean } | null> } }).gpu.requestAdapter();
      if (!adapter) {
        append("FAIL: requestAdapter() returned null.");
        setRunning(false);
        return;
      }
      append(`requestAdapter() succeeded. isFallbackAdapter=${adapter.isFallbackAdapter}`);
    } catch (err) {
      append(`FAIL: requestAdapter() threw: ${err instanceof Error ? err.message : String(err)}`);
      setRunning(false);
      return;
    }

    try {
      append("Importing @mlc-ai/web-llm...");
      const webllm = await import("@mlc-ai/web-llm");
      append("Import OK. Creating engine (this downloads/compiles the model, may take a while)...");

      const engine = await webllm.CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (report) => {
          append(`progress: ${report.text}`);
        },
      });
      append("Engine created. Requesting a completion...");

      const reply = await engine.chat.completions.create({
        messages: [{ role: "user", content: "Say hello in exactly one word." }],
      });

      const text = reply.choices[0]?.message?.content ?? "(empty)";
      append(`SUCCESS. Model replied: "${text}"`);
    } catch (err) {
      append(`FAIL: ${err instanceof Error ? err.stack || err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "monospace", fontSize: 13, whiteSpace: "pre-wrap" }}>
      <h1 style={{ fontSize: 16, marginBottom: 12 }}>WebGPU / web-llm raw test</h1>
      <button
        onClick={runTest}
        disabled={running}
        style={{ padding: "8px 16px", marginBottom: 16, fontSize: 14 }}
      >
        {running ? "Running…" : "Run test"}
      </button>
      <div>
        {log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
