export interface ValidationResult {
  status: 'VALID' | 'WARNING' | 'INVALID';
  message?: string;
  suggestion?: string;
}

export interface ExtractedField {
  key?: string; // The PDF field name (internal ID)
  label: string; // Human readable label
  value: string;
  confidence?: string;
  sourceContext?: string;
  validation?: ValidationResult;
  isVerified?: boolean; // Track if user has explicitly checked this field
  coordinates?: {
    pageIndex: number;
    x: number; // 0-1000 scale
    y: number; // 0-1000 scale
  };
}

export interface FormResponse {
  fields: ExtractedField[];
  summary: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  REVIEW = 'REVIEW',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface FileData {
  file: File;
  previewUrl: string | null;
  base64: string;
  type: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';
}
