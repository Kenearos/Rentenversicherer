#!/usr/bin/env python3
"""
LaTeX Form Generation Service

This service generates filled PDF forms using LaTeX templates.
It takes extracted field data and compiles a LaTeX template into a PDF.
"""

import json
import os
import subprocess
import tempfile
import base64
import sys
import shutil
from pathlib import Path
from typing import Dict, Any, Optional

# Template directory
TEMPLATE_DIR = Path(__file__).parent / "templates"


def escape_latex(text: str) -> str:
    """Escape special LaTeX characters in text."""
    if not text:
        return ""

    # LaTeX special characters that need escaping
    replacements = [
        ('\\', r'\textbackslash{}'),
        ('&', r'\&'),
        ('%', r'\%'),
        ('$', r'\$'),
        ('#', r'\#'),
        ('_', r'\_'),
        ('{', r'\{'),
        ('}', r'\}'),
        ('~', r'\textasciitilde{}'),
        ('^', r'\textasciicircum{}'),
    ]

    result = text
    for old, new in replacements:
        result = result.replace(old, new)

    return result


def checkbox(value: str) -> str:
    """Return LaTeX checkbox symbol based on value."""
    if not value:
        return r'$\square$'

    val_lower = value.lower().strip()
    if val_lower in ('true', 'yes', 'ja', 'x', '1', 'checked'):
        return r'$\boxtimes$'
    return r'$\square$'


def format_date(date_str: str) -> str:
    """Ensure date is in DD.MM.YYYY format."""
    if not date_str:
        return ""

    # Already in correct format
    if len(date_str) == 10 and date_str[2] == '.' and date_str[5] == '.':
        return escape_latex(date_str)

    # Try to parse ISO format
    try:
        from datetime import datetime
        for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y']:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.strftime('%d.%m.%Y')
            except ValueError:
                continue
    except:
        pass

    return escape_latex(date_str)


def load_template(template_name: str) -> str:
    """Load a LaTeX template file."""
    template_path = TEMPLATE_DIR / f"{template_name}.tex"

    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")

    return template_path.read_text(encoding='utf-8')


def fill_template(template: str, fields: Dict[str, Any]) -> str:
    """
    Fill a LaTeX template with field values.

    Fields can be accessed in template as:
    - {{field_name}} for escaped text values
    - {{field_name|raw}} for raw values (no escaping)
    - {{field_name|checkbox}} for checkbox symbols
    - {{field_name|date}} for date formatting
    """
    result = template

    # Process each field
    for key, value in fields.items():
        value_str = str(value) if value is not None else ""

        # Replace with different formatters
        # Raw (no escaping)
        result = result.replace(f'{{{{{key}|raw}}}}', value_str)
        # Checkbox
        result = result.replace(f'{{{{{key}|checkbox}}}}', checkbox(value_str))
        # Date
        result = result.replace(f'{{{{{key}|date}}}}', format_date(value_str))
        # Default (escaped)
        result = result.replace(f'{{{{{key}}}}}', escape_latex(value_str))

    # Clean up any remaining placeholders (unfilled fields)
    import re
    result = re.sub(r'\{\{[^}]+\}\}', '', result)

    return result


def compile_latex(latex_content: str, output_format: str = 'pdf') -> bytes:
    """
    Compile LaTeX content to PDF.

    Returns the PDF as bytes.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tex_file = Path(tmpdir) / "document.tex"
        tex_file.write_text(latex_content, encoding='utf-8')

        # Copy any additional files (images, etc.) if needed
        # For now, we just compile the main document

        # Run pdflatex twice (for references)
        for _ in range(2):
            result = subprocess.run(
                ['pdflatex', '-interaction=nonstopmode', '-output-directory', tmpdir, str(tex_file)],
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode != 0:
                # Check for common errors
                error_log = Path(tmpdir) / "document.log"
                if error_log.exists():
                    log_content = error_log.read_text(encoding='utf-8', errors='ignore')
                    # Extract error lines
                    errors = [line for line in log_content.split('\n') if line.startswith('!')]
                    if errors:
                        raise RuntimeError(f"LaTeX compilation failed: {'; '.join(errors[:3])}")
                raise RuntimeError(f"LaTeX compilation failed: {result.stderr[:500]}")

        pdf_file = Path(tmpdir) / "document.pdf"
        if not pdf_file.exists():
            raise RuntimeError("PDF file was not created")

        return pdf_file.read_bytes()


def generate_form(template_name: str, fields: Dict[str, Any]) -> bytes:
    """
    Generate a filled PDF form from a template and field data.

    Args:
        template_name: Name of the template (without .tex extension)
        fields: Dictionary of field names to values

    Returns:
        PDF content as bytes
    """
    template = load_template(template_name)
    filled = fill_template(template, fields)
    return compile_latex(filled)


def list_templates() -> list:
    """List available templates."""
    if not TEMPLATE_DIR.exists():
        return []

    return [f.stem for f in TEMPLATE_DIR.glob("*.tex")]


# CLI Interface
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='LaTeX Form Generation Service')
    parser.add_argument('command', choices=['generate', 'list', 'preview'],
                       help='Command to execute')
    parser.add_argument('--template', '-t', help='Template name')
    parser.add_argument('--fields', '-f', help='JSON string or file path with field data')
    parser.add_argument('--output', '-o', help='Output file path')

    args = parser.parse_args()

    if args.command == 'list':
        templates = list_templates()
        print(json.dumps(templates))

    elif args.command == 'preview':
        # Output the filled LaTeX source (for debugging)
        if not args.template or not args.fields:
            print("Error: --template and --fields required", file=sys.stderr)
            sys.exit(1)

        if args.fields.startswith('{'):
            fields = json.loads(args.fields)
        else:
            with open(args.fields, 'r') as f:
                fields = json.load(f)

        template = load_template(args.template)
        filled = fill_template(template, fields)
        print(filled)

    elif args.command == 'generate':
        if not args.template or not args.fields:
            print("Error: --template and --fields required", file=sys.stderr)
            sys.exit(1)

        # Parse fields
        if args.fields.startswith('{'):
            fields = json.loads(args.fields)
        else:
            with open(args.fields, 'r') as f:
                fields = json.load(f)

        try:
            pdf_bytes = generate_form(args.template, fields)

            if args.output:
                with open(args.output, 'wb') as f:
                    f.write(pdf_bytes)
                print(f"PDF written to {args.output}", file=sys.stderr)
            else:
                # Output base64 encoded PDF to stdout
                print(base64.b64encode(pdf_bytes).decode('ascii'))

        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
