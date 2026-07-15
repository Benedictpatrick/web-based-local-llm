import type { JournalEntry } from "./db";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be",
  "to", "of", "in", "on", "at", "for", "with", "about", "as", "it", "this",
  "that", "i", "you", "my", "me", "we", "do", "did", "does", "have", "has",
  "had", "not", "so", "just", "what", "how", "why", "when",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

export function topRelevantEntries(
  query: string,
  entries: JournalEntry[],
  k = 3
): JournalEntry[] {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return [];

  const scored = entries.map((entry) => {
    const entryTokens = tokenize(entry.text);
    let overlap = 0;
    for (const token of entryTokens) {
      if (queryTokens.has(token)) overlap++;
    }
    return { entry, score: overlap };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.entry);
}
