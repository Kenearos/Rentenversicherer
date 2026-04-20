import * as pdfjs from 'pdfjs-dist';
// @ts-expect-error - ?url-Import ist Vite-spezifisch, wird zur Build-Zeit aufgelöst
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { ExtractedField } from '../types';

// pdfjs rendert AcroForm-Text mit der im PDF definierten Default-Appearance
// (Font-Größe + Farbe). In Behördenformularen ist das oft 10–11pt und blau,
// was im ausgefüllten PDF zu groß und farblich falsch aussieht.
//
// Lösung: Das pdf.worker.mjs-Script wird zur Laufzeit gezogen, zwei Stellen
// gepatcht und als Blob-URL als Worker-Src gesetzt:
//   1. fontSize → 0  ⇒ pdfjs schaltet auf Auto-Size (passt sich an Feldhöhe an)
//   2. fontColor → schwarz
// So bleibt der Rest des PDFs unverändert, nur Textwerte rendern kleiner/schwarz.
let workerPromise: Promise<void> | null = null;

function ensureWorker(): Promise<void> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    try {
      const res = await fetch(workerUrl as string);
      if (!res.ok) throw new Error(`worker fetch failed: ${res.status}`);
      let src = await res.text();

      // 1. Auto-Size erzwingen
      src = src.replace(
        /let\s*\{\s*fontSize\s*\}\s*=\s*this\.data\.defaultAppearanceData;/,
        'let fontSize = 0; void this.data.defaultAppearanceData;'
      );

      // 2. Font-Farbe schwarz erzwingen (Arbeitsregel: Schrift schwarz)
      src = src.replace(
        /const\s*\{\s*fontName,\s*fontColor\s*\}\s*=\s*this\.data\.defaultAppearanceData;/,
        'const { fontName } = this.data.defaultAppearanceData; const fontColor = new Uint8ClampedArray([0,0,0]);'
      );

      const blob = new Blob([src], { type: 'text/javascript' });
      pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    } catch (e) {
      // Fallback: ungepatchter Worker — lieber laufen lassen als App brechen.
      console.warn('[pdfService] worker patch failed, falling back', e);
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl as string;
    }
  })();
  return workerPromise;
}

export interface PdfFieldInfo {
  name: string;
  type: string; // 'Tx' | 'Btn' | 'Ch' | 'Sig'
}

interface WidgetInfo {
  id: string;
  fieldName: string;
  fieldType: string;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function collectWidgets(
  data: Uint8Array
): Promise<{ doc: pdfjs.PDFDocumentProxy; widgets: WidgetInfo[] }> {
  await ensureWorker();
  const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false });
  const doc = await loadingTask.promise;
  const widgets: WidgetInfo[] = [];

  for (let pageIdx = 1; pageIdx <= doc.numPages; pageIdx++) {
    const page = await doc.getPage(pageIdx);
    const anns = await page.getAnnotations();
    for (const ann of anns) {
      if (ann.subtype !== 'Widget') continue;
      if (!ann.fieldName) continue;
      widgets.push({
        id: ann.id,
        fieldName: ann.fieldName,
        fieldType: ann.fieldType,
      });
    }
  }

  return { doc, widgets };
}

export async function getPdfFields(base64: string): Promise<PdfFieldInfo[]> {
  try {
    const data = base64ToUint8Array(base64);
    const { widgets } = await collectWidgets(data);
    const seen = new Set<string>();
    const unique: PdfFieldInfo[] = [];
    for (const w of widgets) {
      if (seen.has(w.fieldName)) continue;
      seen.add(w.fieldName);
      unique.push({ name: w.fieldName, type: w.fieldType });
    }
    return unique;
  } catch (e) {
    console.warn('[pdfService] getPdfFields failed:', e);
    return [];
  }
}

export async function createFilledPdf(
  base64: string,
  fields: ExtractedField[]
): Promise<Uint8Array> {
  const data = base64ToUint8Array(base64);
  const { doc, widgets } = await collectWidgets(data);

  const byName = new Map<string, ExtractedField>();
  for (const f of fields) {
    if (f.key) byName.set(f.key, f);
  }

  const store = doc.annotationStorage;

  for (const w of widgets) {
    const source = byName.get(w.fieldName);
    if (!source) continue;

    if (w.fieldType === 'Tx') {
      store.setValue(w.id, { value: source.value ?? '' });
    } else if (w.fieldType === 'Btn') {
      const checked = isTruthyCheckbox(source.value);
      store.setValue(w.id, { value: checked });
    } else if (w.fieldType === 'Ch') {
      store.setValue(w.id, { value: source.value ?? '' });
    }
    // Sig (Signature) wird übersprungen.
  }

  return await doc.saveDocument();
}

function isTruthyCheckbox(value: string): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'x' || v === 'ja' || v === 'yes' || v === 'true' || v === '1';
}
