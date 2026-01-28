import React, { useState, useEffect } from 'react';
import { AppStatus, FileData, FormResponse } from './types';
import { FileUpload } from './components/FileUpload';
import { ReviewPanel } from './components/ReviewPanel';
import { ApiKeyModal } from './components/ApiKeyModal';
import { processDocuments } from './services/geminiService';
import { getPdfFields, PdfFieldInfo } from './services/pdfService';
import { getApiKey, setApiKey, hasApiKey } from './services/apiKeyService';
import { Bot, Sparkles, ArrowRight, FileCheck2, ScanText, Loader2, AlertTriangle, FileText, Check, Settings } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [formFile, setFormFile] = useState<FileData | null>(null);
  const [sourceFile, setSourceFile] = useState<FileData | null>(null);
  const [pdfFields, setPdfFields] = useState<PdfFieldInfo[]>([]);
  const [responseData, setResponseData] = useState<FormResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(!hasApiKey());

  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    setShowApiKeyModal(false);
  };

  useEffect(() => {
    const analyzePdf = async () => {
      if (formFile && formFile.type === 'application/pdf') {
        const fields = await getPdfFields(formFile.base64);
        setPdfFields(fields);
        console.log("Detected PDF fields:", fields);
      } else {
        setPdfFields([]);
      }
    };
    analyzePdf();
  }, [formFile]);

  const handleAnalyze = async () => {
    if (!formFile || !sourceFile) return;
    
    setStatus(AppStatus.PROCESSING);
    setError(null);
    
    try {
      const data = await processDocuments(formFile, sourceFile, pdfFields);
      setResponseData(data);
      setStatus(AppStatus.REVIEW);
    } catch (e: any) {
      setError(e.message || "Something went wrong during analysis.");
      setStatus(AppStatus.ERROR);
    }
  };

  const reset = () => {
    setStatus(AppStatus.IDLE);
    setFormFile(null);
    setSourceFile(null);
    setResponseData(null);
    setError(null);
    setPdfFields([]);
  };

  if (status === AppStatus.REVIEW && responseData && formFile && sourceFile) {
    return (
      <div className="min-h-screen bg-slate-50">
        <ApiKeyModal
          isOpen={showApiKeyModal}
          onSave={handleSaveApiKey}
          onClose={() => setShowApiKeyModal(false)}
          currentKey={getApiKey() || ''}
        />
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="bg-indigo-600 p-1.5 rounded-lg">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg text-slate-900">AutoForm AI</span>
            </div>
            <button
              onClick={() => setShowApiKeyModal(true)}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="API Key Einstellungen"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>
        <ReviewPanel 
          fields={responseData.fields} 
          summary={responseData.summary}
          formFile={formFile}
          sourceFile={sourceFile}
          isFillablePdf={pdfFields.length > 0}
          onReset={reset}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onSave={handleSaveApiKey}
        onClose={hasApiKey() ? () => setShowApiKeyModal(false) : undefined}
        currentKey={getApiKey() || ''}
      />
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-xl text-slate-900 tracking-tight">AutoForm AI</h1>
              <p className="text-xs text-slate-500 font-medium">Intelligent Document Processing</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-600">
              <span className="flex items-center"><ScanText className="w-4 h-4 mr-2" />1. Scan</span>
              <span className="flex items-center"><Sparkles className="w-4 h-4 mr-2" />2. Extract</span>
              <span className="flex items-center"><FileCheck2 className="w-4 h-4 mr-2" />3. Review</span>
            </div>
            <button
              onClick={() => setShowApiKeyModal(true)}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="API Key Einstellungen"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-12 flex flex-col justify-center">
        
        {status === AppStatus.IDLE || status === AppStatus.ERROR ? (
          <>
            <div className="text-center mb-12">
              <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
                Fill Forms Automatically with AI
              </h2>
              <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                Upload a blank PDF form and a source document. 
                We'll extract the data and fill the PDF fields for you.
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
               {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 m-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-red-700">
                        {error}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-8 p-8">
                {/* Step 1: Blank Form */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 border border-slate-300">1</div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900 text-lg">Target Form</h3>
                      {pdfFields.length > 0 && (
                        <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">
                          {pdfFields.length} fillable fields detected
                        </span>
                      )}
                    </div>
                  </div>
                  <FileUpload
                    label="Fillable PDF Form"
                    description="The empty PDF you want to fill."
                    accept="application/pdf,image/*"
                    onFileSelect={setFormFile}
                    selectedFile={formFile}
                  />
                </div>

                {/* Step 2: Source Data */}
                <div className="space-y-4">
                   <div className="flex items-center space-x-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 border border-slate-300">2</div>
                    <h3 className="font-bold text-slate-900 text-lg">Source Document</h3>
                  </div>
                  <FileUpload
                    label="Source Data"
                    description="Scan, Letter, ID, etc."
                    accept="image/*,application/pdf"
                    onFileSelect={setSourceFile}
                    selectedFile={sourceFile}
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-6 border-t border-slate-100 flex justify-end">
                <button
                  onClick={handleAnalyze}
                  disabled={!formFile || !sourceFile}
                  className={`
                    flex items-center px-6 py-3 rounded-xl font-bold text-white shadow-lg transition-all
                    ${(!formFile || !sourceFile) 
                      ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                      : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/30 transform hover:-translate-y-0.5'
                    }
                  `}
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Analyze & Fill
                  <ArrowRight className="w-5 h-5 ml-2" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Processing State */
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
              <div className="relative bg-white p-6 rounded-2xl shadow-xl border border-indigo-100">
                 <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
              </div>
            </div>
            <h3 className="mt-8 text-2xl font-bold text-slate-900">Processing Documents...</h3>
            <p className="mt-2 text-slate-500 max-w-md text-center">
              AI is reading the source document and mapping data to your PDF form fields.
            </p>
            
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl">
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center space-x-3 opacity-50">
                <ScanText className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-medium">Parsing PDF</span>
              </div>
               <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center space-x-3 opacity-50 animate-pulse delay-75">
                <FileText className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-medium">Extracting Data</span>
              </div>
               <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center space-x-3 opacity-50 animate-pulse delay-150">
                <Check className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-medium">Filling Form</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
