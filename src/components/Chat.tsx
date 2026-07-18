"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { ChatCompletionMessage } from "@wllama/wllama/esm/index.js";
import { db, type ChatMessage } from "@/lib/db";
import {
  AVAILABLE_MODELS,
  type ModelId,
  abortGeneration,
  getDefaultModelId,
  getLastStatsText,
  isAbortError,
  isEngineLostError,
  isStoragePersisted,
  isWasmSupported,
  loadEngine,
  streamChat,
} from "@/lib/llm";
import { topRelevantEntries, embedChunks, topRelevantChunks, type TextChunk } from "@/lib/retrieval";
import { extractTextFromFile, chunkText } from "@/lib/fileExtraction";
import ModelPicker from "@/components/ModelPicker";
import MarkdownMessage from "@/components/MarkdownMessage";
import LoadingScreen from "@/components/LoadingScreen";

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
            <div className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
            <div className="min-w-0 flex-1 pt-1">
              <MarkdownMessage content={m.content} />
            </div>
          </div>
        )
      )}
    </>
  );
});

const SYSTEM_PROMPT =
  "You are Navo, a private study assistant for a computer science student, running entirely on this device — nothing the user types ever leaves their browser. Always answer the user's most recent message, directly and briefly: 1-3 sentences unless they ask for detail, a list, or code. Never include code unless they explicitly ask for code; when they do, give complete working code in a fenced block tagged with the language name. Code must be plain code with no LaTeX in it. Outside of code, write any mathematics in LaTeX delimiters: $...$ inline, $$...$$ for standalone equations, never plain text or unicode symbols. If saved notes are provided below, use them naturally without mentioning them.";

const SMALL_TALK_PROMPT =
  "You are Navo, a friendly private study assistant. The user is greeting you or making small talk. Reply with one short, warm sentence that answers them and invites a question.";

const SMALL_TALK_RE =
  /^(hi+|hii+|hey+( there)?|hello+|yo+|sup|wassup|what'?s up|howdy|good (morning|afternoon|evening|night)|how are you( doing)?|how'?s it going|thank(s| you)( so much| a lot)?|ok(ay)?|cool|nice|great|bye+|goodbye|see you|hola|namaste)[\s!.?,]*$/i;

const CODE_PROMPT =
  "You are Navo, a programming assistant. The user is asking for code. Answer with exactly one complete, correct, runnable code block in a markdown fence tagged with the language name, optionally preceded by one short sentence. No placeholders, no omissions, nothing after the code block.";

