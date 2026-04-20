# AGENTS.md - Rentenversicherer Repository Guidelines

## Overview

Rentenversicherer ist ein lokales Werkzeug zum halb-automatischen
Ausfüllen von AcroForm-PDFs. Browser-UI + lokaler Node-Server. Der
Server ruft die Claude Code CLI (`claude -p`) als Subprozess auf, um
Daten aus einem Quelldokument in die AcroForm-Feldnamen eines Ziel-PDFs
zu mappen. Das ausgefüllte PDF bleibt editierbar (kein Flatten).

## Run / Dev Commands

Requires: Node.js 20+, Claude Code CLI im PATH, gültiges Claude-Code-Login.

```bash
# Install
npm install

# Development — Vite (5173) + Server (3001) parallel
npm run dev

# Production build und starten
npm run build
npm start

# Typecheck
npx tsc --noEmit
```

## Lint / Test / Validation

Kein dediziertes Test-Framework. Validation:

```bash
# Typecheck (Client + Server, shared tsconfig)
npx tsc --noEmit

# Claude CLI verfügbar?
claude --version

# Smoke-Test (manuell):
# 1. npm run dev
# 2. http://localhost:5173
# 3. Beispiel-PDF hochladen (G2210-11_Aerztlicher_Befundbericht_Anforderung_WAG.pdf)
# 4. Quelldokument hochladen
# 5. Download
# 6. PDF in Acrobat öffnen → Feld klicken → editieren möglich?
```

## Repo Layout

```
Rentenversicherer/
├── App.tsx                   # React-Einstieg, State-Machine (IDLE/PROCESSING/REVIEW)
├── components/
│   ├── FileUpload.tsx        # Drag & Drop + base64-Encoding
│   └── ReviewPanel.tsx       # List-View für extrahierte Felder + PDF-Preview
├── services/
│   ├── api.ts                # fetch('/api/process'), multipart/form-data
│   └── pdfService.ts         # pdfjs-dist: Widgets lesen + saveDocument
├── server/
│   ├── index.ts              # Express + multer, POST /api/process
│   └── claudeRunner.ts       # spawn('claude', ['-p', ...]), JSON-Parsing
├── types.ts                  # ExtractedField, FormResponse, AppStatus, FileData
├── vite.config.ts
├── tsconfig.json
├── package.json
└── PLAN.md
```

## Code Style - TypeScript / React

**Komponenten:**

- Functional Components mit Hooks; keine Class-Components.
- Props-Interfaces am Anfang der Datei, Name endet auf `Props`.
- Dateinamen: `PascalCase.tsx` für Komponenten, `camelCase.ts` für Services.

**Imports:**

- React-Imports zuerst, dann 3rd-Party, dann relativ.
- Keine `*.tsx`-/`*.ts`-Extensions in Imports.

**Styling:**

- Tailwind ausschließlich. Keine CSS-Module, kein inline-style außer für
  dynamisch berechnete Werte.
- Lucide-Icons (`lucide-react`) für alle Icons.

**Types:**

- Shared Types in `types.ts`. Keine Duplikate in Komponenten.
- `any` vermeiden. `unknown` + Type-Guards bevorzugen.

## Code Style - Server (Node/TypeScript)

- Module: ESM (`"type": "module"` in package.json).
- `tsx watch` für dev; kein ts-node, kein nodemon.
- Async/await überall, kein callback-style.
- Fehler aus dem Claude-Subprozess als 502 ans Frontend weiterreichen,
  mit `message` im JSON-Body — niemals stdout/stderr roh leaken.

## Naming Conventions

- Komponenten: `PascalCase` (`ReviewPanel`, `FileUpload`).
- Services: `camelCase` (`pdfService`, `claudeRunner`, `api`).
- Types/Interfaces: `PascalCase` (`ExtractedField`, `FormResponse`).
- Enums: `PascalCase` Key, `UPPER_CASE` Values (`AppStatus.IDLE`).
- Routes: `kebab-case` (`/api/process`).

