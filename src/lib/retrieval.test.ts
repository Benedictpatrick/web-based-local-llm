import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JournalEntry } from "./db";

// embed() downloads and runs a real ONNX model — mock it so these tests are
// fast/deterministic and never touch the network. cosineSimilarity is pure
// math, so keep the real implementation via importActual.
const embedMock = vi.hoisted(() => vi.fn<(text: string) => Promise<number[]>>());
const journalUpdateMock = vi.hoisted(() => vi.fn());

vi.mock("./embeddings", async () => {
  const actual = await vi.importActual<typeof import("./embeddings")>("./embeddings");
  return { ...actual, embed: embedMock };
});

vi.mock("./db", () => ({
  db: { journal: { update: journalUpdateMock } },
}));

// vi.mock calls above are hoisted above this import by Vitest, so
// topRelevantEntries already sees the mocked ./embeddings and ./db.
import { topRelevantEntries } from "./retrieval";

function makeEntry(id: number, text: string, embedding?: number[]): JournalEntry {
  return { id, text, createdAt: 0, embedding };
}

beforeEach(() => {
  embedMock.mockReset();
  journalUpdateMock.mockReset();
});

describe("topRelevantEntries", () => {
  it("returns nothing and never embeds when there are no entries", async () => {
    const result = await topRelevantEntries("anything", []);

    expect(result).toEqual([]);
    expect(embedMock).not.toHaveBeenCalled();
  });

  it("ranks by similarity, highest first, and drops entries below the threshold", async () => {
    embedMock.mockResolvedValue([1, 0]); // only the query gets embedded here

    const entries = [
      makeEntry(1, "unrelated", [0, 1]), // similarity 0 — excluded
      makeEntry(2, "somewhat relevant", [0.9, Math.sqrt(1 - 0.9 ** 2)]), // 0.9
      makeEntry(3, "exact match", [1, 0]), // 1.0
    ];

    const result = await topRelevantEntries("query", entries, 3);

    expect(result.map((e) => e.id)).toEqual([3, 2]);
    expect(journalUpdateMock).not.toHaveBeenCalled();
  });

  it("caps results at k", async () => {
    embedMock.mockResolvedValue([1, 0]);

    const entries = [
      makeEntry(1, "a", [1, 0]), // 1.0
      makeEntry(2, "b", [0.95, Math.sqrt(1 - 0.95 ** 2)]), // 0.95
      makeEntry(3, "c", [0.9, Math.sqrt(1 - 0.9 ** 2)]), // 0.9
    ];

    const result = await topRelevantEntries("query", entries, 2);

    expect(result.map((e) => e.id)).toEqual([1, 2]);
  });

  it("backfills and persists an embedding for entries that don't have one yet", async () => {
    embedMock.mockImplementation(async (text: string) =>
      text === "query" ? [1, 0] : [1, 0]
    );

    const entries = [makeEntry(5, "note saved before this feature shipped")];

    const result = await topRelevantEntries("query", entries);

    expect(result.map((e) => e.id)).toEqual([5]);
    expect(embedMock).toHaveBeenCalledWith("note saved before this feature shipped");
    expect(journalUpdateMock).toHaveBeenCalledWith(5, { embedding: [1, 0] });
  });
});
