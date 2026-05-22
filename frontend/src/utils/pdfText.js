import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const normalizeLine = (value) => value.replace(/\s+/g, ' ').trim();

const pageItemsToLines = (items) => {
  const rows = new Map();

  items.forEach((item) => {
    const text = normalizeLine(item.str || '');
    if (!text) return;

    const [, , , , x, y] = item.transform;
    const rowKey = Math.round(y / 3) * 3;
    const row = rows.get(rowKey) || [];
    row.push({ x, text });
    rows.set(rowKey, row);
  });

  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row
      .sort((a, b) => a.x - b.x)
      .map((part) => part.text)
      .join(' '))
    .map(normalizeLine)
    .filter(Boolean);
};

export const extractPdfText = async (file) => {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = pageItemsToLines(content.items).join('\n').trim();

    if (pageText) {
      pages.push(pageText);
    }
  }

  return pages.join('\n\n').trim();
};
