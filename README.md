# Rentenversicherer

Halbautomatisches Ausfüllen von deutschen AcroForm-PDFs (Reha-Anträge,
ärztliche Befundberichte, etc.) mit der Claude Code CLI als Subprozess.

- Original-PDF bleibt strukturell unverändert — Felder sind nach dem
  Ausfüllen im PDF-Reader weiter editierbar (kein Flatten).
- Claude zieht die Werte aus beliebig vielen Quelldateien (PDF/Bild) und
  optionalem freiem Text.
- Browser-UI im Kanagawa-Design-Schema, Review-Panel mit Live-Preview.

## Voraussetzungen

- Node.js 20+
- Claude Code CLI im `PATH`, gültiges Claude-Login
- Windows: Git Bash (`CLAUDE_CODE_GIT_BASH_PATH` wird auf dem
  Scoop-Standard-Pfad gesetzt — falls du Git anders installiert hast,
  in der Shell vorher setzen oder `server/claudeRunner.ts:GIT_BASH_FALLBACK`
  anpassen)

## Start

```bash
npm install
npm run dev
```

- Browser-UI: <http://localhost:5173>
- Backend-Health: <http://127.0.0.1:3001/api/health>

## Workflow

1. **Ziel-Formular** (PDF mit AcroForm-Feldern) in die linke Spalte ziehen.
   Die App zeigt an, wie viele Felder erkannt wurden.
2. **Quelldokumente** rechts hochladen — beliebig viele PDFs/Bilder, plus
   optional ein Freitext-Feld.
3. **„Analysieren & Ausfüllen"** — kann 30–120 Sekunden dauern, je nach
   Umfang. Claude-CLI läuft headless im Backend.
4. **Review-Panel** — Werte prüfen, bei Bedarf korrigieren, mit Haken
   bestätigen.
5. **„PDF runterladen"** — das Original-PDF mit gesetzten Feldern.
   Im Acrobat/Reader können die Felder weiter bearbeitet werden.

## Arbeitsregeln für die Verarbeitung

Im Prompt an Claude fest eingebaut (siehe `server/claudeRunner.ts`):

- Stichwortstil, kein Gutachten
- Feste Zeichen-Kästchen (VSNR, IBAN, BIC, IK) ohne Leerzeichen
- Vordrucke respektieren (kein doppeltes "DE", kein "€")
- Nur medizinisch; Sozialbereich bleibt leer
- Keine geratenen Werte — bei Unsicherheit leer + WARNING
- PDF nie flatten

## Dokumentation

- [`PLAN.md`](./PLAN.md) — Zweck, Scope, Architektur
- [`AGENTS.md`](./AGENTS.md) — Commands, Code-Style, Architektur-Regeln
