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
    ROLE: Intelligent Document Processing AI (Verification Expert).
    TASK: Extract data from the SOURCE DOCUMENT and map it to the BLANK TARGET FORM.
    
    CRITICAL INSTRUCTION: You must verify every extraction. If a value is ambiguous, plausibility is low, or you are guessing, set validation.status to 'WARNING' and explain why in validation.message.
  `;

  if (pdfFields.length > 0) {
    const fieldList = pdfFields.map(f => `"${f.name}" (${f.type})`).join(", ");
    systemPrompt += `
      MODE: FILLABLE PDF (AcroForm).
      The target form has specific embedded fields.
      Map extracted data to these exact field IDs: [${fieldList}].
      Return the 'key' property matching the field ID.
    `;
  } else {
    systemPrompt += `
      MODE: VISUAL FILLING (Flat/XFA/Scan).
      The target form DOES NOT have accessible digital fields.
      You must VISUALLY locate where the text should be written.
      
      For every field you identify on the TARGET FORM:
      1. Extract the corresponding value from the SOURCE DOCUMENT.
      2. Estimate the VISUAL COORDINATES [pageIndex, x, y] where the text should start.
         - 'x' and 'y' are on a scale of 0 to 1000.
         - (0,0) is the top-left corner of the page.
         - (1000,1000) is the bottom-right corner.
         - Align text slightly above lines or inside boxes.
      
      For checkboxes: If true/yes, the value should be "X" placed inside the box.
    `;
  }

  systemPrompt += `
    VALIDATION RULES:
    1. Dates: Ensure format matches the form (e.g. DD.MM.YYYY).
    2. Checkboxes: Only mark if explicitly supported by source.
    3. Missing Data: If a field is not found in source, leave 'value' empty and set status 'VALID'. Do not hallucinate.
    4. Source Context: Always populate 'sourceContext' with the exact text snippet from the source document that justifies your extraction.
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
