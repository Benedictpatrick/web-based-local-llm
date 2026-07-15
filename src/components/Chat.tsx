"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { ChatCompletionMessage } from "@wllama/wllama/esm/index.js";
import { db } from "@/lib/db";
import {
  AVAILABLE_MODELS,
  type ModelId,
  getLastStatsText,
  isWasmSupported,
  loadEngine,
  streamChat,
} from "@/lib/llm";
import { topRelevantEntries } from "@/lib/retrieval";

const SYSTEM_PROMPT =
  "You are a private, on-device assistant running entirely offline — nothing the user says ever leaves this browser. Keep replies short: 1-3 sentences unless the user clearly asks for more detail or a list. Answer directly first, then stop — do not pad, repeat yourself, or restate the question. When journal context is provided, use it naturally to personalize your answer, but don't mention that you were 'given context' unless asked.";

export default function Chat() {
  const messages = useLiveQuery(() => db.chat.orderBy("createdAt").toArray(), [], []);
  const journalEntries = useLiveQuery(() => db.journal.orderBy("createdAt").toArray(), [], []);

  const [modelId, setModelId] = useState<ModelId>(AVAILABLE_MODELS[0].id);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [progress, setProgress] = useState<string>("");
  const [errorText, setErrorText] = useState<string>("");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [draftReply, setDraftReply] = useState("");
  const [wasmSupported, setWasmSupported] = useState(true);
  const [lastStats, setLastStats] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pendingReplyRef = useRef<string>("");
  const flushScheduledRef = useRef(false);

  useEffect(() => {
    setWasmSupported(isWasmSupported());
  }, []);

  useEffect(() => {
    // "smooth" stacks a new scroll animation on every token during a slow
    // CPU-bound stream, which looks like the UI glitching. Only auto-scroll
    // when already near the bottom, and jump instantly.
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 200) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages, draftReply]);

  async function handleLoadModel() {
    setStatus("loading");
    setErrorText("");
    try {
      await loadEngine(modelId, ({ loaded, total }) => {
        const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
        setProgress(`Downloading model… ${pct}%`);
      });
      setStatus("ready");
    } catch (err) {
      console.error(err);
      setErrorText(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming || status !== "ready") return;

    setInput("");
    await db.chat.add({ role: "user", content: text, createdAt: Date.now() });

    const relevant = topRelevantEntries(text, journalEntries ?? [], 3);
    const contextBlock =
      relevant.length > 0
        ? `Relevant journal entries from the user's past:\n${relevant
            .map((e) => `- ${e.text}`)
            .join("\n")}\n\n`
        : "";

    const history = (await db.chat.orderBy("createdAt").toArray()).map(
      (m): ChatCompletionMessage => ({ role: m.role, content: m.content })
    );

    const promptMessages: ChatCompletionMessage[] = [
      { role: "system", content: SYSTEM_PROMPT + (contextBlock ? `\n\n${contextBlock}` : "") },
      ...history,
    ];

    setStreaming(true);
    setDraftReply("");
    pendingReplyRef.current = "";
    let full = "";

    const scheduleFlush = () => {
      if (flushScheduledRef.current) return;
      flushScheduledRef.current = true;
      requestAnimationFrame(() => {
        setDraftReply(pendingReplyRef.current);
        flushScheduledRef.current = false;
      });
    };

    try {
      for await (const chunk of streamChat(promptMessages)) {
        full += chunk;
        pendingReplyRef.current = full;
        scheduleFlush();
      }
    } catch (err) {
      console.error(err);
      full = full || "Sorry, something went wrong generating a response.";
    }

    await db.chat.add({ role: "assistant", content: full, createdAt: Date.now() });
    setDraftReply("");
    setStreaming(false);
    setLastStats(getLastStatsText());
  }

  if (!wasmSupported) {
    return (
      <div className="p-6 text-sm text-red-600 dark:text-red-400">
        Your browser doesn&apos;t support WebAssembly, which is required to run
        the model on-device. Try a recent version of Chrome, Edge, Firefox, or
        Safari.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {status === "ready" ? (
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-2 text-xs text-zinc-500 dark:border-white/10">
          <span>{AVAILABLE_MODELS.find((m) => m.id === modelId)?.label}</span>
          <button
            className="underline disabled:opacity-50"
            onClick={() => setStatus("idle")}
            disabled={streaming}
          >
            Change model
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-b border-black/10 p-4 dark:border-white/10">
          <div className="flex items-center gap-2">
            <select
              className="rounded border border-black/10 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-black"
              value={modelId}
              disabled={status === "loading"}
              onChange={(e) => setModelId(e.target.value as ModelId)}
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
              onClick={handleLoadModel}
              disabled={status === "loading"}
            >
              {status === "loading" ? "Loading model…" : "Load model"}
            </button>
          </div>
          {status === "loading" && (
            <p className="text-xs text-zinc-500">{progress || "Starting…"}</p>
          )}
          {status === "error" && (
            <p className="text-xs text-red-600">
              Failed to load the model{errorText ? `: ${errorText}` : ""}. Check
              your connection for the first download, then it will work
              offline.
            </p>
          )}
          <p className="text-xs text-zinc-500">
            Runs entirely on your device&apos;s CPU via WebAssembly — no GPU
            required. First load downloads the model to your browser&apos;s
            cache; after that it works fully offline.
          </p>
        </div>
      )}

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {(messages ?? []).map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "self-end bg-black text-white dark:bg-white dark:text-black"
                  : "self-start bg-zinc-100 text-black dark:bg-zinc-800 dark:text-white"
              }`}
            >
              {m.content}
            </div>
          ))}
          {streaming && (
            <div className="max-w-[85%] self-start rounded-2xl bg-zinc-100 px-4 py-2 text-sm whitespace-pre-wrap dark:bg-zinc-800">
              {draftReply || "…"}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-black/10 p-4 dark:border-white/10">
        <div className="mx-auto flex max-w-2xl gap-2">
          <input
            className="flex-1 rounded-full border border-black/10 bg-white px-4 py-2 text-sm dark:border-white/10 dark:bg-black"
            placeholder={status === "ready" ? "Ask anything…" : "Load the model to start chatting"}
            value={input}
            disabled={status !== "ready" || streaming}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
          />
          <button
            className="rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
            onClick={handleSend}
            disabled={status !== "ready" || streaming || !input.trim()}
          >
            Send
          </button>
        </div>
        {lastStats && (
          <p className="mx-auto mt-2 max-w-2xl text-xs text-zinc-500">{lastStats}</p>
        )}
      </div>
    </div>
  );
}
