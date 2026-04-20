# Rentenversicherer: AcroForm Auto-Fill

Purpose

- Browser-UI nimmt ein Original-PDF (mit AcroForm-Feldern) und ein
  Quelldokument (Scan, Brief, Ausweis, o.ä.) entgegen.
- Ein lokales Node-Backend ruft die Claude Code CLI (`claude -p`) als
  Subprozess auf, übergibt beide Dateien und die Liste der AcroForm-
  Feldnamen. Claude liefert strukturiertes JSON mit `{feldname -> wert}`.
- User reviewt/korrigiert die Werte im Browser, lädt das ausgefüllte
  PDF runter.
- Das heruntergeladene PDF bleibt AcroForm (keine Flattening-Operation).
  Im PDF-Reader nachträglich manuell editierbar — als hätte ein Mensch
  es ausgefüllt.

## Scope

- Frontend: React/Vite, Upload + Review-Panel + Live-Preview + Download.
- Backend: Minimaler Node-Server, eine Route `POST /api/process`.
  Spawnt `claude -p --output-format json` mit Temp-Files und einem
  Prompt, der die Ziel-Feldnamen enthält.
- PDF-Handling: `pdfjs-dist` client-side — Widgets sammeln, Werte via
  `annotationStorage.setValue(id, { value })` setzen, `doc.saveDocument()`
  schreibt ein PDF ohne Flatten. (pdf-lib wurde getestet, scheitert aber
  an komprimierten Object-Streams in DRV-Formularen.)
- Lokaler Single-User-Betrieb (localhost).

## Out of scope

- Gemini, Anthropic SDK, Claude Agent SDK — nur die CLI als Subprozess.
- Visual-Overlay-Modus mit Koordinaten für gescannte Flat-PDFs.
- Form-Overlay-View (Drag & Drop) im Review-Panel.
- Authentifizierung, Multi-User, Persistenz, Datenbank.
- PDF-Flattening, Signaturen, Formular-Editor, Seiten-Modifikation.
- Cloud-Deployment.

## Architektur

```
Browser (Vite :5173)
  │ multipart upload: form.pdf + source.pdf + fieldNames[]
  ▼
Node Server (:3001, Express)
  │ 1. schreibt beide PDFs in Temp-Verzeichnis
  │ 2. spawnt:
  │      claude -p --output-format json \
  │        --permission-mode bypassPermissions \
  │        "<Prompt mit Feldliste + Pfaden>"
  │ 3. parst stdout → extrahiert JSON aus result-Feld
  │ 4. löscht Temp-Verzeichnis
  ▼
Browser bekommt { fields: [...], summary: "..." }
  │ User reviewt/korrigiert
  │ pdfjs-dist: annotationStorage.setValue + saveDocument
  │             (kein flatten; AcroForm bleibt erhalten)
  ▼
Download
```

## Repo-Layout

```
Rentenversicherer/
├── App.tsx                   # Upload → Process → Review Flow
├── components/
│   ├── FileUpload.tsx
│   └── ReviewPanel.tsx       # nur List-View, Overlay-View entfernt
├── services/
│   ├── api.ts                # Frontend-Client für /api/process
│   └── pdfService.ts         # getPdfFields + createFilledPdf via pdfjs-dist
├── server/
│   ├── index.ts              # Express: static + /api/process
│   └── claudeRunner.ts       # spawn('claude', ['-p', ...]); JSON-Extraktion
├── types.ts
├── vite.config.ts            # dev-proxy /api → :3001
├── package.json              # dev-script: vite + server parallel
├── tsconfig.json             # shared tsconfig für Client + Server
├── .gitignore
├── PLAN.md
├── AGENTS.md
└── README.md
```

## Workflow (User-Sicht)

1. Original-PDF hochladen. Client scannt AcroForm-Feldnamen
   mit `getPdfFields()` und zeigt die Anzahl als Hinweis.
2. Quelldokument hochladen (PDF oder Bild).
3. "Analyze & Fill" klicken.
4. Browser sendet beide Dateien + Feldliste an `POST /api/process`.
5. Server schreibt Dateien ins Temp-Verzeichnis, baut Prompt, spawnt
   Claude CLI, parst JSON, antwortet.
6. Review-Panel zeigt `{label, value, validation}`-Paare — User korrigiert,
   markiert als verified.
7. "Download" → `createFilledPdf` setzt die Werte via pdfjs
   `annotationStorage` und schreibt mit `doc.saveDocument()`.
   **Kein** Flatten.
8. User öffnet das runtergeladene PDF → Felder sind gefüllt und
   bleiben klick- und editierbar in Acrobat/Reader.

## Umsetzungsschritte

1. `package.json`: Server-Deps (`express`, `multer`, `tsx`,
   `concurrently`, typings) ergänzen, Scripts aktualisieren.
2. `server/claudeRunner.ts`: `spawn` mit Windows-kompatiblem Aufruf,
   stdout buffern, `--output-format json` Result-Wrapper entpacken,
   inneres JSON parsen.
3. `server/index.ts`: Express-App, `multer` für Upload, Temp-Dir pro
   Request, `finally`-Cleanup.
4. `vite.config.ts`: `server.proxy['/api']` nach `http://localhost:3001`.
5. `services/api.ts` als Frontend-Client; `services/geminiService.ts`
   löschen.
6. `services/pdfService.ts`: auf `pdfjs-dist` umgestellt.
   `getPdfFields` iteriert über Pages + Widget-Annotations,
   `createFilledPdf` nutzt `annotationStorage` + `saveDocument`.
7. `components/ReviewPanel.tsx`: Form-Overlay-View entfernen, nur
   List-View behalten, Koordinaten-Logik raus.
8. `App.tsx`: Fehlermeldung, falls Ziel-PDF keine AcroForm-Felder hat
   (UI blockiert Upload dann).
9. Smoke-Test mit
   `G2210-11_Aerztlicher_Befundbericht_Anforderung_WAG.pdf`:
   `npm run dev`, ausfüllen, runterladen, in Acrobat öffnen,
   Feld editieren können.

## Notes

- Claude CLI wird über dein bestehendes Login authentifiziert. Kein
  API-Key im Code oder in Env-Dateien.
- `claude -p` braucht `--permission-mode bypassPermissions`, damit das
  Read-Tool ohne User-Prompt auf die Temp-Files zugreifen darf.
- Temp-Verzeichnisse liegen unter `os.tmpdir()` und werden nach jedem
  Request gelöscht. Kein persistenter Upload-Ordner.
- Windows-Pfad-Konvention: Server nutzt `path.join`, arbeitet also
  plattformneutral. Der Claude-CLI-Aufruf läuft via `shell: true` unter
  PowerShell (vgl. globale CLAUDE.md).
