import React, { useRef, useState } from 'react';
import { Upload, FileText, X, Image as ImageIcon } from 'lucide-react';
import type { FileData } from '../types';

interface SourceInputProps {
  files: FileData[];
  text: string;
  onFilesChange: (files: FileData[]) => void;
  onTextChange: (text: string) => void;
}

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';

function readFile(file: File): Promise<FileData> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve({
        file,
        previewUrl: objectUrl,
        base64,
        type: file.type as FileData['type'],
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const SourceInput: React.FC<SourceInputProps> = ({
  files,
  text,
  onFilesChange,
  onTextChange,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleIncoming = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const incoming: FileData[] = [];
    for (const f of Array.from(fileList)) {
      if (!ACCEPT.split(',').includes(f.type)) continue;
      incoming.push(await readFile(f));
    }
    onFilesChange([...files, ...incoming]);
  };

  const removeAt = (index: number) => {
    const removed = files[index];
    if (removed.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(removed.previewUrl);
    }
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          void handleIncoming(e.dataTransfer.files);
        }}
        className={`relative border-2 border-dashed rounded-kng-lg p-6 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-kng-accent bg-kng-surface'
            : 'border-kng-border hover:border-kng-accent hover:bg-kng-surface'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={ACCEPT}
          onChange={(e) => void handleIncoming(e.target.files)}
        />
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="p-2 bg-kng-bg-elevated rounded-kng-full shadow-kng-sm">
            <Upload className="w-5 h-5 text-kng-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-kng-text">
              Dateien hinzufügen (Klick oder Drop)
            </p>
            <p className="text-xs text-kng-text-muted mt-1">
              Scans, Briefe, Ausweise — PDF oder Bild. Mehrere möglich.
            </p>
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, idx) => (
            <li
              key={idx}
              className="flex items-center gap-3 border border-kng-border bg-kng-surface rounded-kng-md px-3 py-2"
            >
              <div className="w-8 h-8 bg-kng-bg-elevated rounded-kng-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
                {f.type === 'application/pdf' ? (
                  <FileText className="w-4 h-4 text-kng-text-secondary" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-kng-text-secondary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-kng-text truncate">
                  {f.file.name}
                </p>
                <p className="text-xs text-kng-text-muted">
                  {(f.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={() => removeAt(idx)}
                className="p-1 hover:bg-kng-surface-hover rounded-kng-full transition-colors text-kng-text-muted hover:text-kng-error"
                aria-label="Entfernen"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-kng-text-secondary mb-1">
          Zusätzlicher Text (optional)
        </label>
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={4}
          placeholder="Notizen, E-Mail-Text, Werte die nicht in den Dokumenten stehen …"
          className="block w-full rounded-kng-md border border-kng-border bg-kng-surface px-3 py-2 text-sm text-kng-text placeholder-kng-text-muted focus:border-kng-accent focus:outline-none focus:ring-1 focus:ring-kng-accent resize-y"
        />
      </div>
    </div>
  );
};
