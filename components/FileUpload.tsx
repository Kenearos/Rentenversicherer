import React, { useRef, useState } from 'react';
import { Upload, FileText, CheckCircle, X, Image as ImageIcon } from 'lucide-react';
import { FileData } from '../types';

interface FileUploadProps {
  label: string;
  description: string;
  accept: string;
  onFileSelect: (data: FileData | null) => void;
  selectedFile: FileData | null;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  label,
  description,
  accept,
  onFileSelect,
  selectedFile
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File) => {
    // Create a robust Blob URL for previewing (works better than Base64 for PDFs)
    const objectUrl = URL.createObjectURL(file);

    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result as string;
      // Remove data URL prefix for API usage
      const base64Content = base64String.split(',')[1];
      
      onFileSelect({
        file,
        previewUrl: objectUrl,
        base64: base64Content,
        type: file.type as any
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
      
      {!selectedFile ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
            ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'}
          `}
        >
          <input
            type="file"
            ref={inputRef}
            className="hidden"
            accept={accept}
            onChange={handleChange}
          />
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="p-3 bg-white rounded-full shadow-sm">
              <Upload className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Click to upload or drag and drop</p>
              <p className="text-xs text-slate-500 mt-1">{description}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative border border-indigo-100 bg-indigo-50/50 rounded-xl p-4 flex items-center space-x-4">
          <div className="w-12 h-12 bg-white rounded-lg shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
            {selectedFile.type === 'application/pdf' ? (
              <FileText className="w-6 h-6 text-indigo-600" />
            ) : (
              <img src={selectedFile.previewUrl!} alt="Preview" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              {selectedFile.file.name}
            </p>
            <p className="text-xs text-slate-500">
              {(selectedFile.file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            <button 
              onClick={clearFile}
              className="p-1 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-red-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
