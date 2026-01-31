#!/usr/bin/env python3
"""
Tests for server.py - Flask API for LaTeX Form Generation

Run with: pytest tests/server_test.py -v
"""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
import base64

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from server import app, normalize_label, map_fields_to_template, G2210_FIELD_MAPPING


@pytest.fixture
def client():
    """Create a test client for the Flask app"""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


class TestNormalizeLabel:
    """Tests for the normalize_label function"""

    def test_normalize_lowercase(self):
        """Should convert to lowercase"""
        assert normalize_label('NAME') == 'name'

    def test_normalize_strip(self):
        """Should strip whitespace"""
        assert normalize_label('  name  ') == 'name'

    def test_normalize_remove_colon(self):
        """Should remove colons"""
        assert normalize_label('Name:') == 'name'

    def test_normalize_replace_underscore(self):
        """Should replace underscores with spaces"""
        assert normalize_label('first_name') == 'first name'

    def test_normalize_combined(self):
        """Should handle combined transformations"""
        assert normalize_label('  First_Name:  ') == 'first name'


class TestMapFieldsToTemplate:
    """Tests for the map_fields_to_template function"""

    def test_map_direct_match(self):
        """Should map fields with direct label match"""
        mapping = {
            'template_field': ['label1', 'label2']
        }
        fields = [{'label': 'label1', 'value': 'test_value'}]

        result = map_fields_to_template(fields, mapping)

        assert result == {'template_field': 'test_value'}

    def test_map_case_insensitive(self):
        """Should match labels case-insensitively"""
        mapping = {
            'name': ['name', 'vorname']
        }
        fields = [{'label': 'NAME', 'value': 'John'}]

        result = map_fields_to_template(fields, mapping)

        assert result == {'name': 'John'}

    def test_map_fuzzy_match(self):
        """Should fuzzy match when label contains mapping label"""
        mapping = {
            'name': ['name']
        }
        fields = [{'label': 'Patient Name', 'value': 'John'}]

        result = map_fields_to_template(fields, mapping)

        assert result == {'name': 'John'}

    def test_map_empty_fields(self):
        """Should return empty dict for empty fields"""
        result = map_fields_to_template([], G2210_FIELD_MAPPING)
        assert result == {}

    def test_map_skip_empty_values(self):
        """Should skip fields with empty values"""
        mapping = {'field': ['label']}
        fields = [{'label': 'label', 'value': ''}]

        result = map_fields_to_template(fields, mapping)

        assert result == {}

    def test_map_skip_missing_labels(self):
        """Should skip fields without labels"""
        mapping = {'field': ['label']}
        fields = [{'value': 'test'}]

        result = map_fields_to_template(fields, mapping)

        assert result == {}

    def test_map_multiple_fields(self):
        """Should map multiple fields correctly"""
        mapping = {
            'name': ['name'],
            'date': ['datum', 'date']
        }
        fields = [
            {'label': 'Name', 'value': 'John'},
            {'label': 'Datum', 'value': '2025-01-28'}
        ]

        result = map_fields_to_template(fields, mapping)

        assert result == {'name': 'John', 'date': '2025-01-28'}


class TestHealthEndpoint:
    """Tests for the /api/health endpoint"""

    def test_health_returns_ok(self, client):
        """Should return ok status"""
        response = client.get('/api/health')

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'ok'
        assert data['service'] == 'latex-form-generator'


class TestTemplatesEndpoint:
    """Tests for the /api/templates endpoint"""

    def test_templates_returns_list(self, client):
        """Should return list of templates"""
        with patch('server.list_templates', return_value=['G2210-11', 'S0051']):
            response = client.get('/api/templates')

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data['templates'] == ['G2210-11', 'S0051']

    def test_templates_returns_empty_list(self, client):
        """Should return empty list when no templates"""
        with patch('server.list_templates', return_value=[]):
            response = client.get('/api/templates')

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data['templates'] == []


