import { spawn } from 'node:child_process';
import path from 'node:path';

export interface ClaudeFieldSpec {
  name: string;
  type: string;
}

export interface ClaudeExtractedField {
  key: string;
  label: string;
  value: string;
  sourceContext?: string;
  validation: {
    status: 'VALID' | 'WARNING' | 'INVALID';
    message?: string;
    suggestion?: string;
  };
}

export interface ClaudeFormResponse {
  summary: string;
  fields: ClaudeExtractedField[];
}

interface ClaudeCliEnvelope {
  type: string;
  subtype: string;
  is_error: boolean;
  result?: string;
}

export interface RunClaudeArgs {
  formFilename: string;
  sourceFilenames: string[];
  hasSourceText: boolean;
  fields: ClaudeFieldSpec[];
}

const GIT_BASH_FALLBACK =
  'C:\\Users\\benad\\scoop\\apps\\git\\2.53.0\\usr\\bin\\bash.exe';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function describeType(t: string): string {
  switch (t) {
    case 'Tx':
      return 'Text';
    case 'Btn':
      return 'Checkbox/Button';
    case 'Ch':
      return 'Auswahlliste';
    case 'Sig':
      return 'Unterschrift';
    default:
      return t;
  }
}

function buildPrompt(tempDir: string, args: RunClaudeArgs): string {
  const formPath = path.join(tempDir, args.formFilename);
  const sourcePaths = args.sourceFilenames.map((n) => path.join(tempDir, n));
  const textPath = args.hasSourceText
    ? path.join(tempDir, 'source_text.txt')
    : null;

  const fieldList = args.fields
    .map((f) => `  - "${f.name}" (${describeType(f.type)})`)
    .join('\n');

  const sourceBlock: string[] = [];
  if (sourcePaths.length > 0) {
    sourceBlock.push('SOURCE-DATEIEN (alle mit dem Read-Tool lesen):');
    for (const p of sourcePaths) sourceBlock.push(`  - ${p}`);
  }
  if (textPath) {
    sourceBlock.push(
      `ZUSÄTZLICHER TEXT: ${textPath} (Notizen/Kontext vom User)`
    );
  }

  return [
    'Du füllst ein deutsches Behörden-/Arztformular aus.',
    '',
    `TARGET-FORM: ${formPath}`,
    '',
    ...sourceBlock,
    '',
    'AcroForm-Felder im TARGET:',
    fieldList,
    '',
    'Lies das TARGET-Formular und alle Quelldateien/Text mit dem Read-Tool.',
    'Extrahiere die Werte aus den Quellen und mappe sie auf die Feldnamen',
    'des TARGET. Quellen können sich überschneiden — bei Widersprüchen',
    'nimm den plausibelsten Wert und setze validation.status = "WARNING".',
    '',
    'ARBEITSREGELN (non-negotiable):',
    '',
    '1. STICHWORTSTIL, KEIN GUTACHTEN — kurze Einträge, keine ausformulierten',
    '   Sätze. "Akute Lumboischialgie" statt "Der Patient leidet seit …".',
    '',
    '2. FESTE ZEICHEN-KÄSTCHEN OHNE LEERZEICHEN — bei VSNR, IBAN, BIC,',
    '   Institutionskennzeichen (IK), Postleitzahl etc. werden die Zeichen in',
    '   einzelne Kästchen geschrieben. Zusammenhängend ohne Leerzeichen/Punkte',
    '   /Bindestriche ausgeben, auch wenn die Quelle sie enthält.',
    '   Beispiel: Quelle "12 340567 A 005" → value "12340567A005".',
    '',
    '3. VORDRUCKE RESPEKTIEREN — wenn das Formular ein Präfix schon druckt',
    '   (z.B. "DE" vor der IBAN, "€" vor dem Betrag), NICHT nochmal',
    '   mitschreiben. Nur den variablen Teil ins Feld.',
    '',
    '4. RICHTIGES FELD — gleiche Labels können mehrfach vorkommen',
    '   (Antragsteller vs. Zahlungsempfänger, erste vs. Folgeseite).',
    '   Feldname und Umfeld analysieren, Wert in den passenden Abschnitt.',
    '',
    '5. NUR MEDIZINISCH — Sozialbereich (Familienstand, Einkommen,',
    '   Wohnsituation jenseits der Adresse) bleibt leer, außer explizit',
    '   in den Quellen enthalten.',
    '',
    '6. KEINE GERATENEN WERTE — bei Unsicherheit: value="" und',
    '   validation.status="WARNING" mit Begründung. Nicht halluzinieren.',
    '   Lieber leer lassen als falsch ausfüllen.',
    '',
    'FORMAT-REGELN:',
    '- Datum: DD.MM.YYYY',
    '- Zahlen: Komma als Dezimaltrenner, Punkt als Tausendertrenner',
    '- Checkbox/Button (Btn): value="X" wenn angekreuzt, value="" sonst',
    '',
    'Wenn ein Feld aus den Quellen nicht sicher ableitbar ist:',
    '  value="" und validation.status="WARNING" mit Begründung.',
    'Wenn ein Feld klar kein Match hat: value="" und status="VALID".',
    '',
    'ANTWORTE NUR mit einem JSON-Objekt in diesem Format,',
    'ohne Markdown-Codefence, ohne Kommentar davor oder danach:',
    '',
    '{',
    '  "summary": "kurze Beschreibung was verarbeitet wurde",',
    '  "fields": [',
    '    {',
    '      "key": "<exakter Feldname aus Liste>",',
    '      "label": "<menschenlesbar>",',
    '      "value": "<Wert oder leer>",',
    '      "sourceContext": "<Textsnippet aus der jeweiligen Quelle>",',
    '      "validation": { "status": "VALID|WARNING|INVALID", "message": "...", "suggestion": "..." }',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

export async function runClaude(
  tempDir: string,
  args: RunClaudeArgs,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ClaudeFormResponse> {
  const prompt = buildPrompt(tempDir, args);

  const env = {
    ...process.env,
    CLAUDE_CODE_GIT_BASH_PATH:
      process.env.CLAUDE_CODE_GIT_BASH_PATH ?? GIT_BASH_FALLBACK,
  };

  const cliArgs = [
    '-p',
    '--output-format',
    'json',
    '--permission-mode',
    'bypassPermissions',
  ];

  return new Promise<ClaudeFormResponse>((resolve, reject) => {
    const child = spawn('claude', cliArgs, {
      env,
      cwd: tempDir,
      shell: true,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Prompt via stdin — umgeht Windows-Shell-Escaping von Newlines/Quotes.
    child.stdin.write(prompt);
    child.stdin.end();

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`Claude CLI timeout nach ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Claude CLI spawn-Fehler: ${err.message}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        reject(
          new Error(
            `Claude CLI exit ${code}. stderr: ${stderr.slice(0, 500)}`
          )
        );
        return;
      }

      let envelope: ClaudeCliEnvelope;
      try {
        envelope = JSON.parse(stdout);
      } catch {
        reject(
          new Error(`Claude CLI-Output ist kein JSON: ${stdout.slice(0, 300)}`)
        );
        return;
      }

      if (envelope.is_error || !envelope.result) {
        reject(
          new Error(
            `Claude CLI meldete Fehler: ${JSON.stringify(envelope).slice(0, 500)}`
          )
        );
        return;
      }

      let parsed: ClaudeFormResponse;
      try {
        parsed = JSON.parse(stripCodeFence(envelope.result));
      } catch {
        reject(
          new Error(
            `Inneres Result ist kein JSON: ${envelope.result.slice(0, 300)}`
          )
        );
        return;
      }

      if (!Array.isArray(parsed.fields)) {
        reject(new Error('Claude-Antwort hat kein fields-Array.'));
        return;
      }

      resolve(parsed);
    });
  });
}
