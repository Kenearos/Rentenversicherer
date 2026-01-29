#!/usr/bin/env python3
"""
Flask server for LaTeX form generation.
Provides API endpoints for compiling LaTeX templates with field data.
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import base64
import io
import json
import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from latex_service import generate_form, list_templates, load_template, fill_template, escape_latex

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend access

# Field mapping for G2210-11 template
# Maps extracted field labels to LaTeX template variables
G2210_FIELD_MAPPING = {
    # Patient data
    "versicherungsnummer": ["versicherungsnummer", "vers.nr.", "vers-nr", "rentenversicherungsnummer", "rvnr"],
    "abt_nr": ["abt.-nr.", "abt-nr", "abteilungsnummer", "aktenzeichen"],
    "name_vorname": ["name, vorname", "name vorname", "patient", "patientenname", "name des versicherten"],
    "geburtsdatum": ["geburtsdatum", "geb.", "geb.datum", "geboren am", "geburtstag"],
    "geschlecht": ["geschlecht", "sex", "m/w/d"],
    "strasse": ["straße", "strasse", "anschrift", "adresse"],
    "plz": ["plz", "postleitzahl"],
    "ort": ["ort", "wohnort", "stadt"],
    "telefon": ["telefon", "tel.", "tel", "telefonnummer", "rufnummer"],
    "krankenkasse": ["krankenkasse", "krankenversicherung", "kk", "versicherung"],

    # Employment
    "beruf_taetigkeit": ["beruf", "tätigkeit", "derzeitige tätigkeit", "beschäftigung", "arbeit"],
    "arbeitgeber": ["arbeitgeber", "firma", "unternehmen"],
    "au_seit": ["arbeitsunfähig seit", "au seit", "arbeitsunfähigkeit seit", "krankgeschrieben seit"],
    "letzte_arbeit": ["letzte arbeitsaufnahme", "letzter arbeitstag", "zuletzt gearbeitet"],

    # Diagnoses
    "diagnose_1": ["diagnose 1", "hauptdiagnose", "1. diagnose"],
    "diagnose_1_icd": ["icd 1", "icd-10 1", "diagnose 1 icd"],
    "diagnose_2": ["diagnose 2", "nebendiagnose 1", "2. diagnose"],
    "diagnose_2_icd": ["icd 2", "icd-10 2", "diagnose 2 icd"],
    "diagnose_3": ["diagnose 3", "nebendiagnose 2", "3. diagnose"],
    "diagnose_3_icd": ["icd 3", "icd-10 3", "diagnose 3 icd"],
    "diagnose_4": ["diagnose 4", "nebendiagnose 3", "4. diagnose"],
    "diagnose_4_icd": ["icd 4", "icd-10 4", "diagnose 4 icd"],
    "diagnose_5": ["diagnose 5", "nebendiagnose 4", "5. diagnose"],
    "diagnose_5_icd": ["icd 5", "icd-10 5", "diagnose 5 icd"],
    "diagnose_6": ["diagnose 6", "nebendiagnose 5", "6. diagnose"],
    "diagnose_6_icd": ["icd 6", "icd-10 6", "diagnose 6 icd"],

    # Anamnesis
    "anamnese_beschwerden": ["anamnese", "beschwerden", "eigenanamnese", "aktuelle beschwerden", "symptome"],
    "krankheitsverlauf": ["krankheitsverlauf", "verlauf", "bisherige behandlung", "behandlungsverlauf"],
    "koerperlicher_befund": ["befund", "körperlicher befund", "aktueller befund", "untersuchungsbefund"],

    # Functional limitations (checkboxes)
    "mobilitaet_keine": ["mobilität keine", "mobilität: keine"],
    "mobilitaet_gering": ["mobilität gering", "mobilität: gering"],
    "mobilitaet_erheblich": ["mobilität erheblich", "mobilität: erheblich"],
    "selbstversorgung_keine": ["selbstversorgung keine"],
    "selbstversorgung_gering": ["selbstversorgung gering"],
    "selbstversorgung_erheblich": ["selbstversorgung erheblich"],
    "haushalt_keine": ["haushaltsführung keine", "haushalt keine"],
    "haushalt_gering": ["haushaltsführung gering", "haushalt gering"],
    "haushalt_erheblich": ["haushaltsführung erheblich", "haushalt erheblich"],
    "erwerb_keine": ["erwerbstätigkeit keine", "erwerb keine"],
    "erwerb_gering": ["erwerbstätigkeit gering", "erwerb gering"],
    "erwerb_erheblich": ["erwerbstätigkeit erheblich", "erwerb erheblich"],
    "kommunikation_keine": ["kommunikation keine"],
    "kommunikation_gering": ["kommunikation gering"],
    "kommunikation_erheblich": ["kommunikation erheblich"],
    "psyche_keine": ["psychische belastbarkeit keine", "psyche keine"],
    "psyche_gering": ["psychische belastbarkeit gering", "psyche gering"],
    "psyche_erheblich": ["psychische belastbarkeit erheblich", "psyche erheblich"],
    "beeintraechtigungen_erlaeuterung": ["beeinträchtigungen erläuterung", "erläuterungen beeinträchtigungen"],

    # Medication
    "medikament_1": ["medikament 1", "medikation 1"],
    "medikament_1_dosis": ["dosis 1", "medikament 1 dosis"],
    "medikament_1_seit": ["seit 1", "medikament 1 seit"],
    "medikament_2": ["medikament 2", "medikation 2"],
    "medikament_2_dosis": ["dosis 2", "medikament 2 dosis"],
    "medikament_2_seit": ["seit 2", "medikament 2 seit"],
    "medikament_3": ["medikament 3", "medikation 3"],
    "medikament_3_dosis": ["dosis 3", "medikament 3 dosis"],
    "medikament_3_seit": ["seit 3", "medikament 3 seit"],
    "medikament_4": ["medikament 4", "medikation 4"],
    "medikament_4_dosis": ["dosis 4", "medikament 4 dosis"],
    "medikament_4_seit": ["seit 4", "medikament 4 seit"],
    "medikament_5": ["medikament 5", "medikation 5"],
    "medikament_5_dosis": ["dosis 5", "medikament 5 dosis"],
    "medikament_5_seit": ["seit 5", "medikament 5 seit"],
    "physikalische_therapie": ["physikalische therapie", "heilmittel", "physiotherapie", "krankengymnastik"],

    # Previous rehab
    "reha_1_zeitraum": ["reha 1 zeitraum", "frühere reha 1 zeitraum"],
    "reha_1_einrichtung": ["reha 1 einrichtung", "frühere reha 1 einrichtung"],
    "reha_1_erfolg": ["reha 1 erfolg", "frühere reha 1 erfolg"],
    "reha_2_zeitraum": ["reha 2 zeitraum", "frühere reha 2 zeitraum"],
    "reha_2_einrichtung": ["reha 2 einrichtung", "frühere reha 2 einrichtung"],
    "reha_2_erfolg": ["reha 2 erfolg", "frühere reha 2 erfolg"],

    # Assessment
    "leistungsvermoegen_checkbox_vollschichtig": ["vollschichtig", "leistungsvermögen vollschichtig", "6 stunden und mehr"],
    "leistungsvermoegen_checkbox_teilschichtig": ["teilschichtig", "leistungsvermögen 3-6", "3-6 stunden"],
    "leistungsvermoegen_checkbox_unter3": ["unter 3 stunden", "leistungsvermögen unter 3"],
    "reha_beduerftig_begruendung": ["rehabilitationsbedürftigkeit", "reha begründung", "reha bedürftigkeit"],
    "reha_ziel": ["rehabilitationsziel", "reha ziel", "therapieziel"],
    "reha_stationaer": ["stationär", "stationäre reha"],
    "reha_ambulant": ["ambulant", "ambulante reha"],
    "reha_ganztaegig": ["ganztägig ambulant", "teilstationär"],
    "reha_einrichtung_empfehlung": ["empfohlene einrichtung", "reha einrichtung", "klinikempfehlung"],

    # Travel capability
    "reisefaehig_ja": ["reisefähig ja", "öffentliche verkehrsmittel ja"],
    "reisefaehig_nein": ["reisefähig nein", "öffentliche verkehrsmittel nein"],
    "reisefaehig_begruendung": ["reisefähigkeit begründung", "nicht reisefähig weil"],
    "begleitperson_ja": ["begleitperson ja", "begleitperson erforderlich"],
    "begleitperson_nein": ["begleitperson nein", "keine begleitperson"],

    # Additional
    "ergaenzende_angaben": ["ergänzende angaben", "zusätzliche informationen", "bemerkungen", "sonstiges"],

    # Attachments
    "anlage_laborbefunde": ["anlage laborbefunde", "laborbefunde"],
    "anlage_roentgen": ["anlage röntgen", "bildgebende befunde", "röntgenbefunde"],
    "anlage_arztbriefe": ["anlage arztbriefe", "arztbriefe"],
    "anlage_krankenhausberichte": ["anlage krankenhausberichte", "krankenhausberichte", "entlassungsberichte"],
    "anlage_sonstige": ["anlage sonstige", "sonstige anlagen"],
    "anlage_sonstige_text": ["sonstige anlagen text", "anlage sonstige bezeichnung"],

    # Signature
    "unterschrift_datum": ["unterschrift datum", "datum unterschrift", "ausstellungsdatum"],
    "arzt_name": ["arzt name", "name des arztes", "behandelnder arzt"],
    "arzt_fachrichtung": ["facharztbezeichnung", "fachrichtung", "facharzt"],
    "praxis_anschrift": ["praxis anschrift", "praxisadresse", "arztpraxis"],
    "praxis_telefon": ["praxis telefon", "praxis tel"],
    "bsnr": ["bsnr", "betriebsstättennummer"],
    "lanr": ["lanr", "lebenslange arztnummer"],
}


def normalize_label(label: str) -> str:
    """Normalize a label for matching."""
    return label.lower().strip().replace(':', '').replace('_', ' ')


def map_fields_to_template(extracted_fields: list, template_mapping: dict) -> dict:
    """
    Map extracted fields to template variables using fuzzy matching.

    Args:
        extracted_fields: List of {label, value, ...} dicts from AI extraction
        template_mapping: Dict mapping template vars to possible label variations

    Returns:
        Dict of template variables to values
    """
    result = {}

    # Build reverse mapping: normalized label -> template var
    reverse_map = {}
    for template_var, possible_labels in template_mapping.items():
        for label in possible_labels:
            reverse_map[normalize_label(label)] = template_var

    # Map each extracted field
    for field in extracted_fields:
        label = normalize_label(field.get('label', ''))
        value = field.get('value', '')

        if not label or not value:
            continue

        # Direct match
        if label in reverse_map:
            result[reverse_map[label]] = value
            continue

        # Fuzzy match: check if any mapping label is contained in the extracted label
        for possible_label, template_var in reverse_map.items():
            if possible_label in label or label in possible_label:
                result[template_var] = value
                break

    return result


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'service': 'latex-form-generator'})


@app.route('/api/templates', methods=['GET'])
def get_templates():
    """List available LaTeX templates."""
    templates = list_templates()
    return jsonify({'templates': templates})


@app.route('/api/generate', methods=['POST'])
def generate_pdf():
    """
    Generate a filled PDF from a template and field data.

    Request body:
    {
        "template": "G2210-11",
        "fields": [
            {"label": "Name, Vorname", "value": "Müller, Hans"},
            {"label": "Geburtsdatum", "value": "01.01.1970"},
            ...
        ]
    }

    Returns: PDF file or base64-encoded PDF
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        template_name = data.get('template', 'G2210-11')
        extracted_fields = data.get('fields', [])
        return_format = data.get('format', 'base64')  # 'base64' or 'file'

        # Get the appropriate field mapping
        if template_name == 'G2210-11':
            field_mapping = G2210_FIELD_MAPPING
        else:
            # For other templates, try direct field names
            field_mapping = {}

        # Map extracted fields to template variables
        if field_mapping:
            template_fields = map_fields_to_template(extracted_fields, field_mapping)
        else:
            # Direct mapping: use label as key
            template_fields = {normalize_label(f['label']).replace(' ', '_'): f['value']
                             for f in extracted_fields if f.get('value')}

        # Generate PDF
        pdf_bytes = generate_form(template_name, template_fields)

        if return_format == 'file':
            return send_file(
                io.BytesIO(pdf_bytes),
                mimetype='application/pdf',
                as_attachment=True,
                download_name=f'{template_name}_filled.pdf'
            )
        else:
            # Return base64
            pdf_base64 = base64.b64encode(pdf_bytes).decode('ascii')
            return jsonify({
                'success': True,
                'pdf': pdf_base64,
                'mapped_fields': template_fields
            })

    except FileNotFoundError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': f'Generation failed: {str(e)}'}), 500


