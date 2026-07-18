"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { AVAILABLE_MODELS, deleteModelCache, isModelCached, type ModelId } from "@/lib/llm";

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

export default function Settings({ onChangeModel }: { onChangeModel: () => void }) {
  const [cached, setCached] = useState<Partial<Record<ModelId, boolean>>>({});
  const [deletingId, setDeletingId] = useState<ModelId | null>(null);
  const [confirmClear, setConfirmClear] = useState<"chat" | "notes" | null>(null);
  const [cleared, setCleared] = useState<"chat" | "notes" | null>(null);

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

  function handleClearClick(target: "chat" | "notes") {
    if (confirmClear === target) {
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
                onClick={onChangeModel}
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
                    className="rounded-full px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:bg-background hover:text-red-500 disabled:opacity-50"
                    onClick={() => handleDeleteModel(m.id)}
                    disabled={deletingId === m.id}
                  >
                    {deletingId === m.id ? "Deleting…" : "Delete cache"}
                  </button>
                ) : (
                  <span className="text-xs text-foreground-muted">—</span>
                )
              }
            />
          ))}
        </SectionCard>

        <SectionCard title="Data">
          <Row
            label="Clear chat history"
            description="Deletes every conversation stored on this device. This can't be undone."
            action={
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                  confirmClear === "chat"
                    ? "bg-red-500 text-white"
                    : "border border-border hover:bg-background"
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
                className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                  confirmClear === "notes"
                    ? "bg-red-500 text-white"
                    : "border border-border hover:bg-background"
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
            description="A private study assistant that runs entirely on your device — nothing you type ever leaves your browser."
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
                className="text-sm text-accent underline"
              >
                GitHub
              </a>
            }
          />
        </SectionCard>
      </div>
    </div>
  );
}
