import React, { useEffect, useMemo, useState } from 'react';
import type { ExtractedField, FileData } from '../types';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  FileText,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { createFilledPdf } from '../services/pdfService';

interface ReviewPanelProps {
  fields: ExtractedField[];
  formFile: FileData;
  summary: string;
  onReset: () => void;
}

type FilterMode = 'ALL' | 'ATTENTION';

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  fields: initialFields,
  formFile,
  summary,
  onReset,
}) => {
  const [fields, setFields] = useState<ExtractedField[]>(initialFields);
  const [activeField, setActiveField] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('ALL');

  const verifiedCount = fields.filter((f) => f.isVerified).length;
  const totalCount = fields.length;
  const progressPercent =
    totalCount === 0 ? 0 : Math.round((verifiedCount / totalCount) * 100);

  const fieldsRequiresAttention = useMemo(
    () => fields.filter((f) => f.validation?.status !== 'VALID'),
    [fields]
  );

  useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      try {
        const bytes = await createFilledPdf(formFile.base64, fields);
        if (!active) return;
        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (e) {
        console.error('[ReviewPanel] preview failed', e);
      }
    }, 600);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [fields, formFile]);

  useEffect(() => {
    return () => {
      setPreviewUrl((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  const handleUpdate = (index: number, newValue: string) => {
    setFields((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        value: newValue,
        isVerified: true,
        validation: {
          ...(next[index].validation ?? { status: 'VALID' }),
          status: 'VALID',
          message: 'Manuell bestätigt',
        },
      };
      return next;
    });
  };

  const toggleVerify = (index: number) => {
    setFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], isVerified: !next[index].isVerified };
      return next;
    });
  };

  const applySuggestion = (index: number) => {
    const suggestion = fields[index].validation?.suggestion;
    if (suggestion) handleUpdate(index, suggestion);
  };

  const handleDownload = async () => {
    const bytes = await createFilledPdf(formFile.base64, fields);
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `filled_${formFile.file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const displayedFields = fields
    .map((f, i) => ({ ...f, originalIndex: i }))
    .sort((a, b) => {
      const aAttn = a.validation?.status !== 'VALID';
      const bAttn = b.validation?.status !== 'VALID';
      if (aAttn && !bAttn) return -1;
      if (!aAttn && bAttn) return 1;
      if (!a.isVerified && b.isVerified) return -1;
      if (a.isVerified && !b.isVerified) return 1;
      return a.originalIndex - b.originalIndex;
    })
    .filter(
      (f) =>
        filterMode === 'ALL' ||
        (f.validation?.status !== 'VALID' && !f.isVerified)
    );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 h-[calc(100vh-80px)] flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-kng-text">Review & Verify</h2>
          <p className="text-kng-text-muted text-sm mt-1">{summary}</p>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="hidden md:flex flex-col items-end mr-2">
            <span className="text-xs font-semibold text-kng-text-secondary mb-1">
              {verifiedCount} / {totalCount} verifiziert
            </span>
            <div className="w-32 h-2 bg-kng-surface rounded-kng-full overflow-hidden">
              <div
                className="h-full bg-kng-success transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <button
            onClick={onReset}
            className="flex items-center px-4 py-2 text-sm font-medium text-kng-text bg-kng-surface border border-kng-border rounded-kng-md hover:bg-kng-surface-hover transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Neu starten
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center px-4 py-2 text-sm font-bold text-kng-bg rounded-kng-md transition-all shadow-kng-md bg-kng-accent hover:brightness-110"
          >
            <Download className="w-4 h-4 mr-2" />
            PDF runterladen
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
        {/* Preview */}
        <div className="bg-kng-bg-elevated rounded-kng-xl overflow-hidden shadow-kng-lg flex flex-col border border-kng-border">
          <div className="p-3 bg-kng-surface border-b border-kng-border flex justify-between items-center">
            <span className="text-xs font-medium text-kng-text-secondary uppercase tracking-wider">
              PDF Preview (live)
            </span>
            <span className="text-xs text-kng-text-muted">
              {formFile.file.name}
            </span>
          </div>
          <div className="flex-1 bg-kng-bg relative">
            {previewUrl ? (
              <>
                <iframe
                  src={previewUrl}
                  title="Form PDF Preview"
                  className="w-full h-full border-none bg-white"
                />
                <div className="absolute bottom-4 right-4 opacity-60 hover:opacity-100 transition-opacity">
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center bg-kng-bg/80 text-kng-text text-xs px-3 py-1.5 rounded-kng-full hover:bg-kng-bg border border-kng-border"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    In neuem Tab öffnen
                  </a>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-kng-text-muted">
                <FileText className="w-16 h-16 mb-4 opacity-50" />
                <p>Preview wird erstellt …</p>
              </div>
            )}
          </div>
        </div>

        {/* Field List */}
        <div className="bg-kng-bg-elevated rounded-kng-xl shadow-kng-md border border-kng-border flex flex-col overflow-hidden">
          <div className="p-4 border-b border-kng-border bg-kng-surface">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-kng-text">Feld-Verifikation</h3>
              <div className="flex space-x-2 text-xs">
                <button
                  onClick={() => setFilterMode('ALL')}
                  className={`px-3 py-1 rounded-kng-full border transition-colors ${
                    filterMode === 'ALL'
                      ? 'bg-kng-accent text-kng-bg border-kng-accent'
                      : 'bg-kng-bg-elevated text-kng-text-secondary border-kng-border hover:bg-kng-surface-hover'
                  }`}
                >
                  Alle ({totalCount})
                </button>
                {fieldsRequiresAttention.length > 0 && (
                  <button
                    onClick={() => setFilterMode('ATTENTION')}
                    className={`px-3 py-1 rounded-kng-full border transition-colors flex items-center ${
                      filterMode === 'ATTENTION'
                        ? 'bg-kng-warning text-kng-bg border-kng-warning'
                        : 'bg-kng-bg-elevated text-kng-warning border-kng-border hover:bg-kng-surface-hover'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Prüfen ({fieldsRequiresAttention.length})
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-kng-bg">
            {displayedFields.map((field) => {
              const idx = field.originalIndex;
              const status = field.validation?.status ?? 'VALID';
              const isVerified = !!field.isVerified;

              let statusBorder = isVerified
                ? 'border-kng-success'
                : 'border-kng-border';
              let statusBg = 'bg-kng-bg-elevated';

              if (!isVerified) {
                if (status === 'INVALID') {
                  statusBorder = 'border-kng-error';
                } else if (status === 'WARNING') {
                  statusBorder = 'border-kng-warning';
                }
              }

              return (
                <div
                  key={idx}
                  className={`relative group rounded-kng-md border transition-all duration-200 p-3 shadow-kng-sm ${
                    activeField === idx
                      ? 'ring-1 ring-kng-accent border-kng-accent shadow-kng-md z-10'
                      : statusBorder
                  } ${statusBg}`}
                  onFocus={() => setActiveField(idx)}
                  onBlur={() => setActiveField(null)}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleVerify(idx)}
                      className={`mt-1 flex-shrink-0 w-5 h-5 rounded-kng-sm border flex items-center justify-center transition-colors ${
                        isVerified
                          ? 'bg-kng-success border-kng-success text-kng-bg'
                          : 'bg-kng-bg border-kng-border text-transparent hover:border-kng-success'
                      }`}
                      title={
                        isVerified
                          ? 'Als unbestätigt markieren'
                          : 'Als bestätigt markieren'
                      }
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <label
                          className={`text-xs font-semibold uppercase tracking-wider truncate ${
                            isVerified
                              ? 'text-kng-success'
                              : 'text-kng-text-secondary'
                          }`}
                        >
                          {field.label || field.key || 'Unbekanntes Feld'}
                        </label>
                        {!isVerified && status !== 'VALID' && (
                          <span
                            className={`flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-kng-sm ${
                              status === 'INVALID'
                                ? 'bg-kng-error text-kng-bg'
                                : 'bg-kng-warning text-kng-bg'
                            }`}
                          >
                            {status === 'INVALID' ? (
                              <XCircle className="w-3 h-3 mr-1" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 mr-1" />
                            )}
                            {status}
                          </span>
                        )}
                      </div>

                      <input
                        type="text"
                        value={field.value}
                        onChange={(e) => handleUpdate(idx, e.target.value)}
                        className="block w-full rounded-kng-sm px-2.5 py-1.5 text-sm font-medium transition-colors border border-kng-border bg-kng-surface text-kng-text placeholder-kng-text-muted focus:border-kng-accent focus:outline-none focus:ring-1 focus:ring-kng-accent"
                        placeholder="leer"
                      />

                      {!isVerified &&
                        field.validation?.suggestion &&
                        status !== 'VALID' && (
                          <button
                            onClick={() => applySuggestion(idx)}
                            className="mt-2 flex items-center text-xs font-bold text-kng-accent hover:brightness-110 bg-kng-surface hover:bg-kng-surface-hover px-2 py-1 rounded-kng-sm transition-colors border border-kng-border"
                          >
                            <ArrowRight className="w-3 h-3 mr-1" />
                            Übernehmen: "{field.validation.suggestion}"
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
