import { GoogleGenAI, Type, Schema } from "@google/genai";
import { FileData, FormResponse } from "../types";
import { PdfFieldInfo } from "./pdfService";
import { getApiKey } from "./apiKeyService";

const getAI = () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Kein API Key gesetzt. Bitte gib deinen Gemini API Key ein.");
  }
  return new GoogleGenAI({ apiKey });
};

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
            description: "The value to fill. For checkboxes, use 'true'/'false' or 'X'."
          },
          sourceContext: {
            type: Type.STRING,
            description: "The exact snippet of text from the source document used to derive this value. Used for user verification."
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
                  description: "Validation message explaining any issues or uncertainty."
                },
                suggestion: {
                  type: Type.STRING,
                  description: "Alternative value suggestion if the extracted value is uncertain."
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
    ROLE: Intelligent Document Processing AI.
    TASK: Extract data from the SOURCE DOCUMENT and fill the BLANK TARGET FORM.

    CRITICAL: You must verify every extraction. If uncertain, set validation.status to 'WARNING'.
  `;

  // PRIORITY 1: If PDF has fillable fields, USE THEM - this is the simplest and best approach
  if (pdfFields.length > 0) {
    const fieldList = pdfFields.map(f => `"${f.name}" (${f.type})`).join("\n- ");
    systemPrompt += `
      MODE: FILLABLE PDF (AcroForm).

      The target PDF has these EXACT fillable fields:
      - ${fieldList}

      CRITICAL INSTRUCTIONS:
      1. For EACH field listed above, extract the corresponding value from the SOURCE DOCUMENT.
      2. Return the 'key' property with the EXACT field name from the list above.
      3. The 'label' should be a human-readable description.
      4. For checkboxes: use value "true" to check, "false" to uncheck.
      5. For text fields: use the extracted text value.

      You MUST return a field entry for each PDF field listed above.
      The 'key' MUST match exactly one of the field names I provided.
    `;
  } else {
    // FALLBACK: Visual overlay mode for non-fillable PDFs
    systemPrompt += `
      MODE: VISUAL FILLING (Flat PDF/Scan).
      The target form does NOT have digital form fields.

      For every field you identify on the TARGET FORM:
      1. Extract the corresponding value from the SOURCE DOCUMENT.
      2. Estimate VISUAL COORDINATES [pageIndex, x, y] where the text should be written.
         - x and y are on a scale of 0 to 1000.
         - (0,0) is the top-left corner.
         - (1000,1000) is the bottom-right corner.

      For checkboxes: value should be "X" if checked.
    `;
  }

  systemPrompt += `
    VALIDATION RULES:
    1. Dates: German format DD.MM.YYYY
    2. Missing Data: Leave 'value' empty, don't hallucinate.
    3. Source Context: Include the exact text snippet from source that justifies the extraction.
  `;

  try {
    const ai = getAI();
    const modelId = "gemini-2.0-flash";

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          formPart, 
          { text: "This is the BLANK TARGET FORM." },
          sourcePart,
          { text: "This is the SOURCE DOCUMENT." },
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