## Security Rules

1. Kein API-Key im Code und nicht in `.env.local`. Auth läuft über das
   bestehende Claude-Code-Login.
2. Uploads nur in `os.tmpdir()`, pro Request eigenes Subverzeichnis,
   Cleanup im `finally`-Block.
3. `multer` mit `limits.fileSize` (z.B. 20 MB) — keine unbegrenzten
   Uploads.
4. `multer` mit Allowlist für MIME-Types (PDF, PNG, JPEG, WEBP).
5. Server lauscht nur auf `127.0.0.1`, nicht auf `0.0.0.0`.
6. Dateinamen aus dem Upload niemals als Pfad verwenden — immer
   UUID/Counter.

## Architecture Rules (non-negotiable)

1. **Nie** flatten — bricht das Kernversprechen, dass das PDF
   im Reader editierbar bleibt. pdfjs' `saveDocument()` flacht nicht,
   das ist genau der richtige Modus.
2. Werte **immer** über `annotationStorage.setValue(widgetId, { value })`
   setzen, nicht versuchen einzelne Annotation-Objekte zu mutieren.
3. Original-PDF-Bytes bleiben strukturell unverändert. Nur Feldwerte
   werden gesetzt. Keine Seiten-Mutationen, keine neuen Objekte, keine
   Annotations.
4. Wenn Ziel-PDF keine AcroForm-Felder hat: Hard-Fail mit klarer
   User-Meldung. **Kein** Fallback auf Overlay/Koordinaten-Modus.
5. `claude`-Subprozess **immer** mit `--permission-mode bypassPermissions`,
   sonst blockiert er auf Tool-Prompts.
6. Der Server gibt **nur** strukturiertes JSON an das Frontend weiter —
   Claude-Stdout nie ungeparst durchreichen.
7. Temp-Verzeichnisse werden nach jedem Request gelöscht, auch im
   Fehlerfall.

## Error Handling

- Client zeigt alle Fehler im roten Banner auf der Upload-Seite.
- Server-Errors: JSON `{ error: string, details?: string }`, HTTP-Status
  4xx/5xx passend.
- Claude-CLI-Exitcode ≠ 0 oder Timeout → 502 + `message: "Claude CLI
  failed"` + Exit-Code.
- Kein Retry auf Server-Seite. Bei Bedarf triggert der User den Request
  erneut.
- Unhandled rejections im Server: `process.on('unhandledRejection', ...)`
  loggen, nicht crashen.

## Claude CLI Interface

Der Aufruf aus `server/claudeRunner.ts`:

```bash
claude \
  -p "<prompt>" \
  --output-format json \
  --permission-mode bypassPermissions
```

Prompt-Grobskizze (Deutsch, weil Formulare deutsch sind):

```
Du füllst ein deutsches Behördenformular aus.

TARGET-FORM: <tempdir>/form.pdf
SOURCE:      <tempdir>/source.pdf

Die Feldnamen im TARGET-Formular sind:
  - feld1 (PDFTextField)
  - feld2 (PDFCheckBox)
  ...

Lies beide Dateien mit dem Read-Tool, extrahiere die Werte aus dem
SOURCE und gib NUR ein JSON-Objekt zurück im Format:

{
  "summary": "...",
  "fields": [
    { "key": "feldname", "label": "...", "value": "...",
      "sourceContext": "...",
      "validation": { "status": "VALID"|"WARNING"|"INVALID",
                      "message": "...", "suggestion": "..." } }
  ]
}

Deutsches Format:
- Datum: DD.MM.YYYY
- Zahlen: Komma als Dezimaltrenner
- Checkbox-Wert: "X" wenn angekreuzt, "" sonst
```

Das JSON landet als String im `result`-Feld des CLI-Output-Wrappers
(`--output-format json`). `claudeRunner.ts` zieht es raus und
`JSON.parse`t es.
