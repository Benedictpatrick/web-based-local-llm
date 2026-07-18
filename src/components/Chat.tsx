"use client";

import { memo, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { ChatCompletionMessage } from "@wllama/wllama/esm/index.js";
import { db, type ChatMessage } from "@/lib/db";
import {
  AVAILABLE_MODELS,
  type GenerationStats,
  type ModelId,
  abortGeneration,
  getDefaultModelId,
  getDeviceInfo,
  getEngineKind,
  getLastGenerationStats,
  getLoadedContextSize,
  isAbortError,
  isEngineLostError,
  isStoragePersisted,
  isWasmSupported,
  loadEngine,
  streamChat,
} from "@/lib/llm";
import { topRelevantEntries, embedChunks, topRelevantChunks, type TextChunk } from "@/lib/retrieval";
import { extractTextFromFile, chunkText } from "@/lib/fileExtraction";
import { extractSolePythonBlock } from "@/lib/agentCode";
import { runPython } from "@/lib/pythonRunner";
import { transcribeAudio } from "@/lib/speechRecognition";
import ModelPicker from "@/components/ModelPicker";
import MarkdownMessage from "@/components/MarkdownMessage";
import LoadingScreen from "@/components/LoadingScreen";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        "Copied"
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
            <path
              d="M5 15V5a2 2 0 0 1 2-2h10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

const MessageHistory = memo(function MessageHistory({
  messages,
  regenerateTargetId,
  onRegenerate,
}: {
  messages: ChatMessage[];
  regenerateTargetId: number | null;
  onRegenerate: () => void;
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
          <div key={m.id} className="msg-enter flex flex-col gap-0.5">
            <div className="flex gap-3">
              <div className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0 flex-1 pt-1">
                <MarkdownMessage content={m.content} />
              </div>
            </div>
            <div className="flex items-center pl-5">
              <CopyButton text={m.content} />
              {regenerateTargetId === m.id && (
                <button
                  className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
                  onClick={onRegenerate}
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
              )}
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

const AGENT_INSTRUCTIONS =
  "\n\nYou can run Python to compute exact answers. If the question needs a calculation, data processing, or verification you can't do reliably in your head, reply with ONLY a fenced ```python code block — the code fence and nothing else. Zero words before it, zero words after it, not even one sentence like \"this is a large number\" or \"let me compute this\". Just the code fence, full stop. Its output will be shown to you next, and you must then give the final answer in plain language using that output. Only do this when real computation is needed; for everything else, answer normally without code.";

const MAX_AGENT_STEPS = 2;

const MAX_TEXTAREA_HEIGHT = 160;

const EXAMPLE_PROMPTS = [
  "Explain recursion with a simple example",
  "Quiz me on binary search trees",
  "Debug this code",
  "Summarize my notes on OS scheduling",
];

const STUCK_GENERATION_TIMEOUT_MS = 45_000;
const MAX_STUCK_RETRIES = 1;
const MAX_LOAD_RETRIES = 2;

export interface ChatHandle {
  openModelPicker: () => void;
}

export default function Chat({
  conversationId,
  onConversationChange,
  ref,
}: {
  conversationId: number | null;
  onConversationChange: (id: number) => void;
  ref?: React.Ref<ChatHandle>;
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
  const [lastStats, setLastStats] = useState<GenerationStats | null>(null);
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; chunks: TextChunk[] } | null>(
    null
  );
  const [attachingFile, setAttachingFile] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [micState, setMicState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingReplyRef = useRef<string>("");
  const flushScheduledRef = useRef(false);
  const autoLoadStartedRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const statusDetailTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 200) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      setShowScrollButton(false);
    }
  }, [messages, draftReply]);

  useEffect(() => {
    if (autoLoadStartedRef.current || !wasmSupported) return;
    autoLoadStartedRef.current = true;
    (async () => {
      const id = await getDefaultModelId();
      setModelId(id);
      setChangingModel(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (statusDetailTimeoutRef.current) clearTimeout(statusDetailTimeoutRef.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    openModelPicker: () => setChangingModel(true),
  }));


  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
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

    for (let attempt = 0; attempt <= MAX_LOAD_RETRIES; attempt++) {
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
        setStoragePersisted(persisted);
        const persistNote =
          persisted === false
            ? " — storage isn't marked durable yet; install this app to your home screen to stop it being evicted between visits"
            : "";
        setProgress(
          (sawPartialProgress
            ? `Downloaded and loaded in ${seconds}s`
            : `Loaded from local cache in ${seconds}s (no re-download)`) + persistNote
        );
        setHasLoadedOnce(true);
        setStatus("ready");
        setShowStatusDetail(true);
        statusDetailTimeoutRef.current = setTimeout(() => setShowStatusDetail(false), 6000);
        return;
      } catch (err) {
        console.error(err);
        if (attempt < MAX_LOAD_RETRIES) {
          const delayMs = 2000 * (attempt + 1);
          setProgress(
            `Load failed, retrying in ${Math.round(delayMs / 1000)}s… (attempt ${attempt + 2} of ${MAX_LOAD_RETRIES + 1})`
          );
          setProgressPct(null);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        setErrorText(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
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

    const systemPrompt = isCodeRequest
      ? CODE_PROMPT
      : SYSTEM_PROMPT + (agentMode ? AGENT_INSTRUCTIONS : "");
    await streamReply(
      [
        { role: "system", content: systemPrompt + (contextBlock ? `\n\n${contextBlock}` : "") },
        ...history,
      ],
      activeConversationId,
      {
        temperature: isCodeRequest || agentMode ? 0.3 : undefined,
        allowAgent: agentMode && !isCodeRequest,
      }
    );
  }

  async function streamReply(
    promptMessages: ChatCompletionMessage[],
    activeConversationId: number,
    opts?: { temperature?: number; allowAgent?: boolean }
  ) {
    setStreaming(true);
    setDraftReply("");
    setAgentStatus(null);

    const transcriptParts: string[] = [];
    let messages = promptMessages;
    let aborted = false;

    try {
      for (let step = 0; ; step++) {
        const prefix = transcriptParts.join("");
        let full = "";

        for (let attempt = 0; ; attempt++) {
          pendingReplyRef.current = "";
          full = "";
          let lastChunkAt = performance.now();
          let sawFirstChunk = false;
          let watchdogFired = false;
          const watchdog = setInterval(() => {
            if (sawFirstChunk && performance.now() - lastChunkAt > STUCK_GENERATION_TIMEOUT_MS) {
              watchdogFired = true;
              abortGeneration();
            }
          }, 2000);

          const scheduleFlush = () => {
            if (flushScheduledRef.current) return;
            flushScheduledRef.current = true;
            requestAnimationFrame(() => {
              setDraftReply(prefix + pendingReplyRef.current);
              flushScheduledRef.current = false;
            });
          };

          try {
            for await (const chunk of streamChat(messages, { temperature: opts?.temperature })) {
              sawFirstChunk = true;
              lastChunkAt = performance.now();
              full += chunk;
              pendingReplyRef.current = full;
              scheduleFlush();
            }
            clearInterval(watchdog);
            break;
          } catch (err) {
            clearInterval(watchdog);
            if (watchdogFired && attempt < MAX_STUCK_RETRIES) {
              continue;
            }
            if (watchdogFired) {
              console.error("Generation stalled with no response", err);
              full = full || "Generation stalled — please try again.";
              break;
            }
            if (isEngineLostError(err)) {
              console.error(err);
              full =
                full ||
                "Your device unloaded the model to free up memory. Reloading it now — please try again in a moment.";
              handleLoadModel(modelId);
            } else if (isAbortError(err)) {
              aborted = true;
            } else {
              console.error(err);
              const detail = err instanceof Error ? err.message : String(err);
              full = full || `Sorry, generation failed: ${detail}`;
            }
            break;
          }
        }

        const code =
          !aborted && opts?.allowAgent && step < MAX_AGENT_STEPS
            ? extractSolePythonBlock(full)
            : null;

        if (!code) {
          transcriptParts.push(full);
          break;
        }

        transcriptParts.push(full);
        setDraftReply(transcriptParts.join(""));
        setAgentStatus("Running code…");
        let outputText: string;
        try {
          outputText = (await runPython(code)).output;
        } catch (err) {
          console.error(err);
          const detail = err instanceof Error ? err.message : String(err);
          outputText = `Couldn't run the code: ${detail}`;
        }
        setAgentStatus(null);
        transcriptParts.push(`\n\n**Output:**\n\`\`\`\n${outputText}\n\`\`\`\n\n`);
        setDraftReply(transcriptParts.join(""));

        messages = [
          ...messages,
          { role: "assistant", content: full },
          {
            role: "user",
            content: `Code output:\n${outputText}\n\nUsing this output, give the final answer in plain language. Don't run more code unless truly necessary, and don't repeat the code.`,
          },
        ];
      }

      const full = transcriptParts.join("");
      if (full.trim()) {
        await db.chat.add({
          conversationId: activeConversationId,
          role: "assistant",
          content: full,
          createdAt: Date.now(),
        });
        await db.conversations.update(activeConversationId, { updatedAt: Date.now() });
      }
    } finally {
      setDraftReply("");
      setAgentStatus(null);
      setStreaming(false);
      setLastStats(getLastGenerationStats());
    }
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

  async function handleMicClick() {
    if (micState === "recording") {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (micState !== "idle") return;

    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        audioChunksRef.current = [];
        setMicState("transcribing");
        const url = URL.createObjectURL(blob);
        try {
          const text = await transcribeAudio(url);
          if (text) {
            setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
            textareaRef.current?.focus();
          } else {
            setMicError("Didn't catch that — try again.");
          }
        } catch (err) {
          console.error(err);
          setMicError("Couldn't transcribe that. Try again.");
        } finally {
          URL.revokeObjectURL(url);
          setMicState("idle");
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setMicState("recording");
    } catch (err) {
      console.error(err);
      setMicError("Microphone access denied or unavailable.");
      setMicState("idle");
    }
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
        {!hasLoadedOnce && (
          <>
            <div
              aria-hidden="true"
              className="mb-1 text-3xl font-bold tracking-tight text-foreground"
            >
              Navo
            </div>
            <p className="max-w-xs text-sm text-foreground-muted">
              A private study assistant that runs entirely on this device — nothing you type
              ever leaves your browser, and it keeps working offline.
            </p>
          </>
        )}
        <p className="mt-2 text-sm text-foreground-muted">
          {hasLoadedOnce ? "Choose a model to load" : "Pick a model to get started"}
        </p>
        {!hasLoadedOnce && (
          <p className="max-w-xs text-xs text-foreground-muted">
            {AVAILABLE_MODELS.find((m) => m.id === modelId)?.label} is recommended for this
            device, but you can pick a smaller one if downloads or loading are slow.
          </p>
        )}
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
        {hasLoadedOnce && (
          <button
            type="button"
            className="text-xs text-foreground-muted hover:text-foreground hover:underline"
            onClick={() => setChangingModel(false)}
          >
            Cancel
          </button>
        )}
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
        onChangeModel={() => setChangingModel(true)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2 text-xs text-foreground-muted sm:px-5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 truncate rounded-full bg-surface px-2.5 py-1">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span className="truncate">{AVAILABLE_MODELS.find((m) => m.id === modelId)?.label}</span>
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors hover:bg-surface hover:text-foreground ${
                showStats ? "bg-surface text-foreground" : ""
              }`}
              onClick={() => setShowStats((v) => !v)}
              aria-expanded={showStats}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 20V10M12 20V4M19 20v-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Stats
            </button>
            <button
              className="flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors hover:bg-surface hover:text-foreground disabled:opacity-50"
              onClick={() => setChangingModel(true)}
              disabled={streaming}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 12a9 9 0 0 1 15.3-6.4M21 12a9 9 0 0 1-15.3 6.4M3 5v6h6M21 19v-6h-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Change model
            </button>
          </div>
        </div>
        <div
          className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-out ${
            showStatusDetail ? "mt-0.5 max-h-24 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          {progress && <p>{progress}</p>}
        </div>
        {showStats &&
          (() => {
            const engine = getEngineKind();
            const device = getDeviceInfo();
            const ctx = getLoadedContextSize();
            return (
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-surface px-3 py-2">
                <span>Engine</span>
                <span className="text-foreground">
                  {engine === "webgpu" ? "WebGPU (GPU)" : engine === "wasm" ? "WASM (CPU)" : "—"}
                </span>
                <span>Device</span>
                <span className="text-foreground">
                  {device.cores ? `${device.cores} cores` : "cores unknown"}
                  {device.memoryGb ? ` · ~${device.memoryGb}GB RAM` : ""}
                </span>
                <span>Context window</span>
                <span className="text-foreground">{ctx ? `${ctx} tokens` : "model default"}</span>
                <span>Storage</span>
                <span className="text-foreground">
                  {storagePersisted === null
                    ? "unknown"
                    : storagePersisted
                      ? "persisted ✓"
                      : "not persisted ⚠"}
                </span>
                <span>Last reply</span>
                <span className="text-foreground">
                  {lastStats
                    ? `${lastStats.tokens} tokens in ${lastStats.seconds.toFixed(1)}s (${lastStats.tokensPerSec.toFixed(1)} tok/s)`
                    : "no replies yet"}
                </span>
              </div>
            );
          })()}
      </div>

      <div className="relative min-h-0 flex-1">
      <div
        ref={scrollContainerRef}
        className="h-full overflow-y-auto px-3 sm:px-5"
        onScroll={(e) => {
          const el = e.currentTarget;
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          setShowScrollButton(distanceFromBottom > 300);
        }}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-6">
          {(messages ?? []).length === 0 && !streaming && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
              <p className="text-sm text-foreground-muted">Ask anything to get started.</p>
              <div className="flex flex-wrap justify-center gap-2 px-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
                    onClick={() => {
                      setInput(prompt);
                      textareaRef.current?.focus();
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          <MessageHistory
            messages={messages ?? []}
            regenerateTargetId={
              !streaming &&
              (messages ?? []).length > 0 &&
              (messages ?? [])[(messages ?? []).length - 1].role === "assistant"
                ? (messages ?? [])[(messages ?? []).length - 1].id
                : null
            }
            onRegenerate={handleRegenerate}
          />
          {streaming && (
            <div className="msg-enter flex gap-3">
              <div className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0 flex-1 pt-1">
                {draftReply ? (
                  <>
                    <MarkdownMessage content={draftReply} />
                    {agentStatus && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-foreground-muted">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                        {agentStatus}
                      </p>
                    )}
                  </>
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
      {showScrollButton && (
        <button
          type="button"
          aria-label="Scroll to latest message"
          className="absolute bottom-3 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground-muted shadow-md transition-colors hover:text-foreground"
          onClick={() => {
            bottomRef.current?.scrollIntoView({ behavior: "auto" });
            setShowScrollButton(false);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 5v14M12 19l-6-6M12 19l6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      </div>

      <div
        className="px-3 pt-2 sm:px-5"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto w-full max-w-2xl">
          {(micState !== "idle" || micError) && (
            <div className="mb-2 flex items-center gap-2 text-xs">
              {micState === "recording" && (
                <span className="inline-flex items-center gap-1.5 text-red-500">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Listening… tap the mic to stop
                </span>
              )}
              {micState === "transcribing" && (
                <span className="text-foreground-muted">
                  Transcribing on-device… (first time downloads a ~150MB speech model)
                </span>
              )}
              {micError && <span className="text-red-500">{micError}</span>}
            </div>
          )}
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
          <div className="flex flex-col gap-1 rounded-3xl border border-border bg-surface px-3 pb-2 pt-3 shadow-sm">
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
            <textarea
              ref={textareaRef}
              rows={1}
              className="w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-foreground-muted"
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  aria-label="Attach a file"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-background hover:text-foreground disabled:opacity-30 sm:h-9 sm:w-9"
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
                <button
                  type="button"
                  aria-pressed={agentMode}
                  aria-label="Toggle auto-run code"
                  title="Let the assistant run Python automatically to compute exact answers"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-30 sm:h-9 sm:w-9 ${
                    agentMode
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground-muted hover:bg-background hover:text-foreground"
                  }`}
                  onClick={() => setAgentMode((v) => !v)}
                  disabled={streaming}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={micState === "recording" ? "Stop recording" : "Record a voice message"}
                  title="Speak instead of typing — transcribed on-device, audio never leaves your browser. First use downloads a ~150MB speech model."
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-30 sm:h-9 sm:w-9 ${
                    micState === "recording"
                      ? "bg-red-500 text-white"
                      : "text-foreground-muted hover:bg-background hover:text-foreground"
                  }`}
                  onClick={handleMicClick}
                  disabled={streaming || micState === "transcribing"}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M19 11a7 7 0 0 1-14 0M12 19v3"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  aria-label={streaming ? "Stop" : "Send"}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-30 sm:h-9 sm:w-9"
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
            </div>
          </div>
          {lastStats && (
            <p className="mt-2 text-center text-xs text-foreground-muted">
              {lastStats.tokensPerSec.toFixed(1)} tokens/sec
              {lastStats.engine === "webgpu" ? " (GPU)" : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
