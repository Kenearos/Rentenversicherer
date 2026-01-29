import { GoogleGenAI, Type, Schema } from "@google/genai";
import { FileData, FormResponse } from "../types";
import { PdfFieldInfo } from "./pdfService";
import { getApiKey } from "./apiKeyService";
import { detectTemplate, getExpectedFields } from "./latexService";

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

// G2210-11 specific field definitions for better extraction
const G2210_FIELDS = `
REQUIRED FIELDS FOR G2210-11 (Ärztlicher Befundbericht):
Extract ALL of the following fields from the source document:

PATIENT DATA:
- Versicherungsnummer (e.g., "12 345678 A 123")
- ABT.-Nr. (Aktenzeichen/Abteilungsnummer)
- Name, Vorname (Full name: "Nachname, Vorname")
- Geburtsdatum (format: DD.MM.YYYY)
- Geschlecht (männlich/weiblich/divers)
- Straße, Hausnummer
- PLZ
- Ort
- Telefon
- Krankenkasse

EMPLOYMENT:
- Derzeitige Tätigkeit (Beruf)
- Arbeitgeber
- Arbeitsunfähig seit (date: DD.MM.YYYY)
- Letzte Arbeitsaufnahme

DIAGNOSES (up to 6, with ICD-10 codes):
- Diagnose 1 + Diagnose 1 ICD
- Diagnose 2 + Diagnose 2 ICD
- Diagnose 3 + Diagnose 3 ICD
- Diagnose 4 + Diagnose 4 ICD
- Diagnose 5 + Diagnose 5 ICD
- Diagnose 6 + Diagnose 6 ICD

ANAMNESIS:
- Anamnese/Beschwerden (patient symptoms and history)
- Krankheitsverlauf (disease progression, previous treatments)
- Körperlicher Befund (physical examination findings)

FUNCTIONAL LIMITATIONS (mark as "keine", "gering", or "erheblich"):
- Mobilität keine/gering/erheblich
- Selbstversorgung keine/gering/erheblich
- Haushaltsführung keine/gering/erheblich
- Erwerbstätigkeit keine/gering/erheblich
- Kommunikation keine/gering/erheblich
- Psychische Belastbarkeit keine/gering/erheblich
- Beeinträchtigungen Erläuterung

MEDICATION (up to 5):
- Medikament 1 + Medikament 1 Dosis + Medikament 1 Seit
- Medikament 2 + Medikament 2 Dosis + Medikament 2 Seit
- Medikament 3 + Medikament 3 Dosis + Medikament 3 Seit
- Medikament 4 + Medikament 4 Dosis + Medikament 4 Seit
- Medikament 5 + Medikament 5 Dosis + Medikament 5 Seit
- Physikalische Therapie

PREVIOUS REHABILITATION:
- Reha 1 Zeitraum + Reha 1 Einrichtung + Reha 1 Erfolg
- Reha 2 Zeitraum + Reha 2 Einrichtung + Reha 2 Erfolg

ASSESSMENT:
- Leistungsvermögen (vollschichtig/3-6 Stunden/unter 3 Stunden)
- Rehabilitationsbedürftigkeit (reasoning for rehab need)
- Rehabilitationsziel
- Rehabilitationsform (stationär/ambulant/ganztägig ambulant)
- Reha Einrichtung Empfehlung

TRAVEL:
- Reisefähig (ja/nein)
- Reisefähig Begründung (if no)
- Begleitperson (ja/nein)

ADDITIONAL:
- Ergänzende Angaben

DOCTOR INFORMATION:
- Arzt Name
- Facharztbezeichnung
- Praxis Anschrift
- Praxis Telefon
- BSNR
- LANR
- Unterschrift Datum
`;

export const processDocuments = async (
  blankForm: FileData,
  sourceDocument: FileData,
  pdfFields: PdfFieldInfo[] = []
): Promise<FormResponse> => {

  // Detect if we have a known template
  const detectedTemplate = detectTemplate(blankForm.file?.name || '');
  const expectedFields = detectedTemplate ? getExpectedFields(detectedTemplate) : [];

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

  // Add template-specific instructions
  if (detectedTemplate === 'G2210-11') {
    systemPrompt += `
      DETECTED FORM: G2210-11 (Ärztlicher Befundbericht der DRV Westfalen)

      ${G2210_FIELDS}

      IMPORTANT INSTRUCTIONS:
      1. Extract ALL fields listed above, even if they are empty in the source.
      2. Use the EXACT label names as listed above for each field.
      3. For multi-value fields like diagnoses and medications, create separate field entries.
      4. For checkbox fields (Mobilität, Selbstversorgung, etc.), return separate fields for each option.
         Example: If mobility is "erheblich", return:
         - "Mobilität keine" with value ""
         - "Mobilität gering" with value ""
         - "Mobilität erheblich" with value "true"
      5. ICD-10 codes must be in standard format (e.g., "M54.5", "F32.1")
      6. Dates must be in DD.MM.YYYY format.
      7. For Leistungsvermögen, return separate checkbox fields:
         - "Leistungsvermögen vollschichtig" (true/false)
         - "Leistungsvermögen 3-6 Stunden" (true/false)
         - "Leistungsvermögen unter 3 Stunden" (true/false)
    `;
  } else if (pdfFields.length > 0) {
    const fieldList = pdfFields.map(f => `"${f.name}" (${f.type})`).join(", ");
    systemPrompt += `
      MODE: FILLABLE PDF (AcroForm).
      The target form has specific embedded fields.
      Map extracted data to these exact field IDs: [${fieldList}].
      Return the 'key' property matching the field ID.
    `;
  } else if (expectedFields.length > 0) {
    systemPrompt += `
      MODE: TEMPLATE-BASED EXTRACTION.
      Extract the following specific fields: [${expectedFields.join(", ")}].
      Use these exact label names in your response.
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
