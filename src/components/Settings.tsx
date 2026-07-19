"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { AVAILABLE_MODELS, deleteModelCache, isModelCached, type ModelId } from "@/lib/llm";
import { haptic, isHapticSupported } from "@/lib/haptics";

const REPO_URL = "https://github.com/Benedictpatrick/Web-based-local-OfflineLLM";
const AUTHOR_NAME = "Benedict Patrick";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-foreground-muted">
        {title}
      </h2>
      <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  description,
  action,
}: {
  label: string;
  description?: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[15px]">{label}</p>
        {description && <p className="mt-0.5 text-xs text-foreground-muted">{description}</p>}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

const DANGER_BUTTON =
  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";
const DANGER_BUTTON_IDLE = "border-red-500/40 text-red-500 hover:bg-red-500 hover:text-white";
const DANGER_BUTTON_CONFIRM = "border-red-500 bg-red-500 text-white";

export default function Settings({ onChangeModel }: { onChangeModel: () => void }) {
  const [cached, setCached] = useState<Partial<Record<ModelId, boolean>>>({});
  const [deletingId, setDeletingId] = useState<ModelId | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<ModelId | null>(null);
  const [confirmClear, setConfirmClear] = useState<"chat" | "notes" | null>(null);
  const [cleared, setCleared] = useState<"chat" | "notes" | null>(null);
  const [hapticResult, setHapticResult] = useState<"accepted" | "rejected" | null>(null);

  useEffect(() => {
    let cancelled = false;
    for (const m of AVAILABLE_MODELS) {
      isModelCached(m.id).then((isCached) => {
        if (!cancelled) setCached((prev) => ({ ...prev, [m.id]: isCached }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDeleteModel(id: ModelId) {
    setDeletingId(id);
    try {
      await deleteModelCache(id);
      setCached((prev) => ({ ...prev, [id]: false }));
    } finally {
      setDeletingId(null);
    }
  }

  function handleDeleteClick(id: ModelId) {
    if (confirmDeleteId === id) {
      haptic("warning");
      setConfirmDeleteId(null);
      handleDeleteModel(id);
      return;
    }
    haptic("tap");
    setConfirmDeleteId(id);
    setTimeout(() => setConfirmDeleteId((cur) => (cur === id ? null : cur)), 4000);
  }

  function handleClearClick(target: "chat" | "notes") {
    if (confirmClear === target) {
      haptic("warning");
      setConfirmClear(null);
      (target === "chat"
        ? Promise.all([db.chat.clear(), db.conversations.clear()])
        : db.journal.clear()
      ).then(() => {
        setCleared(target);
        setTimeout(() => setCleared(null), 2000);
      });
      return;
    }
    haptic("tap");
    setConfirmClear(target);
    setTimeout(() => setConfirmClear((cur) => (cur === target ? null : cur)), 4000);
  }

  return (
    <div className="h-full overflow-y-auto px-3 sm:px-5">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-6">
        <SectionCard title="Model">
          <Row
            label="Active model"
            description="Switch to a different model or reload the current one"
            action={
              <button
                type="button"
                className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:bg-background"
                onClick={() => {
                  haptic("tap");
                  onChangeModel();
                }}
              >
                Change model
              </button>
            }
          />
          {AVAILABLE_MODELS.map((m) => (
            <Row
              key={m.id}
              label={m.label}
              description={cached[m.id] ? "Downloaded on this device" : "Not downloaded"}
              action={
                cached[m.id] ? (
                  <button
                    type="button"
                    className={`${DANGER_BUTTON} ${
                      confirmDeleteId === m.id ? DANGER_BUTTON_CONFIRM : DANGER_BUTTON_IDLE
                    }`}
                    onClick={() => handleDeleteClick(m.id)}
                    disabled={deletingId === m.id}
                  >
                    {deletingId === m.id
                      ? "Deleting…"
                      : confirmDeleteId === m.id
                        ? "Tap to confirm"
                        : "Delete cache"}
                  </button>
                ) : (
                  <span className="text-xs text-foreground-muted">—</span>
                )
              }
            />
          ))}
        </SectionCard>

        <SectionCard title="Feel">
          <Row
            label="Haptic feedback"
            description={
              isHapticSupported()
                ? hapticResult === "accepted"
                  ? "Sent a vibrate command to your device just now — if you didn't feel it, check your phone's ringer/silent mode, not this app."
                  : hapticResult === "rejected"
                    ? "Your browser rejected the request. Vibration may be disabled for this site."
                    : "Vibrates on send, tab switches, and confirmations."
                : "Not supported in this browser (this is normal on iPhone — Safari doesn't support it)."
            }
            action={
              isHapticSupported() ? (
                <button
                  type="button"
                  className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:bg-background"
                  onClick={() => setHapticResult(haptic("success") ? "accepted" : "rejected")}
                >
                  Test
                </button>
              ) : (
                <span className="text-xs text-foreground-muted">—</span>
              )
            }
          />
        </SectionCard>

        <SectionCard title="Data">
          <Row
            label="Clear chat history"
            description="Deletes every conversation stored on this device. This can't be undone."
            action={
              <button
                type="button"
                className={`${DANGER_BUTTON} ${
                  confirmClear === "chat" ? DANGER_BUTTON_CONFIRM : DANGER_BUTTON_IDLE
                }`}
                onClick={() => handleClearClick("chat")}
              >
                {cleared === "chat" ? "Cleared" : confirmClear === "chat" ? "Tap to confirm" : "Clear"}
              </button>
            }
          />
          <Row
            label="Clear saved notes"
            description="Deletes everything saved in Notes. This can't be undone."
            action={
              <button
                type="button"
                className={`${DANGER_BUTTON} ${
                  confirmClear === "notes" ? DANGER_BUTTON_CONFIRM : DANGER_BUTTON_IDLE
                }`}
                onClick={() => handleClearClick("notes")}
              >
                {cleared === "notes" ? "Cleared" : confirmClear === "notes" ? "Tap to confirm" : "Clear"}
              </button>
            }
          />
        </SectionCard>

        <SectionCard title="About">
          <Row
            label="Navo"
            description="A private study assistant that runs entirely on your device. Nothing you type ever leaves your browser."
            action={null}
          />
          <Row label="Built by" action={<span className="text-sm text-foreground-muted">{AUTHOR_NAME}</span>} />
          <Row
            label="Source code"
            action={
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="View source on GitHub"
                title="View source on GitHub"
                className="flex items-center gap-1.5 text-sm text-accent hover:underline"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                </svg>
                GitHub
              </a>
            }
          />
        </SectionCard>
      </div>
    </div>
  );
}
