/**
 * LaTeX Form Generation Service
 *
 * This service communicates with the Python LaTeX backend to generate
 * filled PDF forms using LaTeX templates.
 */

import { ExtractedField } from '../types';

// Backend API URL - can be configured via environment variable
const API_BASE_URL = import.meta.env.VITE_LATEX_API_URL || 'http://localhost:5000';

export interface LatexGenerationResult {
  success: boolean;
  pdf?: string; // base64 encoded PDF
  mappedFields?: Record<string, string>;
  error?: string;
}

export interface TemplateInfo {
  name: string;
  fields: string[];
}

/**
 * Check if the LaTeX backend is available
 */
export const isLatexServiceAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Get list of available LaTeX templates
 */
export const getAvailableTemplates = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/templates`);
    if (!response.ok) {
      throw new Error('Failed to fetch templates');
    }
    const data = await response.json();
    return data.templates || [];
  } catch (error) {
    console.warn('Could not fetch templates:', error);
    return [];
  }
};

/**
 * Get field mapping for a specific template
 */
export const getTemplateFieldMapping = async (templateName: string): Promise<Record<string, string[]> | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/field-mapping/${templateName}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.mapping || null;
  } catch (error) {
    console.warn('Could not fetch field mapping:', error);
    return null;
  }
};

/**
 * Generate a filled PDF using LaTeX template
 */
export const generateLatexPdf = async (
  templateName: string,
  fields: ExtractedField[]
): Promise<LatexGenerationResult> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template: templateName,
        fields: fields.map(f => ({
          label: f.label,
          value: f.value,
          key: f.key,
        })),
        format: 'base64',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      pdf: data.pdf,
      mappedFields: data.mapped_fields,
    };
  } catch (error) {
    console.error('LaTeX PDF generation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Preview the filled LaTeX source (for debugging)
 */
export const previewLatexSource = async (
  templateName: string,
  fields: ExtractedField[]
): Promise<{ latex?: string; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template: templateName,
        fields: fields.map(f => ({
          label: f.label,
          value: f.value,
          key: f.key,
        })),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return { latex: data.latex };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

/**
 * Convert base64 PDF to Blob URL for preview/download
 */
export const base64ToBlob = (base64: string, mimeType: string = 'application/pdf'): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

/**
 * Detect which template to use based on form file name or content
 */
export const detectTemplate = (fileName: string): string | null => {
  const lowerName = fileName.toLowerCase();

  // G2210-11 Ärztlicher Befundbericht
  if (lowerName.includes('g2210') ||
      lowerName.includes('befundbericht') ||
      lowerName.includes('aerztlicher') ||
      lowerName.includes('ärztlicher')) {
    return 'G2210-11';
  }

  // Add more template detection patterns here
  // if (lowerName.includes('s0051')) return 'S0051';

  return null;
};

/**
 * Get expected fields for a known form type
 * This helps the AI extraction know what fields to look for
 */
export const getExpectedFields = (templateName: string): string[] => {
  const fieldMappings: Record<string, string[]> = {
    'G2210-11': [
      'Versicherungsnummer',
      'ABT.-Nr.',
      'Name, Vorname',
      'Geburtsdatum',
      'Geschlecht',
      'Straße, Hausnummer',
      'PLZ',
      'Ort',
      'Telefon',
      'Krankenkasse',
      'Derzeitige Tätigkeit',
      'Arbeitgeber',
      'Arbeitsunfähig seit',
      'Diagnose 1',
      'Diagnose 1 ICD',
      'Diagnose 2',
      'Diagnose 2 ICD',
      'Diagnose 3',
      'Diagnose 3 ICD',
      'Diagnose 4',
      'Diagnose 4 ICD',
      'Diagnose 5',
      'Diagnose 5 ICD',
      'Diagnose 6',
      'Diagnose 6 ICD',
      'Anamnese/Beschwerden',
      'Krankheitsverlauf',
      'Körperlicher Befund',
      'Mobilität (keine/gering/erheblich)',
      'Selbstversorgung (keine/gering/erheblich)',
      'Haushaltsführung (keine/gering/erheblich)',
      'Erwerbstätigkeit (keine/gering/erheblich)',
      'Medikament 1',
      'Medikament 1 Dosis',
      'Medikament 2',
      'Medikament 2 Dosis',
      'Medikament 3',
      'Medikament 3 Dosis',
      'Physikalische Therapie',
      'Frühere Reha Zeitraum',
      'Frühere Reha Einrichtung',
      'Leistungsvermögen',
      'Rehabilitationsbedürftigkeit',
      'Rehabilitationsziel',
      'Rehabilitationsform (stationär/ambulant)',
      'Reisefähig (ja/nein)',
      'Begleitperson erforderlich (ja/nein)',
      'Ergänzende Angaben',
      'Arzt Name',
      'Facharztbezeichnung',
      'Praxis Anschrift',
      'Praxis Telefon',
      'BSNR',
      'LANR',
    ],
  };

  return fieldMappings[templateName] || [];
};
