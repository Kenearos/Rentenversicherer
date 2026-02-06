import { GoogleGenAI, Type, Schema } from "@google/genai";
import { FileData, FormResponse } from "../types";
import { PdfFieldInfo } from "./pdfService";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A brief summary of what document was processed."
    },
    fields: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          key: {
            type: Type.STRING,
            description: "The PDF field name (if available)."
          },
          label: {
            type: Type.STRING,
            description: "A human-readable label for the field."
          },
          value: {
            type: Type.STRING,
            description: "The value to fill. For checkboxes, use 'X' if true, otherwise leave empty."
          },
          sourceContext: {
            type: Type.STRING,
            description: "The exact snippet of text from the source document used to derive this value."
          },
          coordinates: {
            type: Type.OBJECT,
            description: "REQUIRED if no specific PDF field names are provided. Visual location to draw text.",
            properties: {
              pageIndex: { type: Type.INTEGER, description: "0-based page index" },
              x: { type: Type.INTEGER, description: "Horizontal position (0-1000) from Left" },
              y: { type: Type.INTEGER, description: "Vertical position (0-1000) from Top" }
            },
            required: ["pageIndex", "x", "y"]
          },
          validation: {
             type: Type.OBJECT,
             properties: {
                status: {
                  type: Type.STRING,
                  description: "VALID, WARNING, or INVALID."
                },
                message: {
                  type: Type.STRING,
                  description: "Validation message explaining any issues."
                },
                suggestion: {
                  type: Type.STRING,
                  description: "Alternative value suggestion."
                }
             },
             required: ["status"]
          }
        },
        required: ["label", "value", "validation"]
      }
    }
  },
  required: ["fields", "summary"]
};

export const processDocuments = async (
  blankForm: FileData,
  sourceDocument: FileData,
  pdfFields: PdfFieldInfo[] = []
): Promise<FormResponse> => {
  
  const formPart = {
    inlineData: {
      data: blankForm.base64,
      mimeType: blankForm.type,
    },
  };

  const sourcePart = {
    inlineData: {
      data: sourceDocument.base64,
      mimeType: sourceDocument.type,
    },
  };

  let systemPrompt = `
    ROLE: Intelligent Document Processing AI (German Bureaucracy Expert).
    TASK: Extract data from the SOURCE DOCUMENT and map it to the TARGET FORM visually or logically.
    
    STRICT FORMATTING RULES (German Context):
    1. DATES: Must be formatted as 'DD.MM.YYYY' (e.g., 24.01.1982). Do not use ISO or US formats.
    2. NUMBERS/CURRENCY: Use comma as decimal separator (e.g., 1.425,00). Do NOT write the currency symbol (€) if the form already has it printed.
    3. CHECKBOXES: If a condition is met (e.g., "Männlich", "Ja"), the 'value' must be "X". If not met, leave empty.
    
    CRITICAL: Verify every extraction. If ambiguous, set validation.status to 'WARNING'.
  `;

  if (pdfFields.length > 0) {
    const fieldList = pdfFields.map(f => `"${f.name}" (${f.type})`).join(", ");
    systemPrompt += `
      MODE: FILLABLE PDF (AcroForm).
      Map extracted data to these exact field IDs: [${fieldList}].
    `;
  } else {
    systemPrompt += `
      MODE: VISUAL FILLING (Flat Scan/Image).
      The target form has NO digital fields. You must estimate COORDINATES.
      
      COORDINATE SYSTEM (0-1000):
      - x=0, y=0 is Top-Left.
      - x=1000, y=1000 is Bottom-Right.
      
      STRATEGY:
      1. Analyze the blank form image. Identify where user input belongs (lines, boxes).
      2. For "Reisekosten" (Travel Expenses): Look for columns like "Fahrtkosten", "Übernachtung". accurately place the amounts in the "Betrag" column.
      3. Place text slightly ABOVE the underline so it looks natural.
      4. For Checkboxes: Estimate the center of the square box.
    `;
  }

  try {
    const modelId = "gemini-3-flash-preview";

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          formPart, 
          { text: "TARGET FORM (Blank)" },
          sourcePart,
          { text: "SOURCE DATA (Email/Receipts)" },
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: systemPrompt
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    return JSON.parse(text) as FormResponse;

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};