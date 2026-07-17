// Sentence embeddings for semantic note retrieval — runs fully client-side via
// transformers.js/onnxruntime-web, independent of whichever chat engine
// (web-llm or wllama) happens to be loaded. Lazily imported so pages that
// never touch Notes never pay for this download.
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

type Extractor = (
  text: string,
  options: { pooling: "mean"; normalize: true }
) => Promise<{ data: Float32Array }>;

let extractorPromise: Promise<Extractor> | null = null;

async function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return (await pipeline("feature-extraction", MODEL_ID, {
        dtype: "q8",
      })) as unknown as Extractor;
    })();
  }
  return extractorPromise;
}

export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

// Embeddings from embed() are L2-normalized, so their dot product already
// equals cosine similarity — no need for the magnitude division.
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
