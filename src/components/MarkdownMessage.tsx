"use client";

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { runPython } from "@/lib/pythonRunner";

// Bridges the gap between the LaTeX small models actually emit and the narrow
// slice remark-math accepts. Two mismatches, both verified against the parser:
//
//   1. Models use \(…\) and \[…\] about as often as the dollar forms, and
//      remark-math understands only dollars — the rest renders as literal
//      backslashes.
//   2. remark-math treats a one-line $$x$$ as *inline* math; display mode
//      needs the $$ fences on their own lines. Models overwhelmingly write
//      the one-line form, so without this every display equation comes out
//      cramped inline instead of centered on its own row.
//
// None of it may touch code, where a backslash-paren is the author's literal
// text (a regex, an escape) rather than a formula. Splitting on a capture
// group parks code spans at odd indices so they pass through untouched.
function normalizeMathDelimiters(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((segment, i) =>
      i % 2 === 1
        ? segment
        : segment
            // Blank lines around the fence keep the block out of an adjacent
            // paragraph, which math-flow can't interrupt.
            .replace(
              /\\\[([\s\S]+?)\\\]/g,
              (_, body) => `\n\n$$\n${body.trim()}\n$$\n\n`
            )
            .replace(/\\\(([\s\S]+?)\\\)/g, (_, body) => `$${body}$`)
            // Only promote a $$…$$ that owns its whole line, and only at
            // column 0: indented math is usually inside a list item, where
            // injecting blank lines would split the list apart.
            .replace(
              /^\$\$([^\n]+?)\$\$[ \t]*$/gm,
              (_, body) => `\n\n$$\n${body.trim()}\n$$\n\n`
            )
    )
    .join("");
}

// Pyodide only — running arbitrary JS in a Worker isn't a real sandbox (it
// can still fetch()), so that's not offered here at all rather than
// mislabeled as safe. Python covers the common case for this app anyway.
const RUNNABLE_LANGUAGES = new Set(["python", "py"]);

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ output: string; ok: boolean } | null>(null);

  const runnable = RUNNABLE_LANGUAGES.has(language.toLowerCase());

  async function handleRun() {
    setRunning(true);
    setResult(null);
    try {
      setResult(await runPython(code));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border text-[13px]">
      <div className="flex items-center justify-between bg-surface px-3 py-1.5 text-xs text-foreground-muted">
        <span>{language || "text"}</span>
        <div className="flex items-center gap-1">
          {runnable && (
            <button
              type="button"
              className="rounded px-1.5 py-0.5 transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
              onClick={handleRun}
              disabled={running}
              title="Runs in your browser via Pyodide (experimental). The first run on this device downloads the Python runtime, which needs a network connection."
            >
              {running ? "Running…" : "▶ Run"}
            </button>
          )}
          <button
            type="button"
            className="rounded px-1.5 py-0.5 transition-colors hover:bg-surface-hover hover:text-foreground"
            onClick={() => {
              navigator.clipboard.writeText(code).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={language || "text"}
          style={oneDark}
          customStyle={{
            margin: 0,
            padding: "12px 14px",
            background: "transparent",
            fontSize: "inherit",
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
      {result && (
        <pre
          className={`overflow-x-auto whitespace-pre-wrap border-t border-border px-3 py-2 font-mono text-xs ${
            result.ok ? "text-foreground-muted" : "text-red-500"
          }`}
        >
          {result.output}
        </pre>
      )}
    </div>
  );
}

// react-markdown v9+ dropped the `inline` flag from the code renderer —
// block-level fenced code is distinguished by being wrapped in a `pre`,
// so that's the reliable place to detect it, not `code` itself.
const components: Components = {
  code({ className, children, ...rest }) {
    return (
      <code
        className={className ?? "rounded bg-surface px-1.5 py-0.5 text-[0.85em]"}
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre({ children }) {
    const codeEl = children as React.ReactElement<{
      className?: string;
      children?: React.ReactNode;
    }> | null;
    const className = codeEl?.props?.className ?? "";
    const match = /language-(\w+)/.exec(className);
    const codeText = String(codeEl?.props?.children ?? "").replace(/\n$/, "");
    return <CodeBlock language={match?.[1] ?? ""} code={codeText} />;
  },
  p({ children }) {
    return <p className="mb-2 last:mb-0">{children}</p>;
  },
  ul({ children }) {
    return <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>;
  },
  a({ children, href }) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-accent underline">
        {children}
      </a>
    );
  },
};

export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="max-w-none text-[15px] leading-relaxed [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        // throwOnError would turn one malformed formula from a 1B model into a
        // thrown render — and this renders mid-stream, on every token, over
        // half-finished LaTeX. Render the bad bit in red and keep going.
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={components}
      >
        {normalizeMathDelimiters(content)}
      </ReactMarkdown>
    </div>
  );
}
