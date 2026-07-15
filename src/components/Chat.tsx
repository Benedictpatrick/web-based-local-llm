"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { ChatCompletionMessage } from "@wllama/wllama/esm/index.js";
import { db, type ChatMessage } from "@/lib/db";
import {
  AVAILABLE_MODELS,
  type ModelId,
  getLastStatsText,
  isStoragePersisted,
  isWasmSupported,
  loadEngine,
  streamChat,
} from "@/lib/llm";
import { topRelevantEntries } from "@/lib/retrieval";
import ModelPicker from "@/components/ModelPicker";

// Memoized so streaming updates (draftReply changing 60x/sec) don't force
// React to re-diff every past message bubble on every token — on a phone
// CPU, re-rendering a long history that often was the actual source of the
// "choppy" streaming text, not the token itself.
const MessageHistory = memo(function MessageHistory({
  messages,
}: {
  messages: ChatMessage[];
}) {
  return (
    <>
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="msg-enter flex justify-end">
            <div className="max-w-[80%] rounded-2xl border border-border bg-bubble-user px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
              {m.content}
            </div>
          </div>
        ) : (
          <div key={m.id} className="msg-enter flex gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="9" r="4.5" fill="currentColor" />
                <rect x="6.5" y="16" width="11" height="4" rx="2" fill="currentColor" />
              </svg>
            </div>
            <div className="min-w-0 flex-1 pt-1 text-[15px] leading-relaxed whitespace-pre-wrap">
              {m.content}
            </div>
          </div>
        )
      )}
    </>
  );
});

const SYSTEM_PROMPT =
  "You are a private, on-device assistant running entirely offline — nothing the user says ever leaves this browser. Keep replies short: 1-3 sentences unless the user clearly asks for more detail or a list. Answer directly first, then stop — do not pad, repeat yourself, or restate the question. Always respond to the user's most recent message specifically — if it changes topic or asks something unrelated to earlier turns, address the new request directly instead of continuing the previous subject. When journal context is provided, use it naturally to personalize your answer, but don't mention that you were 'given context' unless asked.";

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
  const [wasmSupported] = useState(() => isWasmSupported());
  const [lastStats, setLastStats] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pendingReplyRef = useRef<string>("");
  const flushScheduledRef = useRef(false);

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
    const startedAt = performance.now();
    let sawPartialProgress = false;
    try {
      await loadEngine(modelId, ({ loaded, total, text }) => {
        if (loaded < total) sawPartialProgress = true;
        if (text) {
          setProgress(text);
          return;
        }
        const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
        const mb = (n: number) => (n / (1024 * 1024)).toFixed(0);
        setProgress(`Downloading model… ${pct}% (${mb(loaded)} / ${mb(total)} MB)`);
      });
      const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
      const persisted = await isStoragePersisted();
      const persistNote =
        persisted === false
          ? " — storage isn't marked durable yet; install this app to your home screen to stop it being evicted between visits"
          : "";
      setProgress(
        (sawPartialProgress
          ? `Downloaded and loaded in ${seconds}s`
          : `Loaded from local cache in ${seconds}s (no re-download)`) + persistNote
      );
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

    // Sending the full history means prefill cost (and thus lag) grows with
    // every message, and can eventually overflow the context window. Cap it
    // to the most recent turns — plenty for coherent replies in a chat app.
    const MAX_HISTORY_MESSAGES = 12;
    const history = (await db.chat.orderBy("createdAt").toArray())
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m): ChatCompletionMessage => ({ role: m.role, content: m.content }));

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
      const detail = err instanceof Error ? err.message : String(err);
      full = full || `Sorry, generation failed: ${detail}`;
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
        <div className="px-3 py-2 text-xs text-foreground-muted sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{AVAILABLE_MODELS.find((m) => m.id === modelId)?.label}</span>
            <button
              className="shrink-0 rounded-md px-2 py-1 transition-colors hover:bg-surface hover:text-foreground disabled:opacity-50"
              onClick={() => setStatus("idle")}
              disabled={streaming}
            >
              Change model
            </button>
          </div>
          {progress && <p className="mt-0.5">{progress}</p>}
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-4 sm:px-5">
          <div className="flex items-center gap-2">
            <ModelPicker
              value={modelId}
              onChange={setModelId}
              disabled={status === "loading"}
            />
            <button
              className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              onClick={handleLoadModel}
              disabled={status === "loading"}
            >
              {status === "loading" ? "Loading…" : "Load model"}
            </button>
          </div>
          {status === "loading" && (
            <p className="text-xs text-foreground-muted">{progress || "Starting…"}</p>
          )}
          {status === "error" && (
            <p className="text-xs text-red-500">
              Failed to load the model{errorText ? `: ${errorText}` : ""}. Check
              your connection for the first download, then it will work
              offline.
            </p>
          )}
          <p className="text-xs text-foreground-muted">
            Runs entirely on your device&apos;s CPU via WebAssembly — no GPU
            required. First load downloads the model to your browser&apos;s
            cache; after that it works fully offline.
          </p>
        </div>
      )}

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 sm:px-5">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-6">
          {(messages ?? []).length === 0 && !streaming && (
            <div className="flex flex-1 items-center justify-center py-24 text-sm text-foreground-muted">
              {status === "ready" ? "Ask anything to get started." : "Load a model, then start chatting."}
            </div>
          )}
          <MessageHistory messages={messages ?? []} />
          {streaming && (
            <div className="msg-enter flex gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="9" r="4.5" fill="currentColor" />
                  <rect x="6.5" y="16" width="11" height="4" rx="2" fill="currentColor" />
                </svg>
              </div>
              <div className="min-w-0 flex-1 pt-1 text-[15px] leading-relaxed whitespace-pre-wrap">
                {draftReply || (
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-muted [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-muted [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-muted" />
                  </span>
                )}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="px-3 pb-5 pt-2 sm:px-5">
        <div className="mx-auto w-full max-w-2xl">
          <div className="flex items-center gap-2 rounded-3xl border border-border bg-surface px-2 py-2 shadow-sm">
            <input
              className="min-w-0 flex-1 bg-transparent px-3 py-1.5 text-base outline-none placeholder:text-foreground-muted"
              placeholder={status === "ready" ? "Message…" : "Load the model to start chatting"}
              value={input}
              disabled={status !== "ready" || streaming}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
            />
            <button
              aria-label="Send"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
              onClick={handleSend}
              disabled={status !== "ready" || streaming || !input.trim()}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 19V5M12 5L5 12M12 5L19 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          {lastStats && (
            <p className="mt-2 text-center text-xs text-foreground-muted">{lastStats}</p>
          )}
        </div>
      </div>
    </div>
  );
}
