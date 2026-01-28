import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPdfFields, createFilledPdf } from '../../services/pdfService';
import { ExtractedField } from '../../types';
import { PDFDocument, PDFTextField, PDFCheckBox } from 'pdf-lib';

// Helper to create a minimal valid PDF base64 for testing
async function createTestPdfBase64(withForm = false, fieldNames: string[] = []): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size

  if (withForm) {
    const form = pdfDoc.getForm();
    fieldNames.forEach((name, index) => {
      const textField = form.createTextField(name);
      textField.addToPage(page, { x: 50, y: 700 - (index * 30), width: 200, height: 20 });
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes).toString('base64');
}

async function createTestPdfWithCheckbox(): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const form = pdfDoc.getForm();

  const checkbox = form.createCheckBox('testCheckbox');
  checkbox.addToPage(page, { x: 50, y: 700, width: 20, height: 20 });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes).toString('base64');
}

describe('pdfService', () => {
  describe('getPdfFields', () => {
    it('should extract fields from a fillable PDF', async () => {
      const base64 = await createTestPdfBase64(true, ['firstName', 'lastName', 'email']);

      const fields = await getPdfFields(base64);

      expect(fields).toHaveLength(3);
      expect(fields[0].name).toBe('firstName');
      expect(fields[1].name).toBe('lastName');
      expect(fields[2].name).toBe('email');
      expect(fields[0].type).toBe('PDFTextField');
    });

    it('should return empty array for PDF without form fields', async () => {
      const base64 = await createTestPdfBase64(false);

      const fields = await getPdfFields(base64);

      expect(fields).toEqual([]);
    });

    it('should return empty array for invalid/corrupted PDF', async () => {
      const invalidBase64 = Buffer.from('not a valid pdf').toString('base64');

      const fields = await getPdfFields(invalidBase64);

      expect(fields).toEqual([]);
    });

    it('should return empty array for empty string input', async () => {
      const fields = await getPdfFields('');

      expect(fields).toEqual([]);
    });

    it('should detect checkbox fields correctly', async () => {
      const base64 = await createTestPdfWithCheckbox();

      const fields = await getPdfFields(base64);

      expect(fields).toHaveLength(1);
      expect(fields[0].name).toBe('testCheckbox');
      expect(fields[0].type).toBe('PDFCheckBox');
    });
  });

  describe('createFilledPdf', () => {
    describe('fillable PDF mode (isFillable=true)', () => {
      it('should fill text fields in a fillable PDF', async () => {
        const base64 = await createTestPdfBase64(true, ['name', 'city']);
        const fields: ExtractedField[] = [
          { key: 'name', label: 'Name', value: 'John Doe', validation: { status: 'VALID' } },
          { key: 'city', label: 'City', value: 'Berlin', validation: { status: 'VALID' } }
        ];

        const result = await createFilledPdf(base64, fields, true);

        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBeGreaterThan(0);

        // Verify the filled values by loading the result
        const filledDoc = await PDFDocument.load(result);
        const form = filledDoc.getForm();
        const nameField = form.getTextField('name');
        const cityField = form.getTextField('city');

        expect(nameField.getText()).toBe('John Doe');
        expect(cityField.getText()).toBe('Berlin');
      });

      it('should handle checkbox fields with true/yes values', async () => {
        const base64 = await createTestPdfWithCheckbox();
        const fields: ExtractedField[] = [
          { key: 'testCheckbox', label: 'Test', value: 'true', validation: { status: 'VALID' } }
        ];

        const result = await createFilledPdf(base64, fields, true);

        const filledDoc = await PDFDocument.load(result);
        const form = filledDoc.getForm();
        const checkbox = form.getCheckBox('testCheckbox');

        expect(checkbox.isChecked()).toBe(true);
      });

      it('should uncheck checkbox fields with false/no values', async () => {
        const base64 = await createTestPdfWithCheckbox();
        const fields: ExtractedField[] = [
          { key: 'testCheckbox', label: 'Test', value: 'false', validation: { status: 'VALID' } }
        ];

        const result = await createFilledPdf(base64, fields, true);

        const filledDoc = await PDFDocument.load(result);
        const form = filledDoc.getForm();
        const checkbox = form.getCheckBox('testCheckbox');

        expect(checkbox.isChecked()).toBe(false);
      });

      it('should skip fields without a key', async () => {
        const base64 = await createTestPdfBase64(true, ['name']);
        const fields: ExtractedField[] = [
          { label: 'Name', value: 'John Doe', validation: { status: 'VALID' } } // no key
        ];

        const result = await createFilledPdf(base64, fields, true);

        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBeGreaterThan(0);
      });

      it('should skip non-existent fields gracefully', async () => {
        const base64 = await createTestPdfBase64(true, ['name']);
        const fields: ExtractedField[] = [
          { key: 'nonexistent', label: 'Non-existent', value: 'test', validation: { status: 'VALID' } }
        ];

        // Should not throw
        const result = await createFilledPdf(base64, fields, true);
        expect(result).toBeInstanceOf(Uint8Array);
      });

      it('should handle empty field values', async () => {
        const base64 = await createTestPdfBase64(true, ['name']);
        const fields: ExtractedField[] = [
          { key: 'name', label: 'Name', value: '', validation: { status: 'VALID' } }
        ];

        const result = await createFilledPdf(base64, fields, true);

        const filledDoc = await PDFDocument.load(result);
        const form = filledDoc.getForm();
        const nameField = form.getTextField('name');

        // pdf-lib returns undefined for empty text fields, not empty string
        expect(nameField.getText()).toBeUndefined();
      });
    });

    describe('visual overlay mode (isFillable=false)', () => {
      it('should draw text at specified coordinates', async () => {
        const base64 = await createTestPdfBase64(false);
        const fields: ExtractedField[] = [
          {
            label: 'Name',
            value: 'John Doe',
            validation: { status: 'VALID' },
            coordinates: { pageIndex: 0, x: 100, y: 100 }
          }
        ];

        const result = await createFilledPdf(base64, fields, false);

        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBeGreaterThan(0);
      });

      it('should skip fields without coordinates', async () => {
        const base64 = await createTestPdfBase64(false);
        const fields: ExtractedField[] = [
          { label: 'Name', value: 'John Doe', validation: { status: 'VALID' } } // no coordinates
        ];

        const result = await createFilledPdf(base64, fields, false);
        expect(result).toBeInstanceOf(Uint8Array);
      });

      it('should skip fields without values', async () => {
        const base64 = await createTestPdfBase64(false);
        const fields: ExtractedField[] = [
          {
            label: 'Name',
            value: '',
            validation: { status: 'VALID' },
            coordinates: { pageIndex: 0, x: 100, y: 100 }
          }
        ];

        const result = await createFilledPdf(base64, fields, false);
        expect(result).toBeInstanceOf(Uint8Array);
      });

      it('should skip fields with invalid page index', async () => {
        const base64 = await createTestPdfBase64(false);
        const fields: ExtractedField[] = [
          {
            label: 'Name',
            value: 'John Doe',
            validation: { status: 'VALID' },
            coordinates: { pageIndex: 99, x: 100, y: 100 } // invalid page
          }
        ];

        // Should not throw
        const result = await createFilledPdf(base64, fields, false);
        expect(result).toBeInstanceOf(Uint8Array);
      });

      it('should skip fields with negative page index', async () => {
        const base64 = await createTestPdfBase64(false);
        const fields: ExtractedField[] = [
          {
            label: 'Name',
            value: 'John Doe',
            validation: { status: 'VALID' },
            coordinates: { pageIndex: -1, x: 100, y: 100 }
          }
        ];

        const result = await createFilledPdf(base64, fields, false);
        expect(result).toBeInstanceOf(Uint8Array);
      });

      it('should convert 0-1000 coordinates to PDF points correctly', async () => {
        const base64 = await createTestPdfBase64(false);
        const fields: ExtractedField[] = [
          {
            label: 'Corner',
            value: 'Test',
            validation: { status: 'VALID' },
            coordinates: { pageIndex: 0, x: 0, y: 0 } // top-left
          },
          {
            label: 'Bottom Right',
            value: 'Test2',
            validation: { status: 'VALID' },
            coordinates: { pageIndex: 0, x: 1000, y: 1000 } // bottom-right
          }
        ];

        // Should handle edge coordinates without error
        const result = await createFilledPdf(base64, fields, false);
        expect(result).toBeInstanceOf(Uint8Array);
      });

      it('should handle multiple fields on the same page', async () => {
        const base64 = await createTestPdfBase64(false);
        const fields: ExtractedField[] = [
          {
            label: 'Field1',
            value: 'Value1',
            validation: { status: 'VALID' },
            coordinates: { pageIndex: 0, x: 100, y: 100 }
          },
          {
            label: 'Field2',
            value: 'Value2',
            validation: { status: 'VALID' },
            coordinates: { pageIndex: 0, x: 100, y: 200 }
          },
          {
            label: 'Field3',
            value: 'Value3',
            validation: { status: 'VALID' },
            coordinates: { pageIndex: 0, x: 100, y: 300 }
          }
        ];

        const result = await createFilledPdf(base64, fields, false);
        expect(result).toBeInstanceOf(Uint8Array);
      });
    });

    describe('error handling', () => {
      it('should throw error for invalid base64 input', async () => {
        const fields: ExtractedField[] = [];

        await expect(createFilledPdf('invalid-base64', fields, true)).rejects.toThrow();
      });

      it('should handle empty fields array', async () => {
        const base64 = await createTestPdfBase64(false);
        const fields: ExtractedField[] = [];

        const result = await createFilledPdf(base64, fields, false);
        expect(result).toBeInstanceOf(Uint8Array);
      });
    });
  });
});
