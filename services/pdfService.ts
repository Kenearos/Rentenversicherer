import { PDFDocument, PDFTextField, PDFCheckBox, StandardFonts, rgb } from 'pdf-lib';
import { ExtractedField } from '../types';

export interface PdfFieldInfo {
  name: string;
  type: string;
}

export const getPdfFields = async (base64: string): Promise<PdfFieldInfo[]> => {
  try {
    const pdfDoc = await PDFDocument.load(base64);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    return fields.map(f => ({
      name: f.getName(),
      type: f.constructor.name
    }));
  } catch (error) {
    console.warn("Failed to extract PDF fields", error);
    return [];
  }
};

export const createFilledPdf = async (base64: string, fields: ExtractedField[], isFillable: boolean): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(base64);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  if (isFillable) {
    try {
      const form = pdfDoc.getForm();
      const fieldMap: Record<string, string> = {};
      fields.forEach(f => {
         if (f.key) fieldMap[f.key] = f.value;
      });

      for (const [key, value] of Object.entries(fieldMap)) {
        try {
          const field = form.getField(key);
          if (!field) continue;
          
          if (field instanceof PDFTextField) {
            field.setText(String(value));
          } else if (field instanceof PDFCheckBox) {
             const isChecked = String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'yes';
             if (isChecked) field.check();
             else field.uncheck();
          }
        } catch (e) {
          // Field might be read-only or tricky
        }
      }
    } catch (e) {
      console.warn("Error filling form fields", e);
    }
  } else {
    // VISUAL OVERLAY MODE
    // Iterate through fields and draw them at specific coordinates
    
    for (const field of fields) {
      // Skip if no value or no coordinates
      if (!field.value || !field.coordinates) continue;
      
      const { pageIndex, x, y } = field.coordinates;
      
      // Safety check for page index
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      
      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      
      // Convert 0-1000 coordinates to PDF Point coordinates
      // PDF (0,0) is bottom-left. 
      // API (0,0) is top-left.
      // x = (x / 1000) * width
      // y = height - (y / 1000) * height
      
      const pdfX = (x / 1000) * width;
      const pdfY = height - (y / 1000) * height;

      // Adjust slightly for font height (text is drawn from baseline)
      // A small nudge down (subtract from Y) helps align with lines usually.
      const adjustedY = pdfY - 4; 
      
      try {
        page.drawText(field.value, {
          x: pdfX,
          y: adjustedY,
          size: 10,
          font: font,
          color: rgb(0, 0, 0),
        });
      } catch (e) {
        console.warn(`Failed to draw field ${field.label}`, e);
      }
    }
  }
  
  return await pdfDoc.save();
};

export const fillPdf = async (base64: string, fieldValues: Record<string, string | boolean>): Promise<Uint8Array> => {
  return new Uint8Array();
};
