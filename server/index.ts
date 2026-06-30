import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runClaude, type ClaudeFieldSpec } from './claudeRunner.ts';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '127.0.0.1';
const IS_PROD = process.env.NODE_ENV === 'production';
const DIST_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist'
);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCES = 10;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_SOURCES + 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error(`Unsupported mime: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

// Temp-Basis einmalig beim Start auflösen. Verlässt man sich blind auf
// os.tmpdir(), schlägt das Anlegen pro Request mit ENOENT/EACCES fehl, wenn
// /tmp im Deployment kaputt ist (totes Symlink, fehlendes TMPDIR-Ziel, für
// UID 1000 nicht beschreibbar). Wir probieren Kandidaten durch und nehmen den
// ersten, in den wir tatsächlich schreiben können — mit app-lokalem Fallback.
function resolveTmpBase(): string {
  const candidates = [
    process.env.RENTENV_TMP_DIR,
    os.tmpdir(),
    path.join(process.cwd(), '.rentenv-tmp'),
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);

  for (const base of candidates) {
    try {
      mkdirSync(base, { recursive: true });
      // Schreib-Probe: bestätigt, dass die Basis wirklich beschreibbar ist und
      // nicht nur (scheinbar) existiert.
      const probe = path.join(base, `.probe-${process.pid}`);
      writeFileSync(probe, '');
      rmSync(probe, { force: true });
      return base;
    } catch {
      // nächsten Kandidaten versuchen
    }
  }

  // Letzter Ausweg: os.tmpdir() zurückgeben und den eigentlichen Fehler beim
  // Request sichtbar werden lassen.
  return os.tmpdir();
}

const TMP_BASE = resolveTmpBase();

const app = express();

app.post(
  '/api/process',
  upload.fields([
    { name: 'form', maxCount: 1 },
    { name: 'sources', maxCount: MAX_SOURCES },
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const formFile = files?.form?.[0];
    const sourceFiles = files?.sources ?? [];
    const sourceText =
      typeof req.body?.sourceText === 'string'
        ? req.body.sourceText.trim()
        : '';

    if (!formFile) {
      res.status(400).json({ error: 'form wird benötigt.' });
      return;
    }
    if (sourceFiles.length === 0 && sourceText.length === 0) {
      res
        .status(400)
        .json({ error: 'Mindestens eine Quelldatei oder sourceText nötig.' });
      return;
    }

    let fieldSpecs: ClaudeFieldSpec[];
    try {
      const raw = req.body?.fields;
      if (typeof raw !== 'string') throw new Error('fields fehlt');
      fieldSpecs = JSON.parse(raw);
      if (!Array.isArray(fieldSpecs) || fieldSpecs.length === 0) {
        throw new Error('fields muss ein nicht-leeres Array sein');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(400).json({ error: `fields-Parameter ungültig: ${msg}` });
      return;
    }

    const requestId = randomUUID();
    const tempDir = path.join(TMP_BASE, `rentenv-${requestId}`);
    const formName = filenameForMime('form', formFile.mimetype);

    try {
      await mkdir(tempDir, { recursive: true });
      await writeFile(path.join(tempDir, formName), formFile.buffer);

      const sourceNames: string[] = [];
      for (let i = 0; i < sourceFiles.length; i++) {
        const f = sourceFiles[i];
        const name = filenameForMime(`source_${i + 1}`, f.mimetype);
        await writeFile(path.join(tempDir, name), f.buffer);
        sourceNames.push(name);
      }

      if (sourceText.length > 0) {
        await writeFile(path.join(tempDir, 'source_text.txt'), sourceText);
      }

      const result = await runClaude(tempDir, {
        formFilename: formName,
        sourceFilenames: sourceNames,
        hasSourceText: sourceText.length > 0,
        fields: fieldSpecs,
      });
      res.json(result);
    } catch (e: unknown) {
      next(e);
    } finally {
      if (existsSync(tempDir)) {
        rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[server error]', msg);
  res.status(502).json({ error: 'Claude CLI failed', details: msg });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Production: statische Assets + SPA-Fallback auf index.html.
if (IS_PROD && existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`);
  console.log(`[server] temp base: ${TMP_BASE}`);
});

function filenameForMime(base: string, mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return `${base}.pdf`;
    case 'image/png':
      return `${base}.png`;
    case 'image/jpeg':
      return `${base}.jpg`;
    case 'image/webp':
      return `${base}.webp`;
    default:
      return `${base}.bin`;
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
