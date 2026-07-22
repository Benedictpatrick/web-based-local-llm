"use client";

import { useState } from "react";
import { unstable_catchError, type ErrorInfo } from "next/error";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import { runPython } from "@/lib/pythonRunner";
import { guessLanguage } from "@/lib/codeLanguage";

// PrismLight ships no grammars by default, so register the ones the assistant
// actually emits. These mirror codeLanguage.ts plus the common tags models tag
// blocks with. Unregistered languages fall back to plain text.
for (const [name, syntax] of [
  ["bash", bash],
  ["cpp", cpp],
  ["csharp", csharp],
  ["css", css],
  ["java", java],
  ["javascript", javascript],
  ["json", json],
  ["jsx", jsx],
  ["markdown", markdown],
  ["markup", markup],
  ["html", markup],
  ["python", python],
  ["sql", sql],
  ["tsx", tsx],
  ["typescript", typescript],
] as const) {
  SyntaxHighlighter.registerLanguage(name, syntax);
}

function normalizeMathDelimiters(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((segment, i) =>
      i % 2 === 1
        ? segment
        : segment
            .replace(
              /\\\[([\s\S]+?)\\\]/g,
              (_, body) => `\n\n$$\n${body.trim()}\n$$\n\n`
            )
            .replace(/\\\(([\s\S]+?)\\\)/g, (_, body) => `$${body}$`)
            .replace(
              /^\$\$([^\n]+?)\$\$[ \t]*$/gm,
              (_, body) => `\n\n$$\n${body.trim()}\n$$\n\n`
            )
    )
    .join("");
}

const RUNNABLE_LANGUAGES = new Set(["python", "py"]);

function CodeBlock({ language: rawLanguage, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ output: string; ok: boolean } | null>(null);
  const [stdin, setStdin] = useState("");

  const language = guessLanguage(rawLanguage, code);
  const runnable = RUNNABLE_LANGUAGES.has(language.toLowerCase());
  const needsInput = runnable && /(^|[^.\w])input\s*\(/.test(code);

  async function handleRun() {
    setRunning(true);
    setResult(null);
    try {
      setResult(await runPython(code, stdin));
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
              title="Runs in your browser via Pyodide (experimental). The first run on this device downloads the Python runtime, which needs a network connection. For input(), type the values it should read into the input box, one per line."
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
      {needsInput && (
        <div className="border-t border-border px-3 py-2">
          <label className="mb-1 block text-xs text-foreground-muted">
            Input for input() — one value per line
          </label>
          <textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            rows={2}
            spellCheck={false}
            placeholder="e.g. Alice"
            className="w-full resize-y rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      )}
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

function MarkdownFallback(_props: object, { error }: ErrorInfo) {
  return (
    <p className="text-sm text-red-500">
      Couldn&apos;t render this message{error.message ? `: ${error.message}` : ""}.
    </p>
  );
}

const MarkdownErrorBoundary = unstable_catchError(MarkdownFallback);

export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <MarkdownErrorBoundary>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/katex/katex.min.css" precedence="default" />
      <div className="max-w-none text-[15px] leading-relaxed [&>*:last-child]:mb-0">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
          components={components}
        >
          {normalizeMathDelimiters(content)}
        </ReactMarkdown>
      </div>
    </MarkdownErrorBoundary>
  );
}
