"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

export default function Journal() {
  const entries = useLiveQuery(
    () => db.journal.orderBy("createdAt").reverse().toArray(),
    [],
    []
  );
  const [draft, setDraft] = useState("");

  async function handleAdd() {
    const text = draft.trim();
    if (!text) return;
    await db.journal.add({ text, createdAt: Date.now() });
    setDraft("");
  }

  async function handleDelete(id: number) {
    await db.journal.delete(id);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-black/10 p-4 dark:border-white/10">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          <textarea
            className="w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black"
            rows={3}
            placeholder="What's on your mind today? This stays on your device and the assistant can recall it later."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            className="self-end rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
            onClick={handleAdd}
            disabled={!draft.trim()}
          >
            Save entry
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {(entries ?? []).length === 0 && (
            <p className="text-sm text-zinc-500">
              No entries yet. Write your first one above — the assistant will use it
              to give you more personal answers in Chat.
            </p>
          )}
          {(entries ?? []).map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border border-black/10 p-3 dark:border-white/10"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
                <button
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                  onClick={() => handleDelete(entry.id)}
                >
                  Delete
                </button>
              </div>
              <p className="text-sm whitespace-pre-wrap">{entry.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
