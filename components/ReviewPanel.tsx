import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ExtractedField, FileData } from '../types';
import { Check, Edit2, Download, RefreshCw, FileText, AlertTriangle, XCircle, ArrowRight, PenTool, CheckCircle2, Circle, LayoutTemplate, List, Move } from 'lucide-react';
import { createFilledPdf } from '../services/pdfService';
import { jsPDF } from "jspdf";

interface ReviewPanelProps {
  fields: ExtractedField[];
  formFile: FileData;
  sourceFile: FileData;
  summary: string;
  isFillablePdf: boolean;
  onReset: () => void;
}

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
  const [viewMode, setViewMode] = useState<'LIST' | 'FORM'>('LIST');

  // Dragging state
  const [draggingField, setDraggingField] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derived state for progress
  const verifiedCount = fields.filter(f => f.isVerified).length;
  const totalCount = fields.length;
  const progressPercent = Math.round((verifiedCount / totalCount) * 100);
  
  const fieldsRequiresAttention = useMemo(() => 
    fields.filter(f => f.validation?.status !== 'VALID'), 
  [fields]);

  // Generate preview for PDF download
  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const generatePreview = async () => {
      if (formFile.type === 'application/pdf') {
        try {
          const filledPdfBytes = await createFilledPdf(formFile.base64, fields, isFillablePdf);
          if (!active) return;
          
          const blob = new Blob([filledPdfBytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          
          setPreviewUrl(prev => {
            if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
            return url;
          });
        } catch (e) {
          console.error("Failed to generate PDF preview", e);
        }
      } else {
        setPreviewUrl(formFile.previewUrl);
      }
    };

    // Debounce to avoid excessive PDF generation
    timeoutId = setTimeout(generatePreview, 600);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [fields, isFillablePdf, formFile]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      setPreviewUrl(prev => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

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

  const handleCoordinateUpdate = (index: number, x: number, y: number) => {
    const newFields = [...fields];
    if (newFields[index].coordinates) {
      newFields[index] = {
        ...newFields[index],
        coordinates: { ...newFields[index].coordinates!, x, y },
        isVerified: true // Moving it implies verification
      };
      setFields(newFields);
    }
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

  // Drag handlers
  const handleDragStart = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setDraggingField(index);
    setActiveField(index);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingField !== null && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const relativeY = e.clientY - rect.top;

      // Convert pixels to 0-1000 scale
      const scaleX = (relativeX / rect.width) * 1000;
      const scaleY = (relativeY / rect.height) * 1000;

      // Clamp values
      const clampedX = Math.max(0, Math.min(1000, scaleX));
      const clampedY = Math.max(0, Math.min(1000, scaleY));

      handleCoordinateUpdate(draggingField, clampedX, clampedY);
    }
  };

  const handleMouseUp = () => {
    setDraggingField(null);
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
          {/* View Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('LIST')}
              className={`p-1.5 rounded-md flex items-center space-x-2 text-sm font-medium transition-all ${viewMode === 'LIST' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              title="List View"
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => setViewMode('FORM')}
              className={`p-1.5 rounded-md flex items-center space-x-2 text-sm font-medium transition-all ${viewMode === 'FORM' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              title="Form Overlay View"
            >
              <LayoutTemplate className="w-4 h-4" />
              <span className="hidden sm:inline">Form View</span>
            </button>
          </div>

          <div className="h-6 w-px bg-slate-300 mx-2 hidden md:block"></div>

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
            className={`flex items-center px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-sm bg-indigo-600 hover:bg-indigo-700`}
          >
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </button>
        </div>
      </div>

      {viewMode === 'LIST' ? (
        /* ================= LIST VIEW ================= */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
          {/* Left Column: Preview */}
          <div className="bg-slate-900 rounded-xl overflow-hidden shadow-lg flex flex-col">
            <div className="p-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
               <div className="flex items-center space-x-2">
                 <span className="text-xs font-medium text-slate-300 uppercase tracking-wider">PDF Preview</span>
               </div>
               <span className="text-xs text-slate-400">{formFile.file.name}</span>
            </div>
            <div className="flex-1 bg-slate-900 relative">
               {previewUrl ? (
                  formFile.type === 'application/pdf' ? (
                    <object 
                      data={previewUrl}
                      type="application/pdf"
                      className="w-full h-full block"
                      aria-label="PDF Preview"
                    >
                        <div className="flex flex-col items-center justify-center h-full text-white/70">
                            <p>Unable to display PDF directly.</p>
                            <a href={previewUrl} download className="text-indigo-400 underline mt-2">Download to view</a>
                        </div>
                    </object>
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
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-slate-800">Field Verification</h3>
                <div className="flex space-x-2 text-xs">
                  <button 
                    onClick={() => setFilterMode('ALL')}
                    className={`px-3 py-1 rounded-full border transition-colors ${filterMode === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                  >
                    All ({totalCount})
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
            </div>
            
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
                    className={`relative group rounded-lg border transition-all duration-200 p-3 shadow-sm ${activeField === idx ? 'ring-1 ring-indigo-500 border-indigo-500 shadow-md z-10' : statusBorder} ${statusBg}`}
                    onFocus={() => setActiveField(idx)}
                    onBlur={() => setActiveField(null)}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => toggleVerify(idx)}
                        className={`mt-1 flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${isVerified ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300 text-transparent hover:border-emerald-400'}`}
                        title={isVerified ? "Mark as unverified" : "Mark as verified"}
                      >
                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <label className={`text-xs font-semibold uppercase tracking-wider truncate ${isVerified ? 'text-emerald-700' : 'text-slate-600'}`}>
                            {field.label || field.key || "Unknown Field"}
                          </label>
                          {!isVerified && status !== 'VALID' && (
                            <span className={`flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ${status === 'INVALID' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                               {status === 'INVALID' ? <XCircle className="w-3 h-3 mr-1"/> : <AlertTriangle className="w-3 h-3 mr-1"/>}
                               {status}
                            </span>
                          )}
                        </div>

                        <div className="relative">
                          <input
                            type="text"
                            value={field.value}
                            onChange={(e) => handleUpdate(idx, e.target.value)}
                            className={`block w-full rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors border ${isVerified ? 'border-emerald-200 text-emerald-900 bg-emerald-50/50' : 'border-slate-300 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'}`}
                            placeholder="Empty"
                          />
                        </div>
                        {(!isVerified && field.validation?.suggestion && status !== 'VALID') && (
                          <button 
                            onClick={() => applySuggestion(idx)}
                            className="mt-2 flex items-center text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                          >
                            <ArrowRight className="w-3 h-3 mr-1" />
                            Accept: "{field.validation.suggestion}"
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
      ) : (
        /* ================= FORM VIEW (Overlay with Drag & Drop) ================= */
        <div className="bg-slate-200 rounded-xl overflow-auto shadow-inner flex-1 border border-slate-300 relative p-8 flex justify-center">
            
            <div 
              ref={containerRef}
              className="relative bg-white shadow-2xl transition-cursor" 
              style={{ 
                width: '794px', 
                minHeight: '1123px',
                cursor: draggingField !== null ? 'grabbing' : 'default'
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            > 
                {/* Background Image/PDF */}
                {formFile.previewUrl && (
                  <img 
                    src={formFile.previewUrl} 
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-90 select-none"
                    alt="Form Background"
                  />
                )}
                
                {/* Fallback info if not visual mode compatible */}
                {!fields.some(f => f.coordinates) && (
                   <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20 backdrop-blur-sm">
                      <div className="text-center p-6 max-w-md">
                        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-slate-900">Visual Mode Not Available</h3>
                        <p className="text-slate-600 mt-2">
                          Coordinates were not extracted for this document. Please use the List View to edit fields.
                        </p>
                        <button 
                          onClick={() => setViewMode('LIST')}
                          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                        >
                          Switch to List View
                        </button>
                      </div>
                   </div>
                )}

                {/* Overlay Inputs */}
                {fields.map((field, idx) => {
                  if (!field.coordinates) return null;
                  
                  // Coordinate conversion (0-1000 scale to percentage)
                  const left = (field.coordinates.x / 1000) * 100;
                  const top = (field.coordinates.y / 1000) * 100;
                  
                  const status = field.validation?.status || 'VALID';
                  let borderColor = 'border-indigo-400 bg-white/60';
                  if (field.isVerified) borderColor = 'border-emerald-500 bg-emerald-50/70';
                  else if (status === 'INVALID') borderColor = 'border-red-500 bg-red-50/70';
                  else if (status === 'WARNING') borderColor = 'border-amber-500 bg-amber-50/70';

                  const isDragging = draggingField === idx;
                  const isCheckbox = field.value === 'X';

                  return (
                    <div
                      key={idx}
                      className={`absolute group hover:z-50 ${isDragging ? 'z-50 cursor-grabbing' : 'z-10'}`}
                      style={{
                        left: `${left}%`,
                        top: `${top}%`,
                        width: isCheckbox ? '20px' : '200px',
                        transform: 'translateY(-50%)', // Center vertically
                      }}
                      onMouseDown={(e) => handleDragStart(e, idx)}
                    >
                      <div className="relative">
                        {/* Drag Handle (Visible on Hover) */}
                        <div className={`absolute -top-3 -left-3 cursor-grab p-1 bg-slate-800 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${isDragging ? 'opacity-100' : ''}`}>
                          <Move className="w-3 h-3" />
                        </div>

                        {isCheckbox ? (
                          <div className={`w-6 h-6 border-2 flex items-center justify-center font-bold text-black ${borderColor}`}>
                             X
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={field.value}
                            onChange={(e) => handleUpdate(idx, e.target.value)}
                            onFocus={() => setActiveField(idx)}
                            className={`
                              w-full px-1 py-0.5 text-xs font-medium border-2 rounded transition-all shadow-sm
                              focus:ring-2 focus:ring-offset-1 focus:z-10 focus:bg-white
                              ${borderColor}
                            `}
                            style={{
                              fontFamily: 'Courier, monospace',
                              color: 'black',
                              background: 'rgba(255, 255, 255, 0.7)'
                            }}
                          />
                        )}
                        
                        {/* Validation Icon Overlay */}
                        {!field.isVerified && status !== 'VALID' && (
                           <div className="absolute -top-2 -right-2 bg-white rounded-full shadow-md z-20 pointer-events-none">
                              {status === 'INVALID' 
                                ? <XCircle className="w-4 h-4 text-red-500" /> 
                                : <AlertTriangle className="w-4 h-4 text-amber-500" />
                              }
                           </div>
                        )}
                        
                        {/* Tooltip on Hover */}
                        <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-0 mb-1 bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap pointer-events-none z-30 transition-opacity">
                           {field.label}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
        </div>
      )}
    </div>
  );
};
