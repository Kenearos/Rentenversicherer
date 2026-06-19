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
    throw new Error(await errorMessageFrom(res));
  }

  const { jobId } = (await res.json()) as { jobId?: string };
  if (!jobId) throw new Error('Server hat keine Job-ID zurückgegeben.');

  return pollJob(jobId);
}

const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 6 * 60 * 1000;
const MAX_CONSECUTIVE_NETWORK_ERRORS = 8;

// Pollt den Job-Status. Kurze Requests -> ein Proxy-Timeout oder ein kurzer
// Netz-Hänger killt nicht mehr die ganze Analyse, sondern wird einfach beim
// nächsten Tick erneut versucht.
async function pollJob(jobId: string): Promise<FormResponse> {
  const start = Date.now();
  let networkErrors = 0;

  while (true) {
    if (Date.now() - start > MAX_WAIT_MS) {
      throw new Error('Zeitüberschreitung beim Warten auf die Analyse.');
    }
    await delay(POLL_INTERVAL_MS);

    let res: Response;
    try {
      res = await fetch(`/api/process/${jobId}`);
      networkErrors = 0;
    } catch {
      // "Failed to fetch" beim Pollen = transient -> weiter versuchen.
      if (++networkErrors >= MAX_CONSECUTIVE_NETWORK_ERRORS) {
        throw new Error(
          'Verbindung zum Server verloren. Läuft der Backend-Container noch?'
        );
      }
      continue;
    }

    if (res.status === 404) {
      throw new Error(
        'Analyse-Job nicht mehr vorhanden (Server neugestartet?). Bitte erneut versuchen.'
      );
    }
    if (!res.ok) {
      throw new Error(await errorMessageFrom(res));
    }

    const data = (await res.json()) as {
      status?: 'pending' | 'done' | 'error';
      result?: FormResponse;
      error?: string;
      details?: string;
    };

    if (data.status === 'pending') continue;
    if (data.status === 'done' && data.result) return data.result;
    if (data.status === 'error') {
      let message = data.error ?? 'Claude CLI failed';
      if (data.details) message += ` — ${data.details}`;
      throw new Error(message);
    }
    throw new Error('Unerwartete Antwort vom Server.');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function errorMessageFrom(res: Response): Promise<string> {
  let message = `Server antwortete mit ${res.status}`;
  try {
    const data = await res.json();
    if (data?.error) message = data.error;
    if (data?.details) message += ` — ${data.details}`;
  } catch {
    // fall through
  }
  return message;
}
