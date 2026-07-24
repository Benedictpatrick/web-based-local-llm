const MAX_PDF_PAGES = 200;

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
  const pages: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items.map((item) => ("str" in item ? item.str : "")).join(" ")
    );
  }

  return pages.join("\n\n");
}

export async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractPdfText(await file.arrayBuffer());
  }
  if (file.type.startsWith("image/")) {
    const { extractTextFromImage } = await import("./ocr");
    return extractTextFromImage(file);
  }
  return file.text();
}

// Retrieval only ever surfaces the top handful of chunks per question (see
// topRelevantChunks' k), so embedding every chunk of a large PDF (up to
// MAX_PDF_PAGES pages) was pure wasted latency -- each chunk is one on-device
// model inference call, and a large document could queue up hundreds of them
// before the file even finished "attaching". MAX_CHUNKS bounds the worst
// case; chunkSize was bumped from 600 toward (but staying under) all-MiniLM-
// L6-v2's ~256-token window, so fewer, fuller chunks cover the same text
// instead of slicing it more finely than the model even uses -- kept short of
// the actual limit so a chunk's embedding doesn't quietly stop reflecting its
// own tail.
const MAX_CHUNKS = 150;

export function chunkText(text: string, chunkSize = 800): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  for (let i = 0; i < normalized.length && chunks.length < MAX_CHUNKS; i += chunkSize) {
    chunks.push(normalized.slice(i, i + chunkSize));
  }
  return chunks;
}
