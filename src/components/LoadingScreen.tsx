"use client";

const WORDMARK = ["N", "a", "v", "o"];

export default function LoadingScreen({
  status,
  progress,
  progressPct,
  modelLabel,
  errorText,
  onRetry,
  onChangeModel,
}: {
  status: "idle" | "loading" | "error";
  progress: string;
  progressPct: number | null;
  modelLabel: string;
  errorText: string;
  onRetry: () => void;
  onChangeModel: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <div
        aria-hidden="true"
        className="flex items-center gap-1 text-5xl font-bold tracking-tight text-foreground"
      >
        {WORDMARK.map((ch, i) => (
          <span
            key={i}
            className="inline-block animate-bounce"
            style={{ animationDelay: `${i * 0.12}s`, animationDuration: "1s" }}
          >
            {ch}
          </span>
        ))}
      </div>
      <span className="sr-only">Navo is loading</span>

      {status === "error" ? (
        <div className="flex max-w-sm flex-col items-center gap-3">
          <p className="text-sm text-red-500">
            Couldn&apos;t load {modelLabel}
            {errorText ? `: ${errorText}` : ""}. Check your connection for the
            first download. After that it works offline.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={onChangeModel}
              className="text-xs text-foreground-muted hover:text-foreground hover:underline"
            >
              Try a different model
            </button>
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <p role="status" aria-live="polite" className="text-sm text-foreground-muted">
            {progress || `Starting ${modelLabel}…`}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
            {progressPct != null ? (
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300"
                style={{ width: `${progressPct}%` }}
              />
            ) : (
              <div className="loading-shimmer h-full w-full" />
            )}
          </div>
          <p className="text-xs text-foreground-muted">
            First load needs internet to download the model. After that it
            works fully offline.
          </p>
        </div>
      )}
    </div>
  );
}
