import { parseItemList, type ParsedItem } from './analyze';

/** Liest Text aus einem Screenshot (z. B. eingeblendete Materialliste im Video). Läuft lokal per Tesseract. */
export async function ocrImage(image: Blob): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['eng', 'deu']);
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

export async function itemsFromImage(image: Blob): Promise<{ text: string; items: ParsedItem[] }> {
  const text = await ocrImage(image);
  return { text, items: parseItemList(text) };
}
