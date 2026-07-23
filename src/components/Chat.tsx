"use client";

import { memo, useEffect, useImperativeHandle, useRef, useState } from "react";
import dynamic from "next/dynamic";
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
  requestPersistentStorage,
  isWasmSupported,
  loadEngine,
  modelDisplayParts,
} from "@/lib/llm";
import { generateOnce } from "@/lib/generation";
import { runResearch } from "@/lib/research";
import { searchWeb } from "@/lib/webSearch";
import { topRelevantEntries, embedChunks, topRelevantChunks, type TextChunk } from "@/lib/retrieval";
import {
  isMemoryEnabled,
  buildMemoriesBlock,
  topRelevantMemories,
  saveExtractedMemories,
  getUserName,
} from "@/lib/memory";
import { extractTextFromFile, chunkText } from "@/lib/fileExtraction";
import { extractSolePythonBlock } from "@/lib/agentCode";
import { runPython } from "@/lib/pythonRunner";
import { transcribeAudio, type SpeechModelProgress } from "@/lib/speechRecognition";
import { shareOrDownloadBenchmarkCard } from "@/lib/shareCard";
import { haptic } from "@/lib/haptics";
import ModelPicker from "@/components/ModelPicker";
import LoadingScreen from "@/components/LoadingScreen";
import InstallBanner from "@/components/InstallBanner";
import ResearchScopeModal, { type ResearchScopeAnswers } from "@/components/ResearchScopeModal";
import ResearchProgress, { type ResearchStep } from "@/components/ResearchProgress";
import ModeSwitch from "@/components/ModeSwitch";
import ResearchSplash from "@/components/ResearchSplash";

