"use client";

import OrbitLoader from "./OrbitLoader";

export default function LoadingScreen({
  status,
  progress,
  progressPct,
  storagePersisted,
  modelLabel,
  errorText,
  onRetry,
  onChangeModel,
}: {
  status: "idle" | "loading" | "error";
  progress: string;
  progressPct: number | null;
  storagePersisted: boolean | null;
  modelLabel: string;
  errorText: string;
  onRetry: () => void;
  onChangeModel: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <OrbitLoader />
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
          {storagePersisted === false && (
            <p className="max-w-xs rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              This browser hasn&apos;t granted durable storage, so the model may
              be evicted and re-downloaded on a future visit. Install Navo to
              your home screen to keep it saved.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
