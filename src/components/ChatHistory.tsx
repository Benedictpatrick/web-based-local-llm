"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

export default function ChatHistory({
  open,
  onClose,
  currentConversationId,
  onSelect,
  onNewChat,
}: {
  open: boolean;
  onClose: () => void;
  currentConversationId: number | null;
  onSelect: (id: number) => void;
  onNewChat: () => void;
}) {
  const conversations = useLiveQuery(
    () => db.conversations.orderBy("updatedAt").reverse().toArray(),
    [],
    []
  );

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this chat? This can't be undone.")) return;
    await db.chat.where("conversationId").equals(id).delete();
    await db.conversations.delete(id);
    if (id === currentConversationId) onNewChat();
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 z-30 flex w-72 max-w-[85vw] flex-col border-r border-border bg-background">
        <div className="flex items-center gap-2 p-3">
          <button
            className="flex-1 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            onClick={() => {
              onNewChat();
              onClose();
            }}
          >
            + New chat
          </button>
          <button
            aria-label="Close"
            className="shrink-0 rounded-md p-2 text-foreground-muted hover:bg-surface hover:text-foreground"
            onClick={onClose}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {(conversations ?? []).length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-foreground-muted">
              No chats yet.
            </p>
          )}
          {(conversations ?? []).map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-surface ${
                c.id === currentConversationId ? "bg-surface text-foreground" : "text-foreground-muted"
              }`}
            >
              <button
                className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm"
                onClick={() => {
                  onSelect(c.id);
                  onClose();
                }}
              >
                {c.title || "New chat"}
              </button>
              <button
                aria-label={`Delete chat: ${c.title || "New chat"}`}
                className="shrink-0 rounded-md p-1.5 text-foreground-muted transition-colors hover:text-red-500"
                onClick={() => handleDelete(c.id)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