const CODE_RE =
  /\b(code|program|programme|script|function|method|class|implement|algorithm|snippet|debug|fix (this|my)|error in|write.*(loop|api|query)|python|javascript|typescript|java|c\+\+|c#|golang|rust|kotlin|swift|sql|html|css|bash|regex)\b/i;

const MAX_TEXTAREA_HEIGHT = 160;

export default function Chat({
  conversationId,
  onConversationChange,
}: {
  conversationId: number | null;
  onConversationChange: (id: number) => void;
}) {
  const messages = useLiveQuery(
    () =>
      conversationId
        ? db.chat.where("conversationId").equals(conversationId).sortBy("createdAt")
        : Promise.resolve<ChatMessage[]>([]),
    [conversationId],
    [] as ChatMessage[]
  );
  const journalEntries = useLiveQuery(() => db.journal.orderBy("createdAt").toArray(), [], []);

  const [modelId, setModelId] = useState<ModelId>(AVAILABLE_MODELS[0].id);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [progress, setProgress] = useState<string>("");
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [showStatusDetail, setShowStatusDetail] = useState(false);
  const [errorText, setErrorText] = useState<string>("");
  const [changingModel, setChangingModel] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [draftReply, setDraftReply] = useState("");
  const [wasmSupported] = useState(() => isWasmSupported());
  const [lastStats, setLastStats] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; chunks: TextChunk[] } | null>(
    null
  );
  const [attachingFile, setAttachingFile] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingReplyRef = useRef<string>("");
  const flushScheduledRef = useRef(false);
  const autoLoadStartedRef = useRef(false);
  const statusDetailTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 200) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages, draftReply]);

  useEffect(() => {
    if (autoLoadStartedRef.current || !wasmSupported) return;
    autoLoadStartedRef.current = true;
    (async () => {
      const id = await getDefaultModelId();
      setModelId(id);
      handleLoadModel(id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (statusDetailTimeoutRef.current) clearTimeout(statusDetailTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [input]);

  async function handleLoadModel(idToLoad: ModelId = modelId) {
    setStatus("loading");
    setErrorText("");
    setProgress("");
    setProgressPct(null);
    setShowStatusDetail(false);
    if (statusDetailTimeoutRef.current) clearTimeout(statusDetailTimeoutRef.current);
    const startedAt = performance.now();
    let sawPartialProgress = false;
    try {
      await loadEngine(idToLoad, ({ loaded, total, text }) => {
        if (loaded < total) sawPartialProgress = true;
        if (text) {
          setProgress(text);
          setProgressPct(null);
          return;
        }
        const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
        const mb = (n: number) => (n / (1024 * 1024)).toFixed(0);
        setProgress(`Downloading model… ${pct}% (${mb(loaded)} / ${mb(total)} MB)`);
        setProgressPct(total > 0 ? pct : null);
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
      setShowStatusDetail(true);
      statusDetailTimeoutRef.current = setTimeout(() => setShowStatusDetail(false), 6000);
    } catch (err) {
      console.error(err);
      setErrorText(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function generateReply(activeConversationId: number, userText: string) {
    if (SMALL_TALK_RE.test(userText.trim())) {
      await streamReply([
        { role: "system", content: SMALL_TALK_PROMPT },
        { role: "user", content: userText },
      ], activeConversationId);
      return;
    }

    const relevant = await topRelevantEntries(userText, journalEntries ?? [], 3);
    const notesBlock =
      relevant.length > 0
        ? `Relevant notes the user saved earlier:\n${relevant
            .map((e) => `- ${e.text}`)
            .join("\n")}\n\n`
        : "";

    const fileChunks = attachedFile
      ? await topRelevantChunks(userText, attachedFile.chunks, 3)
      : [];
    const fileBlock =
      fileChunks.length > 0
        ? `Excerpts from the uploaded file "${attachedFile?.name}":\n${fileChunks
            .map((c) => `- ${c}`)
            .join("\n")}\n\n`
        : "";

    const contextBlock = notesBlock + fileBlock;

    const isCodeRequest = CODE_RE.test(userText);
    const MAX_HISTORY_MESSAGES = isCodeRequest ? 2 : 6;
    const history = (
      await db.chat.where("conversationId").equals(activeConversationId).sortBy("createdAt")
    )
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m): ChatCompletionMessage => ({ role: m.role, content: m.content }));

    const systemPrompt = isCodeRequest ? CODE_PROMPT : SYSTEM_PROMPT;
    await streamReply(
      [
        { role: "system", content: systemPrompt + (contextBlock ? `\n\n${contextBlock}` : "") },
        ...history,
      ],
      activeConversationId,
      isCodeRequest ? { temperature: 0.3 } : undefined
    );
  }

  async function streamReply(
    promptMessages: ChatCompletionMessage[],
    activeConversationId: number,
    opts?: { temperature?: number }
  ) {
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
      for await (const chunk of streamChat(promptMessages, opts)) {
        full += chunk;
        pendingReplyRef.current = full;
        scheduleFlush();
      }
    } catch (err) {
      if (isEngineLostError(err)) {
        console.error(err);
        full =
          full ||
          "Your device unloaded the model to free up memory. Reloading it now — please try again in a moment.";
        handleLoadModel(modelId);
      } else if (!isAbortError(err)) {
        console.error(err);
        const detail = err instanceof Error ? err.message : String(err);
        full = full || `Sorry, generation failed: ${detail}`;
      }
    }

    if (full.trim()) {
      await db.chat.add({
        conversationId: activeConversationId,
        role: "assistant",
        content: full,
        createdAt: Date.now(),
      });
      await db.conversations.update(activeConversationId, { updatedAt: Date.now() });
    }
    setDraftReply("");
    setStreaming(false);
    setLastStats(getLastStatsText());
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming || status !== "ready") return;

    setInput("");

    let activeConversationId = conversationId;
    if (!activeConversationId) {
      const now = Date.now();
      activeConversationId = await db.conversations.add({
        title: text.slice(0, 60),
        createdAt: now,
        updatedAt: now,
      });
      onConversationChange(activeConversationId);
    }

    await db.chat.add({
      conversationId: activeConversationId,
      role: "user",
      content: text,
      createdAt: Date.now(),
    });

    await generateReply(activeConversationId, text);
  }

  async function handleRegenerate() {
    if (!conversationId || streaming || status !== "ready") return;
    const all = messages ?? [];
    const last = all[all.length - 1];
    if (!last || last.role !== "assistant") return;
    const lastUser = [...all].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    await db.chat.delete(last.id);
    await generateReply(conversationId, lastUser.content);
  }

  function handleStop() {
    abortGeneration();
  }

  async function handleAttachFile(file: File) {
    setAttachError(null);
    setAttachingFile(true);
    try {
      const text = await extractTextFromFile(file);
      const chunks = await embedChunks(chunkText(text));
      if (chunks.length === 0) {
        setAttachError("Couldn't find any text in that file.");
        return;
      }
      setAttachedFile({ name: file.name, chunks });
    } catch (err) {
      console.error(err);
      setAttachError("Couldn't read that file — try a .txt, .md, or .pdf.");
    } finally {
      setAttachingFile(false);
    }
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

  if (changingModel) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-foreground-muted">Choose a model to load</p>
        <div className="flex w-full max-w-xs items-center gap-2">
          <ModelPicker
            value={modelId}
            onChange={(id) => {
              setChangingModel(false);
              setModelId(id);
              handleLoadModel(id);
            }}
            onModelDeleted={(id) => {
              if (id === modelId) setProgress("");
            }}
          />
        </div>
        <button
          type="button"
          className="text-xs text-foreground-muted hover:text-foreground hover:underline"
          onClick={() => setChangingModel(false)}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (status !== "ready") {
    return (
      <LoadingScreen
        status={status}
        progress={progress}
        progressPct={progressPct}
        modelLabel={AVAILABLE_MODELS.find((m) => m.id === modelId)?.label ?? modelId}
        errorText={errorText}
        onRetry={() => handleLoadModel(modelId)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2 text-xs text-foreground-muted sm:px-5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">{AVAILABLE_MODELS.find((m) => m.id === modelId)?.label}</span>
          <button
            className="shrink-0 rounded-md px-2 py-1 transition-colors hover:bg-surface hover:text-foreground disabled:opacity-50"
            onClick={() => setChangingModel(true)}
            disabled={streaming}
          >
            Change model
          </button>
        </div>
        <div
          className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-out ${
            showStatusDetail ? "mt-0.5 max-h-24 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          {progress && <p>{progress}</p>}
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 sm:px-5">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-6">
          {(messages ?? []).length === 0 && !streaming && (
            <div className="flex flex-1 items-center justify-center py-24 text-sm text-foreground-muted">
              Ask anything to get started.
            </div>
          )}
          <MessageHistory messages={messages ?? []} />
          {!streaming &&
            (messages ?? []).length > 0 &&
            (messages ?? [])[(messages ?? []).length - 1].role === "assistant" && (
              <div className="-mt-3 flex pl-5">
                <button
                  className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
                  onClick={handleRegenerate}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M3 12a9 9 0 0 1 15.3-6.4M21 12a9 9 0 0 1-15.3 6.4M3 5v6h6M21 19v-6h-6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Regenerate
                </button>
              </div>
            )}
          {streaming && (
            <div className="msg-enter flex gap-3">
              <div className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0 flex-1 pt-1">
                {draftReply ? (
                  <MarkdownMessage content={draftReply} />
                ) : (
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
          {(attachedFile || attachingFile || attachError) && (
            <div className="mb-2 flex items-center gap-2 text-xs">
              {attachingFile ? (
                <span className="text-foreground-muted">Reading file…</span>
              ) : attachError ? (
                <span className="text-red-500">{attachError}</span>
              ) : (
                attachedFile && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-foreground-muted">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {attachedFile.name}
                    <button
                      aria-label="Remove file"
                      className="text-foreground-muted hover:text-foreground"
                      onClick={() => setAttachedFile(null)}
                    >
                      ×
                    </button>
                  </span>
                )
              )}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-3xl border border-border bg-surface px-2 py-2 shadow-sm">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) handleAttachFile(file);
              }}
            />
            <button
              aria-label="Attach a file"
              className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-background hover:text-foreground disabled:opacity-30"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming || attachingFile}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              className="min-w-0 flex-1 resize-none bg-transparent px-3 py-1.5 text-base leading-relaxed outline-none placeholder:text-foreground-muted"
              placeholder="Message…"
              value={input}
              disabled={streaming}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              aria-label={streaming ? "Stop" : "Send"}
              className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
              onClick={streaming ? handleStop : handleSend}
              disabled={!streaming && !input.trim()}
            >
              {streaming ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 19V5M12 5L5 12M12 5L19 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
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
