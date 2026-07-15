import Dexie, { type EntityTable } from "dexie";

export interface JournalEntry {
  id: number;
  text: string;
  createdAt: number;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

const db = new Dexie("offline-llm-app") as Dexie & {
  journal: EntityTable<JournalEntry, "id">;
  chat: EntityTable<ChatMessage, "id">;
};

db.version(1).stores({
  journal: "++id, createdAt",
  chat: "++id, createdAt",
});

export { db };
