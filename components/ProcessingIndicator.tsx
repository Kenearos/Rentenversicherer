import React, { useEffect, useState } from 'react';
import { Check, FileText, Loader2, ScanText, Sparkles } from 'lucide-react';

const STAGES = [
  { icon: ScanText, label: 'PDF parsen' },
  { icon: FileText, label: 'Quelldateien lesen' },
  { icon: Sparkles, label: 'Daten extrahieren' },
  { icon: Check, label: 'Felder mappen' },
];

export const ProcessingIndicator: React.FC = () => {
  const [elapsed, setElapsed] = useState(0);
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setElapsed(s);
      // Rotierende Stage alle 6 Sekunden — nur Deko, kein echter Progress.
      setActiveStage(Math.min(Math.floor(s / 6), STAGES.length - 1));
    }, 500);
    return () => clearInterval(id);
  }, []);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const elapsedLabel =
    minutes > 0
      ? `${minutes}:${seconds.toString().padStart(2, '0')} min`
      : `${seconds}s`;

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="relative">
        <div className="absolute inset-0 bg-kng-accent blur-xl opacity-20 rounded-kng-full animate-pulse" />
        <div className="relative bg-kng-bg-elevated p-6 rounded-kng-xl shadow-kng-lg border border-kng-border">
          <Loader2 className="w-12 h-12 text-kng-accent animate-spin" />
        </div>
      </div>
      <h3 className="mt-8 text-2xl font-bold text-kng-text">
        Claude verarbeitet die Dokumente …
      </h3>
      <p className="mt-2 text-kng-text-secondary max-w-md text-center">
        Die Claude-CLI liest alle Quellen und mappt die Daten auf die
        AcroForm-Feldnamen.
      </p>
      <p className="mt-1 text-sm text-kng-text-muted font-mono">
        Läuft seit {elapsedLabel}
      </p>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-3 w-full max-w-3xl">
        {STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const isActive = idx === activeStage;
          const isDone = idx < activeStage;
          return (
            <div
              key={stage.label}
              className={`p-3 rounded-kng-md border flex items-center space-x-2 shadow-kng-sm transition-all duration-300 ${
                isActive
                  ? 'border-kng-accent bg-kng-surface text-kng-text'
                  : isDone
                    ? 'border-kng-success/50 bg-kng-bg-elevated text-kng-success'
                    : 'border-kng-border bg-kng-bg-elevated text-kng-text-muted opacity-60'
              }`}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 ${
                  isActive ? 'text-kng-accent animate-pulse' : ''
                }`}
              />
              <span className="text-xs font-medium truncate">{stage.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
