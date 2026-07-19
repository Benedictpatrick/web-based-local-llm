"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Conversation } from "@/lib/db";
import { haptic } from "@/lib/haptics";

type Bucket = { label: string; items: Conversation[] };

function groupByRecency(conversations: Conversation[]): Bucket[] {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const today = startOfDay(Date.now());
  const yesterday = today - 86_400_000;
  const weekAgo = today - 7 * 86_400_000;

  const buckets: Bucket[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const c of conversations) {
    const day = startOfDay(c.updatedAt);
    if (day === today) buckets[0].items.push(c);
    else if (day === yesterday) buckets[1].items.push(c);
    else if (day > weekAgo) buckets[2].items.push(c);
    else buckets[3].items.push(c);
  }

  return buckets.filter((b) => b.items.length > 0);
}

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
    haptic("warning");
    await db.chat.where("conversationId").equals(id).delete();
    await db.conversations.delete(id);
    if (id === currentConversationId) onNewChat();
  }

  const groups = groupByRecency(conversations ?? []);

  return (
    <>
      <div
        className={`fixed inset-0 z-20 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 left-0 z-30 flex w-72 max-w-[85vw] flex-col border-r border-border bg-background transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        inert={!open}
      >
        <div className="flex items-center gap-2 p-3">
          <button
            className="flex-1 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            onClick={() => {
              haptic("tap");
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
          {groups.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-foreground-muted">
              No chats yet.
            </p>
          )}
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pt-3 pb-1 text-xs font-medium text-foreground-muted">
                {group.label}
              </p>
              {group.items.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-surface ${
                    c.id === currentConversationId ? "bg-surface text-foreground" : "text-foreground-muted"
                  }`}
                >
                  <button
                    className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm"
                    onClick={() => {
                      if (c.id !== currentConversationId) haptic("tap");
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
          ))}
        </div>
      </div>
    </>
  );
}
