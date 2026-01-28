#!/usr/bin/env python3
"""
Tests for fill_pdf.py - PDF Form Filler utility

Run with: pytest tests/fill_pdf_test.py -v
"""

import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch, mock_open

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from fill_pdf import extract_fields, fill_pdf, main


class TestExtractFields:
    """Tests for the extract_fields function"""

    def test_extract_fields_returns_empty_for_no_fields(self):
        """Should return empty list when PDF has no form fields"""
        with patch('fill_pdf.PdfReader') as mock_reader:
            mock_reader.return_value.get_fields.return_value = None

            result = extract_fields('test.pdf')

            assert result == []

    def test_extract_fields_returns_field_info(self):
        """Should return list of field info dicts"""
        mock_fields = {
            'txtName': {'/FT': '/Tx', '/V': 'John'},
            'txtDate': {'/FT': '/Tx', '/V': '2025-01-28'}
        }

        with patch('fill_pdf.PdfReader') as mock_reader:
            mock_reader.return_value.get_fields.return_value = mock_fields

            result = extract_fields('test.pdf')

            assert len(result) == 2
            assert result[0]['field_id'] == 'txtName'
            assert result[0]['type'] == '/Tx'
            assert result[0]['value'] == 'John'

    def test_extract_fields_handles_missing_type(self):
        """Should handle fields without /FT type"""
        mock_fields = {
            'field1': {'/V': 'value1'}  # No /FT
        }

        with patch('fill_pdf.PdfReader') as mock_reader:
            mock_reader.return_value.get_fields.return_value = mock_fields

            result = extract_fields('test.pdf')

            assert result[0]['type'] == ''

    def test_extract_fields_handles_missing_value(self):
        """Should handle fields without /V value"""
        mock_fields = {
            'field1': {'/FT': '/Tx'}  # No /V
        }

        with patch('fill_pdf.PdfReader') as mock_reader:
            mock_reader.return_value.get_fields.return_value = mock_fields

            result = extract_fields('test.pdf')

            assert result[0]['value'] == ''

    def test_extract_fields_raises_on_invalid_pdf(self):
        """Should raise exception for invalid PDF file"""
        with patch('fill_pdf.PdfReader') as mock_reader:
            mock_reader.side_effect = Exception('Invalid PDF')

            with pytest.raises(Exception, match='Invalid PDF'):
                extract_fields('invalid.pdf')


class TestFillPdf:
    """Tests for the fill_pdf function"""

    def test_fill_pdf_writes_output_file(self):
        """Should create output PDF file"""
        with patch('fill_pdf.PdfReader') as mock_reader, \
             patch('fill_pdf.PdfWriter') as mock_writer, \
             patch('builtins.open', mock_open()) as mock_file:

            mock_writer_instance = MagicMock()
            mock_writer.return_value = mock_writer_instance
            mock_writer_instance.pages = [MagicMock()]

            fill_pdf('input.pdf', {'field1': 'value1'}, 'output.pdf')

            mock_file.assert_called_once_with('output.pdf', 'wb')
            mock_writer_instance.write.assert_called_once()

    def test_fill_pdf_appends_reader_to_writer(self):
        """Should append input PDF to writer"""
        with patch('fill_pdf.PdfReader') as mock_reader, \
             patch('fill_pdf.PdfWriter') as mock_writer, \
             patch('builtins.open', mock_open()):

            mock_reader_instance = MagicMock()
            mock_reader.return_value = mock_reader_instance
            mock_writer_instance = MagicMock()
            mock_writer.return_value = mock_writer_instance
            mock_writer_instance.pages = [MagicMock()]

            fill_pdf('input.pdf', {}, 'output.pdf')

            mock_writer_instance.append.assert_called_once_with(mock_reader_instance)

    def test_fill_pdf_updates_all_pages(self):
        """Should update form fields on all pages"""
        with patch('fill_pdf.PdfReader'), \
             patch('fill_pdf.PdfWriter') as mock_writer, \
             patch('builtins.open', mock_open()):

            mock_writer_instance = MagicMock()
            mock_writer.return_value = mock_writer_instance
            # Simulate 3 pages
            mock_pages = [MagicMock(), MagicMock(), MagicMock()]
            mock_writer_instance.pages = mock_pages

            field_values = {'field1': 'value1'}
            fill_pdf('input.pdf', field_values, 'output.pdf')

            assert mock_writer_instance.update_page_form_field_values.call_count == 3

    def test_fill_pdf_passes_field_values(self):
        """Should pass correct field values to update method"""
        with patch('fill_pdf.PdfReader'), \
             patch('fill_pdf.PdfWriter') as mock_writer, \
             patch('builtins.open', mock_open()):

            mock_writer_instance = MagicMock()
            mock_writer.return_value = mock_writer_instance
            mock_page = MagicMock()
            mock_writer_instance.pages = [mock_page]

            field_values = {'txtName': 'John Doe', 'txtDate': '2025-01-28'}
            fill_pdf('input.pdf', field_values, 'output.pdf')

            mock_writer_instance.update_page_form_field_values.assert_called_with(
                mock_page,
                field_values
            )


