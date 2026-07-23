import type { ChatCompletionMessage } from "@wllama/wllama/esm/index.js";
import type { GenerateOnceOptions } from "./generation";
import { extractNumberedList, extractSingleQuestion } from "./researchParsing";

/** Matches generateOnce's signature -- injected rather than imported directly
 *  so this module stays engine-agnostic and unit-testable with a mock. */
export type GenerateOnceFn = (
  messages: ChatCompletionMessage[],
  opts?: GenerateOnceOptions
) => Promise<{ text: string; aborted: boolean }>;

/** Matches searchWeb's signature -- injected for the same reason as
 *  GenerateOnceFn: keeps this module free of a direct fetch/network dependency. */
export type WebSearchFn = (
  query: string
) => Promise<{ contextBlock: string; sources: { title: string; url: string }[] }>;

export const RESEARCH_PERSONA =
  "You are Navo Research, an assistant built specifically for in-depth research (as distinct from Navo's general chat persona). Be thorough, structured, and precise rather than brief.";

export const MAX_SUBQUESTIONS = 3;

/**
 * Asks the model to break a topic into focused sub-questions. Falls back to
 * treating the topic as its own sole sub-question if the response doesn't
 * parse as a clean numbered list -- decomposition failing should degrade to
 * "answer directly," never break the flow (same philosophy as agent mode's
 * extractSolePythonBlock: strict parse, graceful fallback on null).
 */
export async function decomposeQuestion(
  topic: string,
  generate: GenerateOnceFn
): Promise<string[]> {
  const { text } = await generate(
    [
      {
        role: "system",
        content:
          "List up to 3 focused sub-questions that would help thoroughly answer the user's research topic. Reply with ONLY a numbered list, one sub-question per line, nothing else.",
      },
      { role: "user", content: topic },
    ],
    { temperature: 0.3 }
  );
  const items = extractNumberedList(text, MAX_SUBQUESTIONS);
  return items && items.length > 0 ? items : [topic];
}

/**
 * Asks the model to propose one topic-specific clarifying question. Returns
 * null (silently, no error) if the response isn't a single clean question or
 * the model decided none was needed -- this is the "hoped-for" step of
 * Navo Research's scoping flow, not a required one.
 */
export async function proposeClarifyingQuestion(
  topic: string,
  generate: GenerateOnceFn
): Promise<string | null> {
  const { text } = await generate(
    [
      {
        role: "system",
        content:
          'The user wants to research a topic. If one short clarifying question would meaningfully narrow the scope, reply with ONLY that question on a single line, ending in a question mark, nothing else. If no clarification is needed, reply with exactly: none',
      },
      { role: "user", content: topic },
    ],
    { temperature: 0.3 }
  );
  if (text.trim().toLowerCase() === "none") return null;
  return extractSingleQuestion(text);
}

export interface RunResearchOptions {
  topic: string;
  depth: "quick" | "deep";
  /** Pre-built notes/memories/file context block, "" if grounding was skipped. */
  contextBlock: string;
  userClarification?: string;
  generate: GenerateOnceFn;
  /** If provided, runs a web search per sub-question (or once for a quick pass)
   *  and folds the results into that generation's context. Omit to skip web
   *  search entirely -- research still works purely off the model otherwise. */
  search?: WebSearchFn;
  onSubQuestionStart: (index: number, question: string) => void;
  /** Fires right after the web search for a sub-question resolves (only ever
   *  called when `search` was provided), before that sub-question's generate
   *  call starts -- lets the UI switch from a "searching" to "answering" state
   *  and render which sources came back. */
  onSearchDone?: (index: number, sources: { title: string; url: string }[]) => void;
  onSubQuestionDone: (index: number, answer: string) => void;
  /** Live-streaming callback, mirrors generateOnce's onDelta for the composer's draft display. */
  onDelta?: (fullTranscriptSoFar: string) => void;
}

