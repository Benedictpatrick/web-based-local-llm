import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "./embeddings";

describe("cosineSimilarity", () => {
  it("is 1 for identical normalized vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("matches the dot product for arbitrary normalized vectors", () => {
    const a = [0.6, 0.8];
    const b = [0.8, 0.6];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.6 * 0.8 + 0.8 * 0.6);
  });
});