class TestMain:
    """Tests for the main CLI function"""

    def test_main_extraction_mode(self, capsys):
        """Should extract and print fields in --extract mode"""
        test_fields = [{'field_id': 'test', 'type': '/Tx', 'value': ''}]

        with patch.object(sys, 'argv', ['fill_pdf.py', '--extract', 'input.pdf']), \
             patch('fill_pdf.extract_fields', return_value=test_fields) as mock_extract:

            main()

            mock_extract.assert_called_once_with('input.pdf')
            captured = capsys.readouterr()
            output = json.loads(captured.out)
            assert output == test_fields

    def test_main_fill_mode_with_dict_json(self, capsys):
        """Should fill PDF with dict-format JSON"""
        json_data = {'field1': 'value1', 'field2': 'value2'}

        with patch.object(sys, 'argv', ['fill_pdf.py', 'in.pdf', 'values.json', 'out.pdf']), \
             patch('builtins.open', mock_open(read_data=json.dumps(json_data))), \
             patch('fill_pdf.fill_pdf') as mock_fill:

            main()

            mock_fill.assert_called_once_with('in.pdf', json_data, 'out.pdf')
            captured = capsys.readouterr()
            assert 'erfolgreich' in captured.out

    def test_main_fill_mode_with_list_json(self, capsys):
        """Should convert list-format JSON to dict and fill PDF"""
        json_list = [
            {'field_id': 'field1', 'value': 'value1'},
            {'field_id': 'field2', 'value': 'value2'}
        ]
        expected_dict = {'field1': 'value1', 'field2': 'value2'}

        with patch.object(sys, 'argv', ['fill_pdf.py', 'in.pdf', 'values.json', 'out.pdf']), \
             patch('builtins.open', mock_open(read_data=json.dumps(json_list))), \
             patch('fill_pdf.fill_pdf') as mock_fill:

            main()

            mock_fill.assert_called_once_with('in.pdf', expected_dict, 'out.pdf')

    def test_main_shows_usage_on_wrong_args(self, capsys):
        """Should print usage and exit with code 1 on wrong arguments"""
        with patch.object(sys, 'argv', ['fill_pdf.py', 'only_one_arg']):
            with pytest.raises(SystemExit) as exc_info:
                main()

            assert exc_info.value.code == 1
            captured = capsys.readouterr()
            assert 'Usage:' in captured.out

    def test_main_shows_usage_on_no_args(self, capsys):
        """Should print usage when no arguments provided"""
        with patch.object(sys, 'argv', ['fill_pdf.py']):
            with pytest.raises(SystemExit) as exc_info:
                main()

            assert exc_info.value.code == 1


