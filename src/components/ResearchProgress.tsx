"use client";

export interface ResearchStep {
  question: string;
  state: "pending" | "searching" | "active" | "done";
  /** Populated once that sub-question's web search resolves; stays attached
   *  through "active"/"done" so the source pills remain visible under the
   *  answer, not just during the search itself. */
  sources?: { title: string; url: string }[];
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Small checklist of research sub-questions in flight, rendered in the same
 *  slot Chat.tsx's single-string agentStatus occupies during agent mode --
 *  generalized to a list since research can have multiple concurrent-looking
 *  (though always sequentially run) steps. "searching" gets a distinct pill
 *  badge (closer to how Claude/ChatGPT show web search) rather than reusing
 *  the plain dot+text row the other phases use, and once results land, their
 *  hostnames fade in one at a time via staggered animation-delay -- Navo's
 *  search is one batched call, not a per-source fetch, so this is a
 *  deliberate reveal rather than a literal live per-request event. */
export default function ResearchProgress({ steps }: { steps: ResearchStep[] }) {
  if (steps.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5 text-xs">
      {steps.map((step, i) => (
        <li key={i} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {step.state === "done" ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0 text-accent">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : step.state === "active" ? (
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
            ) : step.state === "pending" ? (
              <span className="h-2 w-2 shrink-0 rounded-full border border-border" />
            ) : null}
            {step.state === "searching" ? (
              <span className="msg-enter flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-accent">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0 animate-pulse">
                  <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="2" />
                  <path d="M14.5 14.5L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Searching the web: &ldquo;{step.question}&rdquo;
              </span>
            ) : (
              <span className={step.state === "pending" ? "text-foreground-muted" : "text-foreground"}>
                {step.question}
              </span>
            )}
          </div>
          {step.sources && step.sources.length > 0 && (
            <div className="ml-4 flex flex-wrap gap-1">
              {step.sources.map((s, si) => (
                <span
                  key={s.url}
                  className="msg-enter rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground-muted"
                  style={{ animationDelay: `${si * 90}ms`, animationFillMode: "backwards" }}
                >
                  {hostnameOf(s.url)}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
