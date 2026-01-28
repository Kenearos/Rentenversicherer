#!/usr/bin/env python3
"""
PDF Form Filler - Automatisches Ausfüllen von PDF-Formularen mit AcroForm-Feldern.

Usage:
    python fill_pdf.py <input.pdf> <values.json> <output.pdf>
    python fill_pdf.py --extract <input.pdf>  # Extrahiert Feldnamen
"""

from pypdf import PdfReader, PdfWriter
import json
import sys


def extract_fields(pdf_path: str) -> list[dict]:
    """Extrahiert alle Formularfelder aus einer PDF."""
    reader = PdfReader(pdf_path)
    fields = reader.get_fields()

    if not fields:
        return []

    result = []
    for field_name, field_data in fields.items():
        field_type = field_data.get('/FT', '')
        field_info = {
            "field_id": field_name,
            "type": str(field_type),
            "value": field_data.get('/V', '')
        }
        result.append(field_info)

    return result


def fill_pdf(input_pdf: str, field_values: dict, output_pdf: str):
    """
    Befüllt eine PDF mit den angegebenen Feldwerten.

    field_values Format:
    {
        "txtName": "Max Mustermann",
        "txtDatum": "28.01.2025",
        "chkOption": "/Ja"  # Checkboxen: /On, /Off, /Ja, /Nein
    }
    """
    reader = PdfReader(input_pdf)
    writer = PdfWriter()
    writer.append(reader)

    # Felder auf allen Seiten befüllen
    for page_num in range(len(writer.pages)):
        writer.update_page_form_field_values(
            writer.pages[page_num],
            field_values
        )

    with open(output_pdf, "wb") as output:
        writer.write(output)


def main():
    # Extraktionsmodus
    if len(sys.argv) == 3 and sys.argv[1] == "--extract":
        pdf_path = sys.argv[2]
        fields = extract_fields(pdf_path)
        print(json.dumps(fields, indent=2, ensure_ascii=False))
        return

    # Normaler Füllmodus
    if len(sys.argv) != 4:
        print("Usage: python fill_pdf.py <input.pdf> <values.json> <output.pdf>")
        print("       python fill_pdf.py --extract <input.pdf>")
        sys.exit(1)

    input_pdf = sys.argv[1]
    values_json = sys.argv[2]
    output_pdf = sys.argv[3]

    # JSON laden
    with open(values_json, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Wenn Liste: in Dict umwandeln
    if isinstance(data, list):
        field_values = {item['field_id']: item['value'] for item in data}
    else:
        field_values = data

    fill_pdf(input_pdf, field_values, output_pdf)
    print(f"PDF erfolgreich erstellt: {output_pdf}")


if __name__ == "__main__":
    main()
