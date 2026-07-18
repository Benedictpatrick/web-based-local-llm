"use client";

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { runPython } from "@/lib/pythonRunner";
import { guessLanguage } from "@/lib/codeLanguage";

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

  const language = guessLanguage(rawLanguage, code);
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
              title="Runs in your browser via Pyodide (experimental). The first run on this device downloads the Python runtime, which needs a network connection. Doesn't support input() — code that reads input will error."
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
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={components}
      >
        {normalizeMathDelimiters(content)}
      </ReactMarkdown>
    </div>
  );
}
