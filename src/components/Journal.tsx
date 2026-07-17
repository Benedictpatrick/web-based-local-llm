"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { embed } from "@/lib/embeddings";

export default function Journal() {
  const entries = useLiveQuery(
    () => db.journal.orderBy("createdAt").reverse().toArray(),
    [],
    []
  );
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setSaving(true);
    try {
      // Embed before writing so the note is searchable the moment it
      // appears, rather than waiting for retrieval to backfill it later.
      const embedding = await embed(text);
      await db.journal.add({ text, createdAt: Date.now(), embedding });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    await db.journal.delete(id);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-3 sm:px-5">
      <div className="mx-auto w-full max-w-2xl py-5">
        <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
          <textarea
            className="w-full resize-none bg-transparent px-1 py-1 text-base outline-none placeholder:text-foreground-muted"
            rows={3}
            placeholder="Save a code snippet, a concept you're still shaky on, or notes from a lecture. This stays on your device, and the assistant pulls it up when it's relevant to a question."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex justify-end">
            <button
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
              onClick={handleAdd}
              disabled={!draft.trim() || saving}
            >
              {saving ? "Saving…" : "Save note"}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 pb-6">
        <div className="flex flex-col gap-3">
          {(entries ?? []).length === 0 && (
            <p className="py-12 text-center text-sm text-foreground-muted">
              No notes yet. Save a snippet, a definition, or anything from a
              lecture above — the assistant will draw on it when you ask a
              related question in Chat.
            </p>
          )}
          {(entries ?? []).map((entry) => (
            <div
              key={entry.id}
              className="msg-enter group rounded-2xl border border-border p-4 transition-colors hover:bg-surface"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-foreground-muted">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
                <button
                  className="text-xs text-foreground-muted opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                  onClick={() => handleDelete(entry.id)}
                >
                  Delete
                </button>
              </div>
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                {entry.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
