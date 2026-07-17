import Dexie, { type EntityTable } from "dexie";

export interface JournalEntry {
  id: number;
  text: string;
  createdAt: number;
  // Sentence embedding for semantic retrieval, computed on save. Optional
  // because entries created before this field existed won't have one yet —
  // retrieval backfills those lazily on first use.
  embedding?: number[];
}

export interface Conversation {
  id: number;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

const db = new Dexie("offline-llm-app") as Dexie & {
  journal: EntityTable<JournalEntry, "id">;
  chat: EntityTable<ChatMessage, "id">;
  conversations: EntityTable<Conversation, "id">;
};

db.version(1).stores({
  journal: "++id, createdAt",
  chat: "++id, createdAt",
});

// v2 introduces multiple conversations (like ChatGPT/Claude's chat history)
// instead of one continuous message list. Existing messages predate this and
// have no conversationId — fold them into a single "Previous chat" thread
// on upgrade so nobody's history silently disappears.
db.version(2)
  .stores({
    journal: "++id, createdAt",
    chat: "++id, conversationId, createdAt",
    conversations: "++id, updatedAt",
  })
  .upgrade(async (tx) => {
    const chatTable = tx.table("chat");
    const existing = await chatTable.toArray();
    if (existing.length === 0) return;

    const conversationsTable = tx.table("conversations");
    const sorted = [...existing].sort((a, b) => a.createdAt - b.createdAt);
    const firstUserMessage = sorted.find((m) => m.role === "user");
    const conversationId = await conversationsTable.add({
      title: firstUserMessage
        ? firstUserMessage.content.slice(0, 60)
        : "Previous chat",
      createdAt: sorted[0].createdAt,
      updatedAt: sorted[sorted.length - 1].createdAt,
    });
    await Promise.all(
      existing.map((m) => chatTable.update(m.id, { conversationId }))
    );
  });

export { db };
