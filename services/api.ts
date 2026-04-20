import type { FileData, FormResponse } from '../types';
import type { PdfFieldInfo } from './pdfService';

export async function processDocuments(
  formFile: FileData,
  sourceFiles: FileData[],
  sourceText: string,
  pdfFields: PdfFieldInfo[]
): Promise<FormResponse> {
  if (pdfFields.length === 0) {
    throw new Error(
      'Das Ziel-PDF enthält keine AcroForm-Felder. ' +
        'Nur Formulare mit interaktiven Feldern werden unterstützt.'
    );
  }
  if (sourceFiles.length === 0 && sourceText.trim().length === 0) {
    throw new Error('Mindestens ein Quelldokument oder Text wird benötigt.');
  }

  const body = new FormData();
  body.append('form', formFile.file, formFile.file.name);
  for (const f of sourceFiles) {
    body.append('sources', f.file, f.file.name);
  }
  if (sourceText.trim().length > 0) {
    body.append('sourceText', sourceText);
  }
  body.append('fields', JSON.stringify(pdfFields));

  const res = await fetch('/api/process', {
    method: 'POST',
    body,
  });

  if (!res.ok) {
    let message = `Server antwortete mit ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
      if (data?.details) message += ` — ${data.details}`;
    } catch {
      // fall through
    }
    throw new Error(message);
  }

  return (await res.json()) as FormResponse;
}
