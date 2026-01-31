import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isLatexServiceAvailable,
  getAvailableTemplates,
  getTemplateFieldMapping,
  generateLatexPdf,
  previewLatexSource,
  base64ToBlob,
  detectTemplate,
  getExpectedFields,
} from '../../services/latexService';
import { ExtractedField } from '../../types';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('latexService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isLatexServiceAvailable', () => {
    it('should return true when health endpoint responds with ok', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const result = await isLatexServiceAvailable();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/health'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return false when health endpoint returns error', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const result = await isLatexServiceAvailable();

      expect(result).toBe(false);
    });

    it('should return false when fetch throws error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await isLatexServiceAvailable();

      expect(result).toBe(false);
    });

    it('should use timeout signal', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await isLatexServiceAvailable();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  describe('getAvailableTemplates', () => {
    it('should return templates array on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ templates: ['G2210-11', 'S0051'] }),
      });

      const result = await getAvailableTemplates();

      expect(result).toEqual(['G2210-11', 'S0051']);
    });

    it('should return empty array when response has no templates', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await getAvailableTemplates();

      expect(result).toEqual([]);
    });

    it('should return empty array on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await getAvailableTemplates();

      expect(result).toEqual([]);
    });

    it('should return empty array on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const result = await getAvailableTemplates();

      expect(result).toEqual([]);
    });
  });

  describe('getTemplateFieldMapping', () => {
    it('should return mapping on success', async () => {
      const mockMapping = { field1: ['alias1', 'alias2'] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ mapping: mockMapping }),
      });

      const result = await getTemplateFieldMapping('G2210-11');

      expect(result).toEqual(mockMapping);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/field-mapping/G2210-11')
      );
    });

    it('should return null when response has no mapping', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await getTemplateFieldMapping('G2210-11');

      expect(result).toBeNull();
    });

    it('should return null on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const result = await getTemplateFieldMapping('unknown');

      expect(result).toBeNull();
    });

    it('should return null on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await getTemplateFieldMapping('G2210-11');

      expect(result).toBeNull();
    });
  });

  describe('generateLatexPdf', () => {
    const mockFields: ExtractedField[] = [
      { label: 'Name', value: 'John Doe', key: 'name' },
      { label: 'Date', value: '2025-01-28', key: 'date' },
    ];

    it('should return success result with PDF on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          pdf: 'base64pdfcontent',
          mapped_fields: { name: 'John Doe' },
        }),
      });

      const result = await generateLatexPdf('G2210-11', mockFields);

      expect(result.success).toBe(true);
      expect(result.pdf).toBe('base64pdfcontent');
      expect(result.mappedFields).toEqual({ name: 'John Doe' });
    });

    it('should send correct request body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await generateLatexPdf('G2210-11', mockFields);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/generate'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"template":"G2210-11"'),
        })
      );
    });

    it('should map fields correctly in request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await generateLatexPdf('G2210-11', mockFields);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.fields).toEqual([
        { label: 'Name', value: 'John Doe', key: 'name' },
        { label: 'Date', value: '2025-01-28', key: 'date' },
      ]);
      expect(callBody.format).toBe('base64');
    });

    it('should return error result on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Template not found' }),
      });

      const result = await generateLatexPdf('unknown', mockFields);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Template not found');
    });

    it('should return error result with HTTP status when no error message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      const result = await generateLatexPdf('unknown', mockFields);

      expect(result.success).toBe(false);
      expect(result.error).toBe('HTTP 404');
    });

    it('should return error result on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await generateLatexPdf('G2210-11', mockFields);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    });
  });

  describe('previewLatexSource', () => {
    const mockFields: ExtractedField[] = [
      { label: 'Name', value: 'Test' },
    ];

    it('should return latex source on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ latex: '\\documentclass{article}' }),
      });

      const result = await previewLatexSource('G2210-11', mockFields);

      expect(result.latex).toBe('\\documentclass{article}');
      expect(result.error).toBeUndefined();
    });

    it('should return error on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Template not found' }),
      });

      const result = await previewLatexSource('unknown', mockFields);

      expect(result.error).toBe('Template not found');
      expect(result.latex).toBeUndefined();
    });

    it('should return error on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await previewLatexSource('G2210-11', mockFields);

      expect(result.error).toBe('Connection refused');
    });
  });

  describe('base64ToBlob', () => {
    it('should convert base64 to Blob with correct mime type', () => {
      const base64 = btoa('test content');

      const result = base64ToBlob(base64, 'application/pdf');

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('application/pdf');
    });

    it('should use application/pdf as default mime type', () => {
      const base64 = btoa('test');

      const result = base64ToBlob(base64);

      expect(result.type).toBe('application/pdf');
    });

    it('should correctly decode base64 content', () => {
      const originalContent = 'Hello, World!';
      const base64 = btoa(originalContent);

      const result = base64ToBlob(base64, 'text/plain');

      // Verify the blob has correct size (original content length)
      expect(result.size).toBe(originalContent.length);
    });

    it('should handle binary content', () => {
      // PDF magic bytes in base64
      const pdfHeader = btoa('%PDF-1.4');

      const result = base64ToBlob(pdfHeader, 'application/pdf');

      expect(result.size).toBeGreaterThan(0);
    });
  });

  describe('detectTemplate', () => {
    it('should detect G2210-11 from filename with g2210', () => {
      expect(detectTemplate('G2210-11.pdf')).toBe('G2210-11');
      expect(detectTemplate('g2210_form.pdf')).toBe('G2210-11');
      expect(detectTemplate('G2210.pdf')).toBe('G2210-11');
    });

    it('should detect G2210-11 from filename with befundbericht', () => {
      expect(detectTemplate('befundbericht.pdf')).toBe('G2210-11');
      expect(detectTemplate('Aerztlicher_Befundbericht.pdf')).toBe('G2210-11');
    });

    it('should detect G2210-11 from filename with aerztlicher', () => {
      expect(detectTemplate('aerztlicher_bericht.pdf')).toBe('G2210-11');
      expect(detectTemplate('Aerztlicher_form.pdf')).toBe('G2210-11');
    });

    it('should detect G2210-11 from filename with ärztlicher (umlaut)', () => {
      expect(detectTemplate('ärztlicher_bericht.pdf')).toBe('G2210-11');
    });

    it('should be case insensitive', () => {
      expect(detectTemplate('G2210-11.PDF')).toBe('G2210-11');
      expect(detectTemplate('BEFUNDBERICHT.pdf')).toBe('G2210-11');
      expect(detectTemplate('AERZTLICHER.pdf')).toBe('G2210-11');
    });

    it('should return null for unrecognized filenames', () => {
      expect(detectTemplate('random_form.pdf')).toBeNull();
      expect(detectTemplate('document.pdf')).toBeNull();
      expect(detectTemplate('scan.jpg')).toBeNull();
    });
  });

  describe('getExpectedFields', () => {
    it('should return expected fields for G2210-11 template', () => {
      const fields = getExpectedFields('G2210-11');

      expect(fields).toBeInstanceOf(Array);
      expect(fields.length).toBeGreaterThan(0);
      expect(fields).toContain('Versicherungsnummer');
      expect(fields).toContain('Name, Vorname');
      expect(fields).toContain('Geburtsdatum');
      expect(fields).toContain('Diagnose 1');
    });

    it('should return empty array for unknown template', () => {
      const fields = getExpectedFields('unknown');

      expect(fields).toEqual([]);
    });

    it('should include medical fields for G2210-11', () => {
      const fields = getExpectedFields('G2210-11');

      expect(fields).toContain('Diagnose 1 ICD');
      expect(fields).toContain('Anamnese/Beschwerden');
      expect(fields).toContain('Körperlicher Befund');
    });

    it('should include doctor fields for G2210-11', () => {
      const fields = getExpectedFields('G2210-11');

      expect(fields).toContain('Arzt Name');
      expect(fields).toContain('Facharztbezeichnung');
      expect(fields).toContain('BSNR');
      expect(fields).toContain('LANR');
    });
  });
});
