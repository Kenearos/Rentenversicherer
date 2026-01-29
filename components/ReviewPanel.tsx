import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ExtractedField, FileData } from '../types';
import { Check, Edit2, Download, RefreshCw, FileText, AlertTriangle, XCircle, ArrowRight, PenTool, CheckCircle2, Circle, FileCode, Loader2 } from 'lucide-react';
import { createFilledPdf } from '../services/pdfService';
import { generateLatexPdf, isLatexServiceAvailable, detectTemplate, base64ToBlob } from '../services/latexService';
import { jsPDF } from "jspdf";

interface ReviewPanelProps {
  fields: ExtractedField[];
  formFile: FileData;
  sourceFile: FileData;
  summary: string;
  isFillablePdf: boolean;
  onReset: () => void;
}

type PdfMode = 'overlay' | 'fillable' | 'latex';

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  fields: initialFields,
  formFile,
  sourceFile,
  summary,
  isFillablePdf,
  onReset
}) => {
  const [fields, setFields] = useState(initialFields);
  const [activeField, setActiveField] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'ALL' | 'ATTENTION'>('ALL');
  const [latexAvailable, setLatexAvailable] = useState<boolean | null>(null);
  const [pdfMode, setPdfMode] = useState<PdfMode>(isFillablePdf ? 'fillable' : 'overlay');
  const [isGenerating, setIsGenerating] = useState(false);
  const [latexPdfBase64, setLatexPdfBase64] = useState<string | null>(null);

  // Detect template from form file name
  const detectedTemplate = useMemo(() => detectTemplate(formFile.file.name), [formFile.file.name]);

  // Check LaTeX service availability on mount
  useEffect(() => {
    const checkLatex = async () => {
      const available = await isLatexServiceAvailable();
      setLatexAvailable(available);
      // Auto-switch to LaTeX mode if available and template detected
      if (available && detectedTemplate && !isFillablePdf) {
        setPdfMode('latex');
      }
    };
    checkLatex();
  }, [detectedTemplate, isFillablePdf]);

  // Derived state for progress
  const verifiedCount = fields.filter(f => f.isVerified).length;
  const totalCount = fields.length;
  const progressPercent = Math.round((verifiedCount / totalCount) * 100);
  
  const fieldsRequiresAttention = useMemo(() => 
    fields.filter(f => f.validation?.status !== 'VALID'), 
  [fields]);

  // Generate LaTeX PDF
  const generateLatexPreview = useCallback(async () => {
    if (!detectedTemplate || pdfMode !== 'latex') return;

    setIsGenerating(true);
    try {
      const result = await generateLatexPdf(detectedTemplate, fields);
      if (result.success && result.pdf) {
        setLatexPdfBase64(result.pdf);
        const blob = base64ToBlob(result.pdf);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      } else {
        console.error('LaTeX generation failed:', result.error);
        // Fallback to overlay mode
        setPdfMode('overlay');
      }
    } catch (e) {
      console.error('LaTeX generation error:', e);
      setPdfMode('overlay');
    } finally {
      setIsGenerating(false);
    }
  }, [detectedTemplate, fields, pdfMode]);

  // Generate preview
  useEffect(() => {
    const updatePreview = async () => {
      // LaTeX mode - handled separately with button click
      if (pdfMode === 'latex') {
        // Only auto-generate if we don't have a preview yet
        if (!latexPdfBase64) {
          generateLatexPreview();
        }
        return;
      }

      if (formFile.type === 'application/pdf') {
        try {
          const filledPdfBytes = await createFilledPdf(formFile.base64, fields, pdfMode === 'fillable');
          const blob = new Blob([filledPdfBytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          return () => URL.revokeObjectURL(url);
        } catch (e) {
          console.error("Failed to generate PDF preview", e);
        }
      } else {
        setPreviewUrl(formFile.previewUrl);
      }
    };

    // Debounce slightly to avoid rapid updates on typing
    const timer = setTimeout(updatePreview, 600);
    return () => clearTimeout(timer);
  }, [fields, pdfMode, formFile.base64, formFile.type, latexPdfBase64, generateLatexPreview]);

  const handleUpdate = (index: number, newValue: string) => {
    const newFields = [...fields];
    newFields[index] = { 
      ...newFields[index], 
      value: newValue,
      // Auto-verify when manually edited
      isVerified: true,
      validation: { ...newFields[index].validation!, status: 'VALID', message: 'Manually verified' }
    };
    setFields(newFields);
  };

  const toggleVerify = (index: number) => {
    const newFields = [...fields];
    newFields[index] = { 
      ...newFields[index], 
      isVerified: !newFields[index].isVerified 
    };
    setFields(newFields);
  };

  const applySuggestion = (index: number) => {
    const field = fields[index];
    if (field.validation?.suggestion) {
      handleUpdate(index, field.validation.suggestion);
    }
  };

  const handleDownload = async () => {
    // LaTeX mode - regenerate fresh PDF for download
    if (pdfMode === 'latex' && detectedTemplate) {
      setIsGenerating(true);
      try {
        const result = await generateLatexPdf(detectedTemplate, fields);
        if (result.success && result.pdf) {
          const blob = base64ToBlob(result.pdf);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${detectedTemplate}_filled.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          alert(`PDF generation failed: ${result.error}`);
        }
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    if (formFile.type === 'application/pdf' && previewUrl) {
      const a = document.createElement('a');
      a.href = previewUrl;
      a.download = `filled_${formFile.file.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
       const doc = new jsPDF();
       doc.text("Extracted Data", 20, 20);
       let y = 40;
       fields.forEach(f => {
         doc.text(`${f.label}: ${f.value}`, 20, y);
         y += 10;
       });
       doc.save("data_report.pdf");
    }
  };

  // Regenerate LaTeX preview
  const handleRegenerateLatex = () => {
    setLatexPdfBase64(null);
    generateLatexPreview();
  };

  // Sort: Unverified/Issues first, then verified
  const displayedFields = fields.map((f, i) => ({ ...f, originalIndex: i }))
    .sort((a, b) => {
      // Priority 1: Attention needed
      const aNeedsAttn = a.validation?.status !== 'VALID';
      const bNeedsAttn = b.validation?.status !== 'VALID';
      if (aNeedsAttn && !bNeedsAttn) return -1;
      if (!aNeedsAttn && bNeedsAttn) return 1;
      
      // Priority 2: Unverified
      if (!a.isVerified && b.isVerified) return -1;
      if (a.isVerified && !b.isVerified) return 1;
      
      return a.originalIndex - b.originalIndex;
    })
    .filter(f => filterMode === 'ALL' || (f.validation?.status !== 'VALID' && !f.isVerified));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 h-[calc(100vh-80px)] flex flex-col">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Review & Verify</h2>
          <p className="text-slate-500 text-sm mt-1">{summary}</p>
        </div>
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          {/* Verification Progress */}
          <div className="hidden md:flex flex-col items-end mr-2">
            <span className="text-xs font-semibold text-slate-600 mb-1">
              {verifiedCount} / {totalCount} Verified
            </span>
            <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <button 
            onClick={onReset}
            className="flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Start Over
          </button>
          
          <button
            onClick={handleDownload}
            disabled={isGenerating}
            className={`flex items-center px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-sm ${isGenerating ? 'bg-indigo-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Download PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
        {/* Left Column: Visual Reference */}
        <div className="bg-slate-900 rounded-xl overflow-hidden shadow-lg flex flex-col">
          <div className="p-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
             <div className="flex items-center space-x-2">
               <span className="text-xs font-medium text-slate-300 uppercase tracking-wider">Preview</span>
               {pdfMode === 'latex' && (
                 <span className="flex items-center text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30">
                   <FileCode className="w-3 h-3 mr-1" />
                   LaTeX Template Mode
                 </span>
               )}
               {pdfMode === 'overlay' && (
                 <span className="flex items-center text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                   <PenTool className="w-3 h-3 mr-1" />
                   Visual Overlay Mode
                 </span>
               )}
               {pdfMode === 'fillable' && (
                 <span className="flex items-center text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30">
                   <FileText className="w-3 h-3 mr-1" />
                   Fillable PDF Mode
                 </span>
               )}
             </div>
             <div className="flex items-center space-x-2">
               {/* Mode Switcher */}
               {latexAvailable && detectedTemplate && (
                 <button
                   onClick={() => {
                     const newMode = pdfMode === 'latex' ? 'overlay' : 'latex';
                     setPdfMode(newMode);
                     if (newMode === 'latex') {
                       setLatexPdfBase64(null);
                     }
                   }}
                   className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded transition-colors"
                 >
                   {pdfMode === 'latex' ? 'Use Overlay' : 'Use LaTeX'}
                 </button>
               )}
               {pdfMode === 'latex' && (
                 <button
                   onClick={handleRegenerateLatex}
                   disabled={isGenerating}
                   className="text-[10px] bg-emerald-700 hover:bg-emerald-600 text-emerald-100 px-2 py-1 rounded transition-colors disabled:opacity-50"
                 >
                   {isGenerating ? 'Generating...' : 'Regenerate'}
                 </button>
               )}
               <span className="text-xs text-slate-400">{formFile.file.name}</span>
             </div>
          </div>
          <div className="flex-1 bg-slate-900 relative">
             {isGenerating && pdfMode === 'latex' ? (
                <div className="flex flex-col items-center justify-center h-full text-emerald-400">
                  <Loader2 className="w-16 h-16 mb-4 animate-spin" />
                  <p className="font-medium">Generating LaTeX PDF...</p>
                  <p className="text-sm text-slate-500 mt-1">Compiling template with your data</p>
                </div>
             ) : previewUrl ? (
                formFile.type === 'application/pdf' || pdfMode === 'latex' ? (
                  <iframe
                    src={previewUrl}
                    title="Form PDF Preview"
                    className="w-full h-full border-none"
                  />
                ) : (
                  <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
                    <img
                      src={previewUrl}
                      alt="Form Document"
                      className="max-w-full shadow-lg border border-slate-700"
                    />
                  </div>
                )
             ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <FileText className="w-16 h-16 mb-4 opacity-50" />
                  <p>Preview not available</p>
                </div>
             )}
          </div>
        </div>

        {/* Right Column: Verification List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          {/* List Header */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-slate-800">Field Verification</h3>
              <div className="flex space-x-2 text-xs">
                <button 
                  onClick={() => setFilterMode('ALL')}
                  className={`px-3 py-1 rounded-full border transition-colors ${filterMode === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  All Fields ({totalCount})
                </button>
                {fieldsRequiresAttention.length > 0 && (
                   <button 
                    onClick={() => setFilterMode('ATTENTION')}
                    className={`px-3 py-1 rounded-full border transition-colors flex items-center ${filterMode === 'ATTENTION' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-white text-amber-600 border-slate-200 hover:bg-amber-50'}`}
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Needs Review ({fieldsRequiresAttention.length})
                  </button>
                )}
              </div>
            </div>
            
             {pdfMode === 'latex' && detectedTemplate && (
                <div className="flex items-start space-x-2 bg-emerald-50 text-emerald-800 p-3 rounded-md border border-emerald-100 text-xs">
                   <FileCode className="w-4 h-4 flex-shrink-0 text-emerald-600 mt-0.5" />
                   <div>
                     <p className="font-semibold">LaTeX Template Mode: {detectedTemplate}</p>
                     <p>Using precise LaTeX template. All fields will be positioned correctly in the generated PDF.</p>
                   </div>
                </div>
             )}
             {pdfMode === 'overlay' && (
                <div className="flex items-start space-x-2 bg-indigo-50 text-indigo-800 p-3 rounded-md border border-indigo-100 text-xs">
                   <PenTool className="w-4 h-4 flex-shrink-0 text-indigo-600 mt-0.5" />
                   <div>
                     <p className="font-semibold">Visual Overlay Mode</p>
                     <p>AI is visually estimating field positions. Please verify text alignment in the preview.</p>
                     {latexAvailable && detectedTemplate && (
                       <p className="mt-1 text-emerald-700 font-medium">Tip: LaTeX template available! Click "Use LaTeX" for better results.</p>
                     )}
                   </div>
                </div>
             )}
          </div>
          
          {/* Fields List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
            {displayedFields.map((field) => {
              const idx = field.originalIndex;
              const status = field.validation?.status || 'VALID';
              const isVerified = field.isVerified;
              
              let statusBorder = isVerified ? "border-emerald-200" : "border-slate-200";
              let statusBg = isVerified ? "bg-emerald-50/30" : "bg-white";

              if (!isVerified) {
                if (status === 'INVALID') {
                  statusBorder = "border-red-200";
                  statusBg = "bg-red-50/50";
                } else if (status === 'WARNING') {
                  statusBorder = "border-amber-200";
                  statusBg = "bg-amber-50/50";
                }
              }

              return (
                <div 
                  key={idx} 
                  className={`
                    relative group rounded-lg border transition-all duration-200 p-3 shadow-sm
                    ${activeField === idx ? 'ring-1 ring-indigo-500 border-indigo-500 shadow-md z-10' : statusBorder}
                    ${statusBg}
                  `}
                  onFocus={() => setActiveField(idx)}
                  onBlur={() => setActiveField(null)}
                >
                  <div className="flex items-start gap-3">
                    {/* Verification Checkbox */}
                    <button
                      onClick={() => toggleVerify(idx)}
                      className={`
                        mt-1 flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors
                        ${isVerified 
                          ? 'bg-emerald-500 border-emerald-500 text-white' 
                          : 'bg-white border-slate-300 text-transparent hover:border-emerald-400'
                        }
                      `}
                      title={isVerified ? "Mark as unverified" : "Mark as verified"}
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <label className={`text-xs font-semibold uppercase tracking-wider truncate ${isVerified ? 'text-emerald-700' : 'text-slate-600'}`}>
                          {field.label || field.key || "Unknown Field"}
                        </label>
                        
                        {/* Status Badge */}
                        {!isVerified && status !== 'VALID' && (
                          <span className={`flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ${status === 'INVALID' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                             {status === 'INVALID' ? <XCircle className="w-3 h-3 mr-1"/> : <AlertTriangle className="w-3 h-3 mr-1"/>}
                             {status}
                          </span>
                        )}
                        {isVerified && (
                          <span className="flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                             <CheckCircle2 className="w-3 h-3 mr-1"/>
                             VERIFIED
                          </span>
                        )}
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          value={field.value}
                          onChange={(e) => handleUpdate(idx, e.target.value)}
                          className={`
                            block w-full rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors border
                            ${isVerified 
                              ? 'border-emerald-200 text-emerald-900 bg-emerald-50/50' 
                              : 'border-slate-300 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                            }
                          `}
                          placeholder="Empty"
                        />
                        {!isVerified && (
                          <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-slate-400">
                            <Edit2 className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </div>

                      {/* Error/Warning Message */}
                      {(!isVerified && status !== 'VALID' && field.validation?.message) && (
                        <p className={`mt-1.5 text-xs ${status === 'INVALID' ? 'text-red-600' : 'text-amber-600'}`}>
                          {field.validation.message}
                        </p>
                      )}

                      {/* Auto-Fix Button */}
                      {(!isVerified && field.validation?.suggestion && status !== 'VALID') && (
                        <button 
                          onClick={() => applySuggestion(idx)}
                          className="mt-2 flex items-center text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors w-full sm:w-auto"
                        >
                          <ArrowRight className="w-3 h-3 mr-1" />
                          Accept Fix: "{field.validation.suggestion}"
                        </button>
                      )}
                      
                      {/* Source Context Snippet */}
                      {!isVerified && field.sourceContext && (
                        <div className="mt-2 p-2 bg-slate-100 rounded text-[11px] text-slate-500 border border-slate-200">
                          <span className="font-semibold text-slate-700">Source:</span> "{field.sourceContext}"
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {displayedFields.length === 0 && (
               <div className="text-center py-10 text-slate-400">
                 <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-20" />
                 <p>All fields verified!</p>
               </div>
            )}
          </div>
          
          {/* Verification Footer */}
          <div className="p-4 border-t border-slate-200 bg-white">
             <div className="flex justify-between items-center text-xs font-medium text-slate-500">
                <span>{verifiedCount} of {totalCount} fields verified</span>
                {progressPercent === 100 ? (
                  <span className="text-emerald-600 font-bold flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-1"/> Ready to Download
                  </span>
                ) : (
                  <span className="text-amber-600 flex items-center">
                    <Circle className="w-4 h-4 mr-1 fill-amber-100"/> Review in progress
                  </span>
                )}
             </div>
             {/* Mobile Progress Bar */}
             <div className="md:hidden mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPercent}%` }} />
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