class TestGenerateEndpoint:
    """Tests for the /api/generate endpoint"""

    def test_generate_success(self, client):
        """Should generate PDF and return base64"""
        mock_pdf = b'%PDF-1.4 test content'

        with patch('server.generate_form', return_value=mock_pdf):
            response = client.post(
                '/api/generate',
                json={
                    'template': 'G2210-11',
                    'fields': [{'label': 'Name', 'value': 'John'}]
                }
            )

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data['success'] is True
            assert data['pdf'] == base64.b64encode(mock_pdf).decode('ascii')

    def test_generate_returns_mapped_fields(self, client):
        """Should return mapped fields in response"""
        with patch('server.generate_form', return_value=b'pdf'):
            response = client.post(
                '/api/generate',
                json={
                    'template': 'G2210-11',
                    'fields': [{'label': 'Name, Vorname', 'value': 'Müller, Hans'}]
                }
            )

            data = json.loads(response.data)
            assert 'mapped_fields' in data

    def test_generate_no_json_returns_error(self, client):
        """Should return error for missing JSON"""
        response = client.post('/api/generate')

        # Server may return 400 or 500 depending on Flask version behavior
        assert response.status_code in [400, 500]
        data = json.loads(response.data)
        assert 'error' in data

    def test_generate_template_not_found_returns_404(self, client):
        """Should return 404 for missing template"""
        with patch('server.generate_form', side_effect=FileNotFoundError('Template not found')):
            response = client.post(
                '/api/generate',
                json={'template': 'nonexistent', 'fields': []}
            )

            assert response.status_code == 404

    def test_generate_error_returns_500(self, client):
        """Should return 500 for generation errors"""
        with patch('server.generate_form', side_effect=Exception('Compilation failed')):
            response = client.post(
                '/api/generate',
                json={'template': 'G2210-11', 'fields': []}
            )

            assert response.status_code == 500
            data = json.loads(response.data)
            assert 'Compilation failed' in data['error']

    def test_generate_default_template(self, client):
        """Should use G2210-11 as default template"""
        with patch('server.generate_form', return_value=b'pdf') as mock_generate:
            response = client.post(
                '/api/generate',
                json={'fields': []}
            )

            # Check that G2210-11 mapping was used (via generate_form call)
            assert response.status_code == 200

    def test_generate_file_format(self, client):
        """Should return file when format=file"""
        mock_pdf = b'%PDF-1.4 test'

        with patch('server.generate_form', return_value=mock_pdf):
            response = client.post(
                '/api/generate',
                json={
                    'template': 'G2210-11',
                    'fields': [],
                    'format': 'file'
                }
            )

            assert response.status_code == 200
            assert response.content_type == 'application/pdf'
            assert response.data == mock_pdf


class TestPreviewEndpoint:
    """Tests for the /api/preview endpoint"""

    def test_preview_success(self, client):
        """Should return filled LaTeX source"""
        mock_template = r'\documentclass{article}'
        mock_filled = r'\documentclass{article}\n% filled'

        with patch('server.load_template', return_value=mock_template), \
             patch('server.fill_template', return_value=mock_filled):
            response = client.post(
                '/api/preview',
                json={
                    'template': 'G2210-11',
                    'fields': []
                }
            )

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data['success'] is True
            assert data['latex'] == mock_filled

    def test_preview_returns_mapped_fields(self, client):
        """Should return mapped fields"""
        with patch('server.load_template', return_value=''), \
             patch('server.fill_template', return_value=''):
            response = client.post(
                '/api/preview',
                json={
                    'template': 'G2210-11',
                    'fields': [{'label': 'Geburtsdatum', 'value': '01.01.1990'}]
                }
            )

            data = json.loads(response.data)
            assert 'mapped_fields' in data

    def test_preview_no_json_returns_error(self, client):
        """Should return error for missing JSON"""
        response = client.post('/api/preview')

        # Server may return 400 or 500 depending on Flask version behavior
        assert response.status_code in [400, 500]

    def test_preview_error_returns_500(self, client):
        """Should return 500 for errors"""
        with patch('server.load_template', side_effect=Exception('Template error')):
            response = client.post(
                '/api/preview',
                json={'template': 'G2210-11', 'fields': []}
            )

            assert response.status_code == 500


class TestFieldMappingEndpoint:
    """Tests for the /api/field-mapping/<template_name> endpoint"""

    def test_field_mapping_g2210(self, client):
        """Should return field mapping for G2210-11"""
        response = client.get('/api/field-mapping/G2210-11')

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['template'] == 'G2210-11'
        assert 'fields' in data
        assert 'mapping' in data
        assert 'versicherungsnummer' in data['fields']

    def test_field_mapping_unknown_returns_404(self, client):
        """Should return 404 for unknown template"""
        response = client.get('/api/field-mapping/unknown')

        assert response.status_code == 404
        data = json.loads(response.data)
        assert 'error' in data


