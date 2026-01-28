import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileData, FormResponse } from '../../types';
import { PdfFieldInfo } from '../../services/pdfService';

// Create a mock function that can be referenced in the mock
const mockGenerateContent = vi.fn();

// Mock the @google/genai module
vi.mock('@google/genai', async () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent
      }
    })),
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      ARRAY: 'ARRAY',
      INTEGER: 'INTEGER'
    },
    Schema: {}
  };
});

// Import after mocking
const { processDocuments } = await import('../../services/geminiService');

describe('geminiService', () => {
  const mockBlankForm: FileData = {
    file: new File([''], 'form.pdf', { type: 'application/pdf' }),
    previewUrl: null,
    base64: 'base64FormContent',
    type: 'application/pdf'
  };

  const mockSourceDocument: FileData = {
    file: new File([''], 'source.pdf', { type: 'application/pdf' }),
    previewUrl: null,
    base64: 'base64SourceContent',
    type: 'application/pdf'
  };

  const mockPdfFields: PdfFieldInfo[] = [
    { name: 'firstName', type: 'PDFTextField' },
    { name: 'lastName', type: 'PDFTextField' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('processDocuments', () => {
    it('should successfully process documents and return FormResponse', async () => {
      const mockResponse: FormResponse = {
        summary: 'Processed medical letter',
        fields: [
          {
            key: 'firstName',
            label: 'First Name',
            value: 'John',
            validation: { status: 'VALID' }
          },
          {
            key: 'lastName',
            label: 'Last Name',
            value: 'Doe',
            validation: { status: 'VALID' }
          }
        ]
      };

      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify(mockResponse)
      });

      const result = await processDocuments(mockBlankForm, mockSourceDocument, mockPdfFields);

      expect(result).toEqual(mockResponse);
      expect(mockGenerateContent).toHaveBeenCalledOnce();
    });

    it('should include field names in prompt when pdfFields are provided', async () => {
      const mockResponse: FormResponse = {
        summary: 'Test',
        fields: []
      };

      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify(mockResponse)
      });

      await processDocuments(mockBlankForm, mockSourceDocument, mockPdfFields);

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.config.systemInstruction).toContain('FILLABLE PDF');
      expect(callArgs.config.systemInstruction).toContain('firstName');
      expect(callArgs.config.systemInstruction).toContain('lastName');
    });

    it('should use visual mode when no pdfFields are provided', async () => {
      const mockResponse: FormResponse = {
        summary: 'Test',
        fields: []
      };

      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify(mockResponse)
      });

      await processDocuments(mockBlankForm, mockSourceDocument, []);

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.config.systemInstruction).toContain('VISUAL FILLING');
      expect(callArgs.config.systemInstruction).toContain('0 to 1000');
    });

    it('should throw error when API returns no response', async () => {
      mockGenerateContent.mockResolvedValue({
        text: null
      });

      await expect(
        processDocuments(mockBlankForm, mockSourceDocument, mockPdfFields)
      ).rejects.toThrow('No response from Gemini');
    });

    it('should throw error when API returns empty string', async () => {
      mockGenerateContent.mockResolvedValue({
        text: ''
      });

      await expect(
        processDocuments(mockBlankForm, mockSourceDocument, mockPdfFields)
      ).rejects.toThrow();
    });

    it('should throw error on API failure', async () => {
      const apiError = new Error('API rate limit exceeded');
      mockGenerateContent.mockRejectedValue(apiError);

      await expect(
        processDocuments(mockBlankForm, mockSourceDocument, mockPdfFields)
      ).rejects.toThrow('API rate limit exceeded');
    });

    it('should throw error on invalid JSON response', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'not valid json'
      });

      await expect(
        processDocuments(mockBlankForm, mockSourceDocument, mockPdfFields)
      ).rejects.toThrow();
    });

    it('should handle fields with validation warnings', async () => {
      const mockResponse: FormResponse = {
        summary: 'Processed with warnings',
        fields: [
          {
            key: 'date',
            label: 'Date',
            value: '28-01-2025',
            validation: {
              status: 'WARNING',
              message: 'Date format might be incorrect',
              suggestion: '28.01.2025'
            }
          }
        ]
      };

      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify(mockResponse)
      });

      const result = await processDocuments(mockBlankForm, mockSourceDocument, mockPdfFields);

      expect(result.fields[0].validation?.status).toBe('WARNING');
      expect(result.fields[0].validation?.suggestion).toBe('28.01.2025');
    });

    it('should handle fields with validation errors', async () => {
      const mockResponse: FormResponse = {
        summary: 'Processed with errors',
        fields: [
          {
            key: 'required_field',
            label: 'Required Field',
            value: '',
            validation: {
              status: 'INVALID',
              message: 'This field is required but was not found in source'
            }
          }
        ]
      };

      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify(mockResponse)
      });

      const result = await processDocuments(mockBlankForm, mockSourceDocument, mockPdfFields);

      expect(result.fields[0].validation?.status).toBe('INVALID');
    });

    it('should handle visual mode with coordinates', async () => {
      const mockResponse: FormResponse = {
        summary: 'Visual mode response',
        fields: [
          {
            label: 'Name',
            value: 'John Doe',
            validation: { status: 'VALID' },
            coordinates: {
              pageIndex: 0,
              x: 150,
              y: 200
            }
          }
        ]
      };

      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify(mockResponse)
      });

      const result = await processDocuments(mockBlankForm, mockSourceDocument, []);

      expect(result.fields[0].coordinates).toEqual({
        pageIndex: 0,
        x: 150,
        y: 200
      });
    });

    it('should include sourceContext in response', async () => {
      const mockResponse: FormResponse = {
        summary: 'Test',
        fields: [
          {
            key: 'name',
            label: 'Name',
            value: 'John Doe',
            sourceContext: 'Patient: John Doe, DOB: 01.01.1990',
            validation: { status: 'VALID' }
          }
        ]
      };

      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify(mockResponse)
      });

      const result = await processDocuments(mockBlankForm, mockSourceDocument, mockPdfFields);

      expect(result.fields[0].sourceContext).toBe('Patient: John Doe, DOB: 01.01.1990');
    });

    it('should pass correct MIME types in request', async () => {
      const mockResponse: FormResponse = {
        summary: 'Test',
        fields: []
      };

      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify(mockResponse)
      });

      const imageSource: FileData = {
        ...mockSourceDocument,
        type: 'image/png'
      };

      await processDocuments(mockBlankForm, imageSource, []);

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.contents.parts[0].inlineData.mimeType).toBe('application/pdf');
      expect(callArgs.contents.parts[2].inlineData.mimeType).toBe('image/png');
    });

    it('should handle network timeout', async () => {
      mockGenerateContent.mockRejectedValue(new Error('Network timeout'));

      await expect(
        processDocuments(mockBlankForm, mockSourceDocument, mockPdfFields)
      ).rejects.toThrow('Network timeout');
    });

    it('should handle empty fields array response', async () => {
      const mockResponse: FormResponse = {
        summary: 'No fields found',
        fields: []
      };

      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify(mockResponse)
      });

      const result = await processDocuments(mockBlankForm, mockSourceDocument, mockPdfFields);

      expect(result.fields).toEqual([]);
      expect(result.summary).toBe('No fields found');
    });
  });
});
