import React, { useRef, useState } from 'react';
import { Upload, FileText, CheckCircle, X } from 'lucide-react';
import type { FileData } from '../types';

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
  selectedFile,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result as string;
      const base64Content = base64String.split(',')[1];
      onFileSelect({
        file,
        previewUrl: objectUrl,
        base64: base64Content,
        type: file.type as FileData['type'],
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
      <label className="block text-sm font-medium text-kng-text-secondary mb-2">
        {label}
      </label>

      {!selectedFile ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-kng-lg p-8 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-kng-accent bg-kng-surface'
              : 'border-kng-border hover:border-kng-accent hover:bg-kng-surface'
          }`}
        >
          <input
            type="file"
            ref={inputRef}
            className="hidden"
            accept={accept}
            onChange={handleChange}
          />
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="p-3 bg-kng-bg-elevated rounded-kng-full shadow-kng-sm">
              <Upload className="w-6 h-6 text-kng-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-kng-text">
                Klick oder Drag & Drop
              </p>
              <p className="text-xs text-kng-text-muted mt-1">{description}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative border border-kng-border bg-kng-surface rounded-kng-lg p-4 flex items-center space-x-4">
          <div className="w-12 h-12 bg-kng-bg-elevated rounded-kng-md shadow-kng-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
            {selectedFile.type === 'application/pdf' ? (
              <FileText className="w-6 h-6 text-kng-accent" />
            ) : (
              <img
                src={selectedFile.previewUrl!}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-kng-text truncate">
              {selectedFile.file.name}
            </p>
            <p className="text-xs text-kng-text-muted">
              {(selectedFile.file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-kng-success" />
            <button
              onClick={clearFile}
              className="p-1 hover:bg-kng-surface-hover rounded-kng-full transition-colors text-kng-text-muted hover:text-kng-error"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