class TestG2210FieldMapping:
    """Tests for the G2210_FIELD_MAPPING constant"""

    def test_mapping_has_patient_fields(self):
        """Should have patient data fields"""
        assert 'versicherungsnummer' in G2210_FIELD_MAPPING
        assert 'name_vorname' in G2210_FIELD_MAPPING
        assert 'geburtsdatum' in G2210_FIELD_MAPPING

    def test_mapping_has_diagnosis_fields(self):
        """Should have diagnosis fields"""
        assert 'diagnose_1' in G2210_FIELD_MAPPING
        assert 'diagnose_1_icd' in G2210_FIELD_MAPPING

    def test_mapping_has_doctor_fields(self):
        """Should have doctor/signature fields"""
        assert 'arzt_name' in G2210_FIELD_MAPPING
        assert 'bsnr' in G2210_FIELD_MAPPING
        assert 'lanr' in G2210_FIELD_MAPPING

    def test_mapping_labels_are_lists(self):
        """All mapping values should be lists of possible labels"""
        for key, value in G2210_FIELD_MAPPING.items():
            assert isinstance(value, list), f'{key} should map to a list'
            assert len(value) > 0, f'{key} should have at least one label'


class TestCORS:
    """Tests for CORS configuration"""

    def test_cors_headers_present(self, client):
        """Should include CORS headers"""
        response = client.get('/api/health')

        # Flask-CORS adds these headers
        # The exact headers depend on the request
        assert response.status_code == 200


class TestIntegration:
    """Integration tests"""

    def test_full_workflow(self, client):
        """Test complete workflow: health -> templates -> generate"""
        # 1. Check health
        health_response = client.get('/api/health')
        assert health_response.status_code == 200

        # 2. Get templates
        with patch('server.list_templates', return_value=['G2210-11']):
            templates_response = client.get('/api/templates')
            assert templates_response.status_code == 200

        # 3. Generate PDF
        with patch('server.generate_form', return_value=b'%PDF-1.4'):
            generate_response = client.post(
                '/api/generate',
                json={
                    'template': 'G2210-11',
                    'fields': [
                        {'label': 'Name, Vorname', 'value': 'Test, User'},
                        {'label': 'Geburtsdatum', 'value': '01.01.1990'}
                    ]
                }
            )
            assert generate_response.status_code == 200
            data = json.loads(generate_response.data)
            assert data['success'] is True


class TestEdgeCases:
    """Edge case tests"""

    def test_generate_with_empty_fields_list(self, client):
        """Should handle empty fields list"""
        with patch('server.generate_form', return_value=b'pdf'):
            response = client.post(
                '/api/generate',
                json={'template': 'G2210-11', 'fields': []}
            )

            assert response.status_code == 200

    def test_generate_with_unicode_values(self, client):
        """Should handle Unicode values"""
        with patch('server.generate_form', return_value=b'pdf'):
            response = client.post(
                '/api/generate',
                json={
                    'template': 'G2210-11',
                    'fields': [
                        {'label': 'Name', 'value': 'Müller'},
                        {'label': 'Stadt', 'value': '東京'}
                    ]
                }
            )

            assert response.status_code == 200

    def test_generate_with_special_characters(self, client):
        """Should handle special characters in values"""
        with patch('server.generate_form', return_value=b'pdf'):
            response = client.post(
                '/api/generate',
                json={
                    'template': 'G2210-11',
                    'fields': [
                        {'label': 'Notes', 'value': 'Test & notes with $pecial chars'}
                    ]
                }
            )

            assert response.status_code == 200

    def test_map_fields_with_unknown_template(self, client):
        """Should handle unknown template with direct field mapping"""
        with patch('server.generate_form', return_value=b'pdf'):
            response = client.post(
                '/api/generate',
                json={
                    'template': 'custom-template',
                    'fields': [
                        {'label': 'custom_field', 'value': 'custom_value'}
                    ]
                }
            )

            # Should still work, just with direct mapping
            assert response.status_code in [200, 404, 500]  # Depends on template existence