// react-markdown + katex + the syntax-highlighter's language grammars are
// ~650KB on their own and aren't needed until a message actually renders, so
// they're split out of the initial bundle. loadMarkdownMessage() below warms
// this chunk in parallel with the (much slower) model download, so it's
// already cached by the time the first reply needs to render.
const loadMarkdownMessage = () => import("@/components/MarkdownMessage");
const MarkdownMessage = dynamic(loadMarkdownMessage, {
  loading: () => <div className="h-5 w-32 animate-pulse rounded bg-surface" />,
});

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
      onClick={() => {
        haptic("tap");
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
  "You are Navo, a private offline AI assistant running entirely on this device, so nothing the user types ever leaves their browser. Always answer the user's most recent message, directly and briefly: 1-3 sentences unless they ask for detail, a list, or code. Never include code unless they explicitly ask for code; when they do, give complete working code in a fenced block tagged with the language name. Code must be plain code with no LaTeX in it. If saved notes or things you know about the user are provided below, use them naturally without mentioning them, and never assume details about the user that aren't given.";

// Kept out of SYSTEM_PROMPT and only appended for messages MATH_RE flags as
// math-related: the smallest models imitate the literal "$...$"/"$$...$$"
// delimiter syntax shown here even on unrelated questions (e.g. answering
// "what's my name" with a stray "\frac{1}{2}" glued to the front), the same
// class of failure documented for concrete code/equation examples in the
// prompt -- see the SMALL_TALK_RE split below for the established fix.
const MATH_INSTRUCTIONS =
  " Write any mathematics in LaTeX between single dollar signs, never plain text or unicode symbols.";

const MATH_RE =
  /\b(math|maths|equation|formula|solve|calculate|calculus|algebra|geometry|probability|matrix|matrices|logarithm|derivative|integral|summation|theorem|proof|big-?o)\b/i;

// Answered directly, bypassing the model entirely: small models are
// unreliable at repeating a fact injected via the system prompt (see the
// MATH_RE/memory work elsewhere in this file), so a founder question gets a
// fixed, correct answer instead of hoping the model gets it right.
const FOUNDER_ANSWER = "Navo AI was founded by Benedict Patrick and Saidharshan.";

// The "you" branch requires end-of-message (not just a word boundary) so
// "who made you happy/laugh/say that" isn't hijacked into a founder answer --
// nobody says "who made Navo happy", so only the bare pronoun is ambiguous.
const FOUNDER_RE =
  /\bwho\s+(made|makes|builds?|built|creates?|created|founded|founds?|develops?|developed|designed|designs?|owns?|runs?|is\s+behind)\s+(navo(?:\s+ai)?\b|you(?=[\s?.!,]*$))|\b(navo(?:\s+ai)?|your)\s*'?s?\s+(founder|creator|maker|owner|developer)s?\b|\b(founder|creator|maker|owner|developer)s?\s+of\s+(navo(?:\s+ai)?|you)\b/i;

const SMALL_TALK_PROMPT =
  "You are Navo, a friendly private offline AI assistant. The user is greeting you or making small talk. Reply with one short, warm sentence that answers them and invites a question.";

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

const RESEARCH_EXAMPLE_PROMPTS = [
  "Compare renewable energy sources",
  "Deep dive into the history of the internet",
  "Research the pros and cons of remote work",
  "Investigate how vaccines are developed",
];

const MAX_LOAD_RETRIES = 2;

export interface ChatHandle {
  openModelPicker: () => void;
  loadModel: (id: ModelId) => void;
  switchToResearch: () => void;
}

export default function Chat({
  conversationId,
  onConversationChange,
  onBrowseModelHub,
  ref,
}: {
  conversationId: number | null;
  onConversationChange: (id: number) => void;
  onBrowseModelHub?: () => void;
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
  const [sharingCard, setSharingCard] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; chunks: TextChunk[] } | null>(
    null
  );
  const [attachingFile, setAttachingFile] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [researchMode, setResearchMode] = useState(false);
  const [modeSwitching, setModeSwitching] = useState<"to-research" | "to-navo" | null>(null);
  const [researchStatus, setResearchStatus] = useState<ResearchStep[]>([]);
  const [researchScopeOpen, setResearchScopeOpen] = useState(false);
  const [pendingResearchTopic, setPendingResearchTopic] = useState<string | null>(null);
  const [pendingResearchConversationId, setPendingResearchConversationId] = useState<
    number | null
  >(null);
  const [userName, setUserNameState] = useState<string | null>(null);
  const [micState, setMicState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [micProgress, setMicProgress] = useState<SpeechModelProgress | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    let cancelled = false;
    getUserName().then((name) => {
      if (!cancelled) setUserNameState(name);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    openModelPicker: () => setChangingModel(true),
    loadModel: (id: ModelId) => {
      setChangingModel(false);
      setModelId(id);
      handleLoadModel(id);
    },
    switchToResearch: () => handleModeSwitch("research"),
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
    loadMarkdownMessage();
    setStatus("loading");
    setErrorText("");
    setProgress("");
    setProgressPct(null);
    setShowStatusDetail(false);
    if (statusDetailTimeoutRef.current) clearTimeout(statusDetailTimeoutRef.current);

    // Request durable storage before the download so the eviction warning is
    // shown while the model is downloading, not after it has already landed.
    setStoragePersisted(await requestPersistentStorage());

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
        setProgress(
          sawPartialProgress
            ? `Downloaded and loaded in ${seconds}s`
            : `Loaded from local cache in ${seconds}s (no download needed)`
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
    if (FOUNDER_RE.test(userText)) {
      await db.chat.add({
        conversationId: activeConversationId,
        role: "assistant",
        content: FOUNDER_ANSWER,
        createdAt: Date.now(),
      });
      await db.conversations.update(activeConversationId, { updatedAt: Date.now() });
      return;
    }

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

    const memoriesBlock = isMemoryEnabled()
      ? buildMemoriesBlock(await topRelevantMemories(userText, 3))
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

    const contextBlock = notesBlock + memoriesBlock + fileBlock;

    const isCodeRequest = CODE_RE.test(userText);
    const MAX_HISTORY_MESSAGES = isCodeRequest ? 2 : 6;
    const history = (
      await db.chat.where("conversationId").equals(activeConversationId).sortBy("createdAt")
    )
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m): ChatCompletionMessage => ({ role: m.role, content: m.content }));

    const systemPrompt = isCodeRequest
      ? CODE_PROMPT
      : SYSTEM_PROMPT +
        (MATH_RE.test(userText) ? MATH_INSTRUCTIONS : "") +
        (agentMode ? AGENT_INSTRUCTIONS : "");
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

    // Learn durable facts from the user's message after the reply has streamed,
    // so it never delays the first token. Fire and forget; failures are ignored.
    if (isMemoryEnabled()) {
      void saveExtractedMemories(userText).catch(() => {});
    }
  }

  async function generateResearchReply(
    activeConversationId: number,
    topic: string,
    answers: ResearchScopeAnswers
  ) {
    setStreaming(true);
    setDraftReply("");
    setResearchStatus([]);

    // Broadened retrieval (higher k, lower threshold than normal chat's top-3/0.3)
    // so research genuinely searches across saved context instead of just the
    // handful of closest matches -- see the threshold param added to
    // topRelevantEntries/topRelevantChunks/topRelevantMemories for this.
    let contextBlock = "";
    if (answers.useGrounding) {
      const relevant = await topRelevantEntries(topic, journalEntries ?? [], 10, 0.15);
      const notesBlock =
        relevant.length > 0
          ? `Relevant notes the user saved earlier:\n${relevant
              .map((e) => `- ${e.text}`)
              .join("\n")}\n\n`
          : "";

      const memoriesBlock = isMemoryEnabled()
        ? buildMemoriesBlock(await topRelevantMemories(topic, 10, 0.15))
        : "";

      const fileChunks = attachedFile
        ? await topRelevantChunks(topic, attachedFile.chunks, 10, 0.15)
        : [];
      const fileBlock =
        fileChunks.length > 0
          ? `Excerpts from the uploaded file "${attachedFile?.name}":\n${fileChunks
              .map((c) => `- ${c}`)
              .join("\n")}\n\n`
          : "";

      contextBlock = notesBlock + memoriesBlock + fileBlock;
    }

    try {
      const { transcript } = await runResearch({
        topic,
        depth: answers.depth,
        contextBlock,
        userClarification: answers.clarification,
        generate: generateOnce,
        search: answers.useWebSearch ? searchWeb : undefined,
        onSubQuestionStart: (i, question) => {
          setResearchStatus((prev) => {
            const next = [...prev];
            next[i] = { question, state: answers.useWebSearch ? "searching" : "active" };
            return next;
          });
        },
        onSearchDone: (i, sources) => {
          setResearchStatus((prev) => {
            const next = [...prev];
            if (next[i]) next[i] = { ...next[i], state: "active", sources };
            return next;
          });
        },
        onSubQuestionDone: (i) => {
          setResearchStatus((prev) => {
            const next = [...prev];
            if (next[i]) next[i] = { ...next[i], state: "done" };
            return next;
          });
        },
        onDelta: (text) => setDraftReply(text),
      });

      const full =
        transcript.trim() || "Sorry, I didn't generate a research report there — please try again.";
      await db.chat.add({
        conversationId: activeConversationId,
        role: "assistant",
        content: full,
        createdAt: Date.now(),
      });
      await db.conversations.update(activeConversationId, { updatedAt: Date.now() });
    } finally {
      setDraftReply("");
      setResearchStatus([]);
      setStreaming(false);
      setLastStats(getLastGenerationStats());
    }
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

        const result = await generateOnce(messages, {
          temperature: opts?.temperature,
          onDelta: (text) => setDraftReply(prefix + text),
          onEngineLost: () => handleLoadModel(modelId),
        });
        const full = result.text;
        if (result.aborted) aborted = true;

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

      let full = transcriptParts.join("");
      if (!full.trim()) {
        full = "Sorry, I didn't generate a response there — please try again.";
      }
      await db.chat.add({
        conversationId: activeConversationId,
        role: "assistant",
        content: full,
        createdAt: Date.now(),
      });
      await db.conversations.update(activeConversationId, { updatedAt: Date.now() });
    } finally {
      setDraftReply("");
      setAgentStatus(null);
      setStreaming(false);
      setLastStats(getLastGenerationStats());
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming || status !== "ready" || researchScopeOpen) return;

    haptic("tap");
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

    if (researchMode) {
      setPendingResearchTopic(text);
      setPendingResearchConversationId(activeConversationId);
      setResearchScopeOpen(true);
      return;
    }

    await generateReply(activeConversationId, text);
  }

  async function handleRegenerate() {
    if (!conversationId || streaming || status !== "ready") return;
    const all = messages ?? [];
    const last = all[all.length - 1];
    if (!last || last.role !== "assistant") return;
    const lastUser = [...all].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    haptic("tap");
    await db.chat.delete(last.id);
    await generateReply(conversationId, lastUser.content);
  }

  function handleStop() {
    haptic("tap");
    abortGeneration();
  }

  // Entering Navo Research gets the full 5s branded splash (ResearchSplash);
  // returning to plain Navo keeps the quick ~550ms beat -- there's nothing to
  // announce on the way back, so a matching 5s hold would just feel slow.
  const TO_RESEARCH_TRANSITION_MS = 5000;
  const TO_NAVO_TRANSITION_MS = 550;

  function handleModeSwitch(mode: "navo" | "research") {
    if (streaming || modeSwitching) return;
    haptic("tap");
    const toResearch = mode === "research";
    setModeSwitching(toResearch ? "to-research" : "to-navo");
    if (toResearch) setAgentMode(false);
    setTimeout(
      () => {
        setResearchMode(toResearch);
        setModeSwitching(null);
      },
      toResearch ? TO_RESEARCH_TRANSITION_MS : TO_NAVO_TRANSITION_MS
    );
  }

  async function handleMicClick() {
    if (micState === "recording") {
      haptic("tap");
      mediaRecorderRef.current?.stop();
      return;
    }
    if (micState !== "idle") return;

    haptic("tap");
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
          const text = await transcribeAudio(url, setMicProgress);
          if (text) {
            setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
            textareaRef.current?.focus();
          } else {
            haptic("warning");
            setMicError("Didn't catch that. Try again.");
          }
        } catch (err) {
          console.error(err);
          haptic("warning");
          setMicError("Couldn't transcribe that. Try again.");
        } finally {
          URL.revokeObjectURL(url);
          setMicState("idle");
          setMicProgress(null);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setMicState("recording");
    } catch (err) {
      console.error(err);
      haptic("warning");
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
        the model on your device. Try a recent version of Chrome, Edge, Firefox, or
        Safari.
      </div>
    );
  }

  if (changingModel) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        {!hasLoadedOnce && (
          <>
            <h1 className="mb-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/navo-wordmark.png" alt="Navo AI" className="h-10 w-auto" />
            </h1>
            <p className="max-w-xs text-sm text-foreground-muted">
              Navo AI is a private, offline AI assistant that runs entirely on this device.
              Nothing you type ever leaves your browser, and it keeps working offline.
            </p>
            <div className="mt-3 flex flex-col items-center gap-1.5">
              <div className="h-px w-10 bg-border" />
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-foreground-muted/70">
                Made by
              </p>
              <p className="text-xs font-medium text-foreground-muted">
                Benedict Patrick &amp; Saidharshan
              </p>
            </div>
          </>
        )}
        <p className="mt-2 text-sm text-foreground-muted">
          {hasLoadedOnce ? "Choose a model to load" : "Pick a model to get started"}
        </p>
        {!hasLoadedOnce && (
          <p className="max-w-xs text-xs text-foreground-muted">
            {(() => {
              const rec = AVAILABLE_MODELS.find((m) => m.id === modelId);
              return rec ? modelDisplayParts(rec).name : modelId;
            })()}{" "}
            is recommended for this device, but you can pick a smaller one if downloads or
            loading are slow.
          </p>
        )}
        {!hasLoadedOnce &&
          (() => {
            const memoryGb = getDeviceInfo().memoryGb;
            return memoryGb !== null && memoryGb <= 2 ? (
              <p className="max-w-xs text-xs text-amber-500">
                Your device is reporting limited memory ({memoryGb}GB). Even the smallest model
                may crash this tab. Closing other apps and tabs first can help.
              </p>
            ) : null;
          })()}
        <div className="flex max-w-xs items-center gap-2">
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
            onBrowseMore={onBrowseModelHub}
          />
          <button
            type="button"
            className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            onClick={() => {
              haptic("tap");
              setChangingModel(false);
              handleLoadModel(modelId);
            }}
          >
            Load
          </button>
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
        storagePersisted={storagePersisted}
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
          <ModelPicker
            variant="chip"
            value={modelId}
            disabled={streaming}
            onChange={(id) => {
              setModelId(id);
              handleLoadModel(id);
            }}
            onModelDeleted={(id) => {
              if (id === modelId) setProgress("");
            }}
            onBrowseMore={onBrowseModelHub}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`glass-chip flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:text-foreground ${showStats ? "text-foreground" : ""}`}
              onClick={() => setShowStats((v) => !v)}
              aria-expanded={showStats}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0">
                <path
                  d="M4 20V10M10 20V4M16 20v-7M22 20H2"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Stats
            </button>
            {lastStats && (
              <button
                type="button"
                className="glass-chip flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:text-foreground disabled:opacity-50"
                disabled={sharingCard}
                onClick={async () => {
                  haptic("tap");
                  setSharingCard(true);
                  try {
                    const selected = AVAILABLE_MODELS.find((m) => m.id === modelId);
                    const device = getDeviceInfo();
                    await shareOrDownloadBenchmarkCard({
                      modelName: selected ? modelDisplayParts(selected).name : modelId,
                      engine: lastStats.engine,
                      tokensPerSec: lastStats.tokensPerSec,
                      cores: device.cores,
                      memoryGb: device.memoryGb,
                    });
                  } finally {
                    setSharingCard(false);
                  }
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0">
                  <path
                    d="M12 4v12M12 4 7 9m5-5 5 5M5 20h14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {sharingCard ? "Sharing…" : "Share"}
              </button>
            )}
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
      <InstallBanner storagePersisted={storagePersisted} />

      <div className="relative min-h-0 flex-1">
      {modeSwitching === "to-research" && <ResearchSplash />}
      {modeSwitching === "to-navo" && (
        <div className="msg-enter absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background/95 backdrop-blur-sm">
          <span className="inline-flex gap-1.5">
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent" />
          </span>
          <p className="text-sm font-medium text-foreground-muted">Switching to Navo…</p>
        </div>
      )}
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
              <p className="text-sm text-foreground-muted">
                {researchMode
                  ? userName
                    ? `What do you want to research, ${userName}?`
                    : "What do you want to research?"
                  : userName
                    ? `Hey ${userName}, ask anything to get started.`
                    : "Ask anything to get started."}
              </p>
              <div className="flex flex-wrap justify-center gap-2 px-2">
                {(researchMode ? RESEARCH_EXAMPLE_PROMPTS : EXAMPLE_PROMPTS).map((prompt) => (
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
                  <MarkdownMessage content={draftReply} />
                ) : (
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-muted [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-muted [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-muted" />
                  </span>
                )}
                {agentStatus && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-foreground-muted">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                    {agentStatus}
                  </p>
                )}
                {researchStatus.length > 0 && (
                  <div className="mt-1">
                    <ResearchProgress steps={researchStatus} />
                  </div>
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
          <div className="mb-2 flex justify-center">
            <ModeSwitch
              active={researchMode ? "research" : "navo"}
              onChange={handleModeSwitch}
              disabled={streaming || modeSwitching !== null}
            />
          </div>
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
                  {micProgress
                    ? `Downloading speech model… ${Math.round(
                        (micProgress.loaded / micProgress.total) * 100
                      )}% (${(micProgress.loaded / 1024 / 1024).toFixed(0)} / ${(
                        micProgress.total /
                        1024 /
                        1024
                      ).toFixed(0)} MB)`
                    : "Transcribing on your device…"}
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
          <div className="glass-panel flex flex-col gap-1 rounded-3xl px-3 pb-2 pt-3 shadow-sm">
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
                  className="glass-chip flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground-muted transition-colors hover:text-foreground disabled:opacity-30 sm:h-9 sm:w-9"
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
                  aria-label="Toggle automatic code running"
                  title="Let the assistant run Python automatically to compute exact answers"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-30 sm:h-9 sm:w-9 ${
                    agentMode
                      ? "glass-sheen bg-accent text-accent-foreground"
                      : "glass-chip text-foreground-muted hover:text-foreground"
                  }`}
                  onClick={() => setAgentMode((v) => !v)}
                  disabled={streaming || researchMode}
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
                  title="Speak instead of typing. Transcribed on your device, audio never leaves your browser. First use downloads a ~150MB speech model."
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-30 sm:h-9 sm:w-9 ${
                    micState === "recording"
                      ? "glass-sheen bg-red-500 text-white"
                      : "glass-chip text-foreground-muted hover:text-foreground"
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
                  className="glass-sheen flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-30 sm:h-9 sm:w-9"
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
          <p className="mt-2 text-center text-xs text-foreground-muted">
            Navo can make mistakes. Check important info.
          </p>
        </div>
      </div>
      <ResearchScopeModal
        open={researchScopeOpen}
        topic={pendingResearchTopic ?? ""}
        onClose={() => setResearchScopeOpen(false)}
        onStart={(answers) => {
          if (pendingResearchConversationId !== null && pendingResearchTopic !== null) {
            generateResearchReply(pendingResearchConversationId, pendingResearchTopic, answers);
          }
        }}
      />
    </div>
  );
}