/**
 * Runs the full research pipeline: decompose (unless depth is "quick") into
 * sub-questions, answer each sequentially -- only one model generation can be
 * in flight at a time, so this never parallelizes -- then synthesize a final
 * report. Returns one joined transcript string, matching agent mode's
 * existing single-collapsed-message persistence pattern (no schema change).
 */
export async function runResearch(
  opts: RunResearchOptions
): Promise<{ transcript: string }> {
  const {
    topic,
    depth,
    contextBlock,
    userClarification,
    generate,
    search,
    onSubQuestionStart,
    onSearchDone,
    onSubQuestionDone,
    onDelta,
  } = opts;

  const subQuestions = depth === "quick" ? [topic] : await decomposeQuestion(topic, generate);
  const isSinglePass = subQuestions.length === 1 && subQuestions[0] === topic;

  const clarificationLine = userClarification
    ? `The user additionally clarified: ${userClarification}\n\n`
    : "";

  const parts: string[] = [];
  const subAnswers: { question: string; answer: string }[] = [];
  // Collected across every sub-question and appended once, verbatim, at the
  // end -- deterministic, not model-generated, so links can't get mangled by
  // a small model paraphrasing a URL.
  const allSources: { title: string; url: string }[] = [];

  for (let i = 0; i < subQuestions.length; i++) {
    const subQuestion = subQuestions[i];
    onSubQuestionStart(i, subQuestion);

    let webBlock = "";
    if (search) {
      const { contextBlock: block, sources } = await search(subQuestion);
      webBlock = block;
      for (const s of sources) {
        if (!allSources.some((existing) => existing.url === s.url)) allSources.push(s);
      }
      onSearchDone?.(i, sources);
    }

    const prefix = parts.join("");
    const header = isSinglePass ? "" : `### ${subQuestion}\n`;
    const { text } = await generate(
      [
        {
          role: "system",
          content:
            `${RESEARCH_PERSONA}` +
            (isSinglePass
              ? ""
              : " Answer concisely (2-4 sentences) -- this is one part of a larger research report, not the final answer.") +
            (webBlock ? " Use the web search results below for current information." : "") +
            (contextBlock ? `\n\n${contextBlock}` : "") +
            (webBlock ? `\n\n${webBlock}` : ""),
        },
        {
          role: "user",
          content: isSinglePass
            ? `${clarificationLine}${topic}`
            : `${clarificationLine}Research topic: ${topic}\n\nFocus specifically on: ${subQuestion}`,
        },
      ],
      {
        temperature: 0.4,
        onDelta: (delta) => onDelta?.(prefix + header + delta),
      }
    );

    parts.push(`${header}${text}\n\n`);
    subAnswers.push({ question: subQuestion, answer: text });
    onSubQuestionDone(i, text);
  }

  const sourcesFooter =
    allSources.length > 0
      ? `\n\n### Sources\n${allSources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`).join("\n")}`
      : "";

  // A single pass that already covers the whole topic (quick mode, or
  // decomposition falling back to [topic]) already stands alone as the
  // report -- a synthesis pass over one answer would be redundant.
  if (isSinglePass) {
    return { transcript: (parts.join("").trim() + sourcesFooter).trim() };
  }

  const prefix = parts.join("");
  const summaryHeader = "### Summary\n";
  const { text: synthesis } = await generate(
    [
      {
        role: "system",
        content: `${RESEARCH_PERSONA} Combine the research below into one clear, structured final answer to the user's original topic.`,
      },
      {
        role: "user",
        content:
          `${clarificationLine}Research topic: ${topic}\n\n` +
          subAnswers.map((s) => `${s.question}\n${s.answer}`).join("\n\n"),
      },
    ],
    {
      temperature: 0.4,
      onDelta: (delta) => onDelta?.(prefix + summaryHeader + delta),
    }
  );

  parts.push(`${summaryHeader}${synthesis}`);
  return { transcript: (parts.join("").trim() + sourcesFooter).trim() };
}