@app.route('/api/preview', methods=['POST'])
def preview_latex():
    """
    Preview the filled LaTeX source (for debugging).

    Same request format as /api/generate.
    Returns the LaTeX source instead of compiled PDF.
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        template_name = data.get('template', 'G2210-11')
        extracted_fields = data.get('fields', [])

        # Get the appropriate field mapping
        if template_name == 'G2210-11':
            field_mapping = G2210_FIELD_MAPPING
        else:
            field_mapping = {}

        # Map extracted fields to template variables
        if field_mapping:
            template_fields = map_fields_to_template(extracted_fields, field_mapping)
        else:
            template_fields = {normalize_label(f['label']).replace(' ', '_'): f['value']
                             for f in extracted_fields if f.get('value')}

        # Load and fill template
        template = load_template(template_name)
        filled = fill_template(template, template_fields)

        return jsonify({
            'success': True,
            'latex': filled,
            'mapped_fields': template_fields
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/field-mapping/<template_name>', methods=['GET'])
def get_field_mapping(template_name):
    """Get the field mapping for a specific template."""
    if template_name == 'G2210-11':
        return jsonify({
            'template': template_name,
            'fields': list(G2210_FIELD_MAPPING.keys()),
            'mapping': G2210_FIELD_MAPPING
        })
    else:
        return jsonify({'error': 'Unknown template'}), 404


if __name__ == '__main__':
    # Use FLASK_PORT to avoid conflict with Railway's PORT variable
    # which is used by the frontend static file server
    port = int(os.environ.get('FLASK_PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)
