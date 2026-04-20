import React, { useEffect, useState } from 'react';
import { AppStatus, type FileData, type FormResponse } from './types';
import { FileUpload } from './components/FileUpload';
import { SourceInput } from './components/SourceInput';
import { ReviewPanel } from './components/ReviewPanel';
import { ThemeToggle } from './components/ThemeToggle';
import { ProcessingIndicator } from './components/ProcessingIndicator';
import { processDocuments } from './services/api';
import { getPdfFields, type PdfFieldInfo } from './services/pdfService';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  FileCheck2,
  ScanText,
  Sparkles,
} from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [formFile, setFormFile] = useState<FileData | null>(null);
  const [sourceFiles, setSourceFiles] = useState<FileData[]>([]);
  const [sourceText, setSourceText] = useState('');
  const [pdfFields, setPdfFields] = useState<PdfFieldInfo[]>([]);
  const [pdfFieldsChecked, setPdfFieldsChecked] = useState(false);
  const [responseData, setResponseData] = useState<FormResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!formFile) {
        setPdfFields([]);
        setPdfFieldsChecked(false);
        return;
      }
      if (formFile.type !== 'application/pdf') {
        setPdfFields([]);
        setPdfFieldsChecked(true);
        return;
      }
      const fields = await getPdfFields(formFile.base64);
      setPdfFields(fields);
      setPdfFieldsChecked(true);
    };
    run();
  }, [formFile]);

  const noAcroForm = !!formFile && pdfFieldsChecked && pdfFields.length === 0;
  const hasAnySource = sourceFiles.length > 0 || sourceText.trim().length > 0;

  const handleAnalyze = async () => {
    if (!formFile || !hasAnySource) return;
    if (pdfFields.length === 0) {
      setError(
        'Das Ziel-PDF enthält keine AcroForm-Felder. Bitte ein Formular mit interaktiven Feldern hochladen.'
      );
      setStatus(AppStatus.ERROR);
      return;
    }

    setStatus(AppStatus.PROCESSING);
    setError(null);

    try {
      const data = await processDocuments(
        formFile,
        sourceFiles,
        sourceText,
        pdfFields
      );
      setResponseData(data);
      setStatus(AppStatus.REVIEW);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Während der Analyse ist etwas schiefgelaufen.');
      setStatus(AppStatus.ERROR);
    }
  };

  const reset = () => {
    if (formFile?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(formFile.previewUrl);
    }
    for (const f of sourceFiles) {
      if (f.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(f.previewUrl);
    }

    setStatus(AppStatus.IDLE);
    setFormFile(null);
    setSourceFiles([]);
    setSourceText('');
    setResponseData(null);
    setError(null);
    setPdfFields([]);
    setPdfFieldsChecked(false);
  };

  if (status === AppStatus.REVIEW && responseData && formFile) {
    return (
      <div className="min-h-screen bg-kng-bg">
        <header className="bg-kng-bg-elevated border-b border-kng-border sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="bg-kng-accent p-1.5 rounded-kng-md">
                <Bot className="w-5 h-5 text-kng-bg" />
              </div>
              <span className="font-bold text-lg text-kng-text">
                Rentenversicherer
              </span>
            </div>
            <ThemeToggle />
          </div>
        </header>
        <ReviewPanel
          fields={responseData.fields}
          summary={responseData.summary}
          formFile={formFile}
          onReset={reset}
        />
      </div>
    );
  }

  const analyzeDisabled =
    !formFile ||
    !hasAnySource ||
    !pdfFieldsChecked ||
    pdfFields.length === 0 ||
    status === AppStatus.PROCESSING;

  return (
    <div className="min-h-screen bg-kng-bg flex flex-col">
      <header className="bg-kng-bg-elevated border-b border-kng-border">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-kng-accent p-2 rounded-kng-lg shadow-kng-md">
              <Bot className="w-6 h-6 text-kng-bg" />
            </div>
            <div>
              <h1 className="font-bold text-xl text-kng-text tracking-tight">
                Rentenversicherer
              </h1>
              <p className="text-xs text-kng-text-muted font-medium">
                AcroForm-PDFs halbautomatisch ausfüllen
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center space-x-6 text-sm font-medium text-kng-text-secondary">
              <span className="flex items-center">
                <ScanText className="w-4 h-4 mr-2" />
                1. Scan
              </span>
              <span className="flex items-center">
                <Sparkles className="w-4 h-4 mr-2" />
                2. Extract
              </span>
              <span className="flex items-center">
                <FileCheck2 className="w-4 h-4 mr-2" />
                3. Review
              </span>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-12 flex flex-col justify-center">
        {status === AppStatus.IDLE || status === AppStatus.ERROR ? (
          <>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-extrabold text-kng-text mb-4">
                PDF-Formular automatisch ausfüllen
              </h2>
              <p className="text-lg text-kng-text-secondary max-w-2xl mx-auto">
                Original-PDF (mit AcroForm-Feldern) und beliebig viele
                Quelldokumente hochladen. Claude extrahiert die Daten, du
                prüfst und lädst das ausgefüllte — weiterhin editierbare —
                PDF runter.
              </p>
            </div>

            <div className="bg-kng-bg-elevated rounded-kng-xl shadow-kng-lg border border-kng-border overflow-hidden">
              {error && (
                <div className="bg-kng-bg border-l-4 border-kng-error p-4 m-4 rounded-kng-md">
                  <div className="flex">
                    <AlertTriangle className="h-5 w-5 text-kng-error flex-shrink-0" />
                    <p className="text-sm text-kng-error ml-3">{error}</p>
                  </div>
                </div>
              )}

              {noAcroForm && !error && (
                <div className="bg-kng-bg border-l-4 border-kng-warning p-4 m-4 rounded-kng-md">
                  <div className="flex">
                    <AlertTriangle className="h-5 w-5 text-kng-warning flex-shrink-0" />
                    <p className="text-sm text-kng-warning ml-3">
                      Das Ziel-PDF enthält keine AcroForm-Felder. Nur Formulare
                      mit interaktiven Feldern werden unterstützt.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-8 p-8">
                <div className="space-y-4">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-8 h-8 rounded-kng-full bg-kng-surface flex items-center justify-center font-bold text-kng-text-secondary border border-kng-border">
                      1
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-kng-text text-lg">
                        Ziel-Formular
                      </h3>
                      {pdfFields.length > 0 && (
                        <span className="text-xs text-kng-success font-medium bg-kng-surface px-2 py-0.5 rounded-kng-full">
                          {pdfFields.length} AcroForm-Felder erkannt
                        </span>
                      )}
                    </div>
                  </div>
                  <FileUpload
                    label="Ausfüllbares PDF"
                    description="Original-PDF mit AcroForm-Feldern."
                    accept="application/pdf"
                    onFileSelect={setFormFile}
                    selectedFile={formFile}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-8 h-8 rounded-kng-full bg-kng-surface flex items-center justify-center font-bold text-kng-text-secondary border border-kng-border">
                      2
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-kng-text text-lg">
                        Quelldokumente
                      </h3>
                      {sourceFiles.length > 0 && (
                        <span className="text-xs text-kng-accent font-medium bg-kng-surface px-2 py-0.5 rounded-kng-full">
                          {sourceFiles.length}{' '}
                          {sourceFiles.length === 1 ? 'Datei' : 'Dateien'}
                        </span>
                      )}
                    </div>
                  </div>
                  <SourceInput
                    files={sourceFiles}
                    text={sourceText}
                    onFilesChange={setSourceFiles}
                    onTextChange={setSourceText}
                  />
                </div>
              </div>

              <div className="bg-kng-bg p-6 border-t border-kng-border flex justify-end">
                <button
                  onClick={handleAnalyze}
                  disabled={analyzeDisabled}
                  className={`flex items-center px-6 py-3 rounded-kng-lg font-bold shadow-kng-md transition-all ${
                    analyzeDisabled
                      ? 'bg-kng-surface text-kng-text-muted cursor-not-allowed shadow-none'
                      : 'bg-kng-accent text-kng-bg hover:brightness-110 transform hover:-translate-y-0.5'
                  }`}
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Analysieren & Ausfüllen
                  <ArrowRight className="w-5 h-5 ml-2" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <ProcessingIndicator />
        )}
      </main>
    </div>
  );
};

export default App;
