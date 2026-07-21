"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { embed } from "@/lib/embeddings";
import {
  AVAILABLE_MODELS,
  deleteModelCache,
  getLoadedModelId,
  isModelCached,
  type ModelId,
} from "@/lib/llm";
import { isMemoryEnabled, setMemoryEnabled } from "@/lib/memory";
import { getThemePreference, setThemePreference, type ThemePreference } from "@/lib/theme";
import { haptic } from "@/lib/haptics";

const REPO_URL = "https://github.com/Benedictpatrick/Web-based-local-OfflineLLM";
const AUTHOR_NAME = "Benedict Patrick, Saidharshan";

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

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

function ThemeSegmented({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (theme: ThemePreference) => void;
}) {
  return (
    <div className="tab-switcher flex gap-0.5 rounded-lg p-0.5 text-xs">
      {THEME_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={value === opt.id}
          className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
            value === opt.id
              ? "bg-accent text-accent-foreground"
              : "text-foreground-muted hover:text-foreground"
          }`}
          onClick={() => {
            if (opt.id !== value) haptic("tap");
            onChange(opt.id);
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const DANGER_BUTTON =
  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";
const DANGER_BUTTON_IDLE = "border-red-500/40 text-red-500 hover:bg-red-500 hover:text-white";
const DANGER_BUTTON_CONFIRM = "border-red-500 bg-red-500 text-white";

export default function Settings({
  active,
  onChangeModel,
}: {
  active: boolean;
  onChangeModel: () => void;
}) {
  const [cached, setCached] = useState<Partial<Record<ModelId, boolean>>>({});
  const [activeModelId, setActiveModelId] = useState<ModelId | null>(null);
  const [showAllModels, setShowAllModels] = useState(false);
  const [deletingId, setDeletingId] = useState<ModelId | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<ModelId | null>(null);
  // Start from the server-safe default so hydration matches, then correct to the
  // stored preference after mount (deferred so it doesn't run during the effect).
  const [memoryOn, setMemoryOn] = useState(true);
  const memories = useLiveQuery(() => db.memories.orderBy("createdAt").reverse().toArray(), [], []);
  const notes = useLiveQuery(() => db.journal.orderBy("createdAt").reverse().toArray(), [], []);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>("system");

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setMemoryOn(isMemoryEnabled());
      setTheme(getThemePreference());
    });
    return () => cancelAnimationFrame(id);
  }, []);

  function handleThemeChange(next: ThemePreference) {
    setTheme(next);
    setThemePreference(next);
  }

  async function handleAddNote() {
    const text = noteDraft.trim();
    if (!text) return;
    setNoteDraft("");
    setSavingNote(true);
    try {
      const embedding = await embed(text);
      await db.journal.add({ text, createdAt: Date.now(), embedding });
    } finally {
      setSavingNote(false);
    }
  }

  async function handleDeleteNote(id: number) {
    haptic("tap");
    await db.journal.delete(id);
  }
  const [confirmClear, setConfirmClear] = useState<"chat" | "notes" | "memories" | null>(null);
  const [cleared, setCleared] = useState<"chat" | "notes" | "memories" | null>(null);

  // Settings stays mounted behind the tab switcher, so the cache probe waits
  // until the panel is actually shown rather than running at page load.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => setActiveModelId(getLoadedModelId()));
    for (const m of AVAILABLE_MODELS) {
      isModelCached(m.id).then((isCached) => {
        if (!cancelled) setCached((prev) => ({ ...prev, [m.id]: isCached }));
      });
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [active]);

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

  function handleClearClick(target: "chat" | "notes" | "memories") {
    if (confirmClear === target) {
      haptic("warning");
      setConfirmClear(null);
      (target === "chat"
        ? Promise.all([db.chat.clear(), db.conversations.clear()])
        : target === "notes"
          ? db.journal.clear()
          : db.memories.clear()
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

  function handleToggleMemory() {
    haptic("tap");
    const next = !memoryOn;
    setMemoryOn(next);
    setMemoryEnabled(next);
  }

  return (
    <div className="h-full overflow-y-auto px-3 sm:px-5">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-6">
        <SectionCard title="Appearance">
          <Row
            label="Theme"
            description="Follow your system setting, or pick one explicitly."
            action={<ThemeSegmented value={theme} onChange={handleThemeChange} />}
          />
        </SectionCard>

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
          {(showAllModels
            ? AVAILABLE_MODELS
            : AVAILABLE_MODELS.filter((m) => cached[m.id] || m.id === activeModelId)
          ).map((m) => (
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
          {!showAllModels && (
            <Row
              label={`Show all ${AVAILABLE_MODELS.length} models`}
              description="Browse everything available, including ones you haven't downloaded."
              action={
                <button
                  type="button"
                  className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:bg-background"
                  onClick={() => {
                    haptic("tap");
                    setShowAllModels(true);
                  }}
                >
                  Expand
                </button>
              }
            />
          )}
          {showAllModels && (
            <Row
              label="Showing all models"
              action={
                <button
                  type="button"
                  className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:bg-background"
                  onClick={() => {
                    haptic("tap");
                    setShowAllModels(false);
                  }}
                >
                  Collapse
                </button>
              }
            />
          )}
        </SectionCard>

        <SectionCard title="Memory">
          <Row
            label="Remember details about you"
            description="Navo notes durable facts you mention, like your name or what you're studying, and recalls them in later chats. Everything stays on this device."
            action={
              <button
                type="button"
                role="switch"
                aria-checked={memoryOn}
                onClick={handleToggleMemory}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  memoryOn ? "bg-accent" : "bg-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    memoryOn ? "translate-x-[20px]" : "translate-x-0"
                  }`}
                />
              </button>
            }
          />
          {(memories ?? []).length > 0 ? (
            <>
              {(memories ?? []).map((m) => (
                <Row
                  key={m.id}
                  label={m.text}
                  action={
                    <button
                      type="button"
                      aria-label="Forget this"
                      title="Forget this"
                      className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:border-red-500/40 hover:text-red-500"
                      onClick={() => {
                        haptic("tap");
                        db.memories.delete(m.id);
                      }}
                    >
                      Forget
                    </button>
                  }
                />
              ))}
              <Row
                label="Clear everything Navo remembers"
                description="Deletes all learned memories. This can't be undone."
                action={
                  <button
                    type="button"
                    className={`${DANGER_BUTTON} ${
                      confirmClear === "memories" ? DANGER_BUTTON_CONFIRM : DANGER_BUTTON_IDLE
                    }`}
                    onClick={() => handleClearClick("memories")}
                  >
                    {cleared === "memories"
                      ? "Cleared"
                      : confirmClear === "memories"
                        ? "Tap to confirm"
                        : "Clear"}
                  </button>
                }
              />
            </>
          ) : (
            <Row
              label="Nothing remembered yet"
              description={
                memoryOn
                  ? "As you chat, facts you mention will show up here for you to review or remove."
                  : "Memory is off, so Navo won't note anything about you."
              }
              action={null}
            />
          )}
        </SectionCard>

        <SectionCard title="Notes">
          <div className="px-4 py-3">
            <textarea
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-foreground-muted"
              rows={3}
              placeholder="Save a code snippet, a concept you're still shaky on, or notes from a lecture. Navo pulls this up in Chat when it's relevant."
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
                onClick={handleAddNote}
                disabled={!noteDraft.trim() || savingNote}
              >
                {savingNote ? "Saving…" : "Save note"}
              </button>
            </div>
          </div>
          {(notes ?? []).length > 0 ? (
            (notes ?? []).map((n) => (
              <Row
                key={n.id}
                label={n.text.length > 80 ? `${n.text.slice(0, 80)}…` : n.text}
                description={new Date(n.createdAt).toLocaleString()}
                action={
                  <button
                    type="button"
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:border-red-500/40 hover:text-red-500"
                    onClick={() => handleDeleteNote(n.id)}
                  >
                    Delete
                  </button>
                }
              />
            ))
          ) : (
            <Row
              label="No notes yet"
              description="Save a snippet, a definition, or anything from a lecture above — Navo will draw on it in Chat."
              action={null}
            />
          )}
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