class TestIntegration:
    """Integration tests using real temporary files"""

    def test_fill_pdf_with_real_temporary_files(self):
        """Integration test with actual file operations"""
        # This test requires pypdf to be installed
        # Skip if not available
        pytest.importorskip('pypdf')

        from pypdf import PdfWriter

        # Create a simple PDF with form fields
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, 'input.pdf')
            output_path = os.path.join(tmpdir, 'output.pdf')

            # Create minimal test PDF
            writer = PdfWriter()
            writer.add_blank_page(width=612, height=792)
            with open(input_path, 'wb') as f:
                writer.write(f)

            # PDFs without AcroForm will raise an error when trying to fill
            # This is expected behavior from pypdf
            from pypdf.errors import PyPdfError
            with pytest.raises(PyPdfError):
                fill_pdf(input_path, {}, output_path)

    def test_extract_fields_with_real_pdf(self):
        """Integration test for field extraction"""
        pytest.importorskip('pypdf')

        from pypdf import PdfWriter

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, 'test.pdf')

            # Create PDF without form fields
            writer = PdfWriter()
            writer.add_blank_page(width=612, height=792)
            with open(pdf_path, 'wb') as f:
                writer.write(f)

            result = extract_fields(pdf_path)

            assert result == []


class TestEdgeCases:
    """Edge case tests"""

    def test_extract_fields_with_empty_string_value(self):
        """Should handle fields with empty string values"""
        mock_fields = {
            'emptyField': {'/FT': '/Tx', '/V': ''}
        }

        with patch('fill_pdf.PdfReader') as mock_reader:
            mock_reader.return_value.get_fields.return_value = mock_fields

            result = extract_fields('test.pdf')

            assert result[0]['value'] == ''

    def test_fill_pdf_with_empty_dict(self):
        """Should handle empty field values dict"""
        with patch('fill_pdf.PdfReader'), \
             patch('fill_pdf.PdfWriter') as mock_writer, \
             patch('builtins.open', mock_open()):

            mock_writer_instance = MagicMock()
            mock_writer.return_value = mock_writer_instance
            mock_writer_instance.pages = [MagicMock()]

            # Should not raise
            fill_pdf('input.pdf', {}, 'output.pdf')

            mock_writer_instance.update_page_form_field_values.assert_called_once()

    def test_main_with_unicode_filename(self, capsys):
        """Should handle unicode characters in filenames"""
        with patch.object(sys, 'argv', ['fill_pdf.py', '--extract', 'über.pdf']), \
             patch('fill_pdf.extract_fields', return_value=[]) as mock_extract:

            main()

            mock_extract.assert_called_once_with('über.pdf')

    def test_fill_pdf_with_special_characters_in_values(self):
        """Should handle special characters in field values"""
        with patch('fill_pdf.PdfReader'), \
             patch('fill_pdf.PdfWriter') as mock_writer, \
             patch('builtins.open', mock_open()):

            mock_writer_instance = MagicMock()
            mock_writer.return_value = mock_writer_instance
            mock_writer_instance.pages = [MagicMock()]

            special_values = {
                'field1': 'Müller, François & José',
                'field2': '日本語テスト',
                'field3': '<script>alert("xss")</script>'
            }

            # Should not raise
            fill_pdf('input.pdf', special_values, 'output.pdf')

    def test_main_with_json_encoding_utf8(self, capsys):
        """Should handle UTF-8 encoded JSON files"""
        json_data = {'name': 'Müller', 'city': '東京'}

        with patch.object(sys, 'argv', ['fill_pdf.py', 'in.pdf', 'values.json', 'out.pdf']), \
             patch('builtins.open', mock_open(read_data=json.dumps(json_data, ensure_ascii=False))), \
             patch('fill_pdf.fill_pdf') as mock_fill:

            main()

            mock_fill.assert_called_once()
            call_args = mock_fill.call_args[0]
            assert call_args[1]['name'] == 'Müller'
            assert call_args[1]['city'] == '東京'
