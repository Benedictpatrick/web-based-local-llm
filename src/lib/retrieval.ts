import { db, type JournalEntry } from "./db";
import { cosineSimilarity, embed } from "./embeddings";

// Cosine similarity for unrelated sentence pairs from this model typically
// sits below ~0.2; genuinely related ones land well above 0.3. Filtering
// below this cuts noise without hiding paraphrased-but-relevant notes.
const SIMILARITY_THRESHOLD = 0.3;

async function embeddingFor(entry: JournalEntry): Promise<number[]> {
  if (entry.embedding) return entry.embedding;
  // Backfill for notes saved before semantic search existed.
  const embedding = await embed(entry.text);
  await db.journal.update(entry.id, { embedding });
  return embedding;
}

export async function topRelevantEntries(
  query: string,
  entries: JournalEntry[],
  k = 3
): Promise<JournalEntry[]> {
  if (entries.length === 0) return [];

  const queryEmbedding = await embed(query);
  const scored = await Promise.all(
    entries.map(async (entry) => ({
      entry,
      score: cosineSimilarity(queryEmbedding, await embeddingFor(entry)),
    }))
  );

  return scored
    .filter((s) => s.score > SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.entry);
}

export interface TextChunk {
  text: string;
  embedding: number[];
}

// Used for the "chat about an uploaded file" feature — chunks live only in
// memory for the current attachment, not in Dexie, so there's no backfill
// path to worry about like there is for journal entries.
export async function embedChunks(texts: string[]): Promise<TextChunk[]> {
  return Promise.all(texts.map(async (text) => ({ text, embedding: await embed(text) })));
}

// k defaults lower than topRelevantEntries — file excerpts are injected
// alongside notes context in the same small context window, so keeping this
// tight matters more here.
export async function topRelevantChunks(
  query: string,
  chunks: TextChunk[],
  k = 3
): Promise<string[]> {
  if (chunks.length === 0) return [];

  const queryEmbedding = await embed(query);
  return chunks
    .map((c) => ({ text: c.text, score: cosineSimilarity(queryEmbedding, c.embedding) }))
    .filter((c) => c.score > SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((c) => c.text);
}
