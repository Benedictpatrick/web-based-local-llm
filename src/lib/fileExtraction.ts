// Text extraction for the "chat about a file" feature. Runs entirely
// client-side — pdf.js is lazily imported so pages that never attach a file
// never pay for it.
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
  return file.text();
}

// Character-based, not sentence/paragraph-aware — simple and good enough for
// picking relevant excerpts out of lecture notes or a textbook chapter.
export function chunkText(text: string, chunkSize = 600): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  for (let i = 0; i < normalized.length; i += chunkSize) {
    chunks.push(normalized.slice(i, i + chunkSize));
  }
  return chunks;
}
