import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewPanel } from '../../components/ReviewPanel';
import { ExtractedField, FileData } from '../../types';

// Mock pdfService
vi.mock('../../services/pdfService', () => ({
  createFilledPdf: vi.fn().mockResolvedValue(new Uint8Array([0, 1, 2, 3]))
}));

// Mock jspdf
vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(() => ({
    text: vi.fn(),
    save: vi.fn()
  }))
}));

describe('ReviewPanel', () => {
  const mockFields: ExtractedField[] = [
    {
      key: 'firstName',
      label: 'First Name',
      value: 'John',
      validation: { status: 'VALID' },
      isVerified: false
    },
    {
      key: 'lastName',
      label: 'Last Name',
      value: 'Doe',
      validation: { status: 'WARNING', message: 'Name might be incomplete', suggestion: 'Doe Jr.' },
      isVerified: false
    },
    {
      key: 'date',
      label: 'Date',
      value: '2025-01-28',
      validation: { status: 'INVALID', message: 'Invalid date format' },
      isVerified: false
    }
  ];

  const mockFormFile: FileData = {
    file: new File([''], 'form.pdf', { type: 'application/pdf' }),
    previewUrl: null,
    base64: 'formbase64',
    type: 'application/pdf'
  };

  const mockSourceFile: FileData = {
    file: new File([''], 'source.pdf', { type: 'application/pdf' }),
    previewUrl: null,
    base64: 'sourcebase64',
    type: 'application/pdf'
  };

  const defaultProps = {
    fields: mockFields,
    formFile: mockFormFile,
    sourceFile: mockSourceFile,
    summary: 'Processed medical document',
    isFillablePdf: true,
    onReset: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('rendering', () => {
    it('should render summary text', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByText('Processed medical document')).toBeInTheDocument();
    });

    it('should render all fields', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByText('First Name')).toBeInTheDocument();
      expect(screen.getByText('Last Name')).toBeInTheDocument();
      expect(screen.getByText('Date')).toBeInTheDocument();
    });

    it('should render all field values', () => {
      render(<ReviewPanel {...defaultProps} />);
      const inputs = screen.getAllByRole('textbox');
      const values = inputs.map(input => (input as HTMLInputElement).value);
      expect(values).toContain('John');
      expect(values).toContain('Doe');
      expect(values).toContain('2025-01-28');
    });

    it('should display warning messages for fields with warnings', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByText('Name might be incomplete')).toBeInTheDocument();
    });

    it('should display error messages for invalid fields', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByText('Invalid date format')).toBeInTheDocument();
    });

    it('should show suggestion button when available', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByText(/Accept Fix: "Doe Jr\."/)).toBeInTheDocument();
    });

    it('should show verification progress', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByText('0 / 3 Verified')).toBeInTheDocument();
      expect(screen.getByText('0 of 3 fields verified')).toBeInTheDocument();
    });

    it('should show Visual Overlay Mode indicator when not fillable', () => {
      render(<ReviewPanel {...defaultProps} isFillablePdf={false} />);
      expect(screen.getAllByText('Visual Overlay Mode').length).toBeGreaterThan(0);
    });

    it('should not show Visual Overlay Mode indicator when fillable', () => {
      render(<ReviewPanel {...defaultProps} isFillablePdf={true} />);
      expect(screen.queryByText('Visual Overlay Mode')).not.toBeInTheDocument();
    });
  });

  describe('field sorting', () => {
    it('should sort attention-needed fields before valid fields', () => {
      render(<ReviewPanel {...defaultProps} />);
      const inputs = screen.getAllByRole('textbox');
      // The last input should be the VALID field (John)
      expect(inputs[inputs.length - 1]).toHaveValue('John');
    });

    it('should sort verified fields after unverified', () => {
      const fieldsWithVerified: ExtractedField[] = [
        { key: 'a', label: 'A', value: 'val1', validation: { status: 'VALID' }, isVerified: true },
        { key: 'b', label: 'B', value: 'val2', validation: { status: 'VALID' }, isVerified: false }
      ];

      render(<ReviewPanel {...defaultProps} fields={fieldsWithVerified} />);
      const inputs = screen.getAllByRole('textbox');
      // Unverified first
      expect(inputs[0]).toHaveValue('val2');
      expect(inputs[1]).toHaveValue('val1');
    });
  });

  describe('field editing', () => {
    it('should update field value when edited', async () => {
      const user = userEvent.setup();
      render(<ReviewPanel {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      const johnInput = inputs.find(input => (input as HTMLInputElement).value === 'John');

      await user.clear(johnInput!);
      await user.type(johnInput!, 'Jane');

      expect(johnInput).toHaveValue('Jane');
    });

    it('should auto-verify field when manually edited', async () => {
      const user = userEvent.setup();
      render(<ReviewPanel {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      const doeInput = inputs.find(input => (input as HTMLInputElement).value === 'Doe');

      await user.clear(doeInput!);
      await user.type(doeInput!, 'Smith');

      await waitFor(() => {
        expect(screen.getAllByText('VERIFIED').length).toBeGreaterThan(0);
      });
    });
  });

  describe('verification toggle', () => {
    it('should toggle verification status when checkbox clicked', async () => {
      const user = userEvent.setup();
      render(<ReviewPanel {...defaultProps} />);

      const verifyButtons = screen.getAllByTitle('Mark as verified');
      await user.click(verifyButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('1 / 3 Verified')).toBeInTheDocument();
      });
    });

    it('should update progress when field is verified', async () => {
      const user = userEvent.setup();
      render(<ReviewPanel {...defaultProps} />);

      const verifyButtons = screen.getAllByTitle('Mark as verified');
      await user.click(verifyButtons[0]);
      await user.click(verifyButtons[1]);

      await waitFor(() => {
        expect(screen.getByText('2 / 3 Verified')).toBeInTheDocument();
      });
    });
  });

  describe('suggestion application', () => {
    it('should apply suggestion when Accept Fix button is clicked', async () => {
      const user = userEvent.setup();
      render(<ReviewPanel {...defaultProps} />);

      const acceptButton = screen.getByText(/Accept Fix: "Doe Jr\."/);
      await user.click(acceptButton);

      await waitFor(() => {
        const inputs = screen.getAllByRole('textbox');
        const updatedInput = inputs.find(input => (input as HTMLInputElement).value === 'Doe Jr.');
        expect(updatedInput).toBeInTheDocument();
      });
    });
  });

  describe('filtering', () => {
    it('should show all fields when ALL filter is selected', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByText('First Name')).toBeInTheDocument();
      expect(screen.getByText('Last Name')).toBeInTheDocument();
      expect(screen.getByText('Date')).toBeInTheDocument();
    });

    it('should filter to only attention-needed fields when ATTENTION filter is selected', async () => {
      const user = userEvent.setup();
      render(<ReviewPanel {...defaultProps} />);

      const attentionButton = screen.getByText(/Needs Review/);
      await user.click(attentionButton);

      expect(screen.getByText('Last Name')).toBeInTheDocument();
      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.queryByText('First Name')).not.toBeInTheDocument();
    });

    it('should show correct count in filter buttons', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByText('All Fields (3)')).toBeInTheDocument();
      expect(screen.getByText(/Needs Review \(2\)/)).toBeInTheDocument();
    });
  });

  describe('reset functionality', () => {
    it('should call onReset when Start Over button is clicked', async () => {
      const onReset = vi.fn();
      const user = userEvent.setup();
      render(<ReviewPanel {...defaultProps} onReset={onReset} />);

      const startOverButton = screen.getByText('Start Over');
      await user.click(startOverButton);

      expect(onReset).toHaveBeenCalled();
    });
  });

  describe('preview generation', () => {
    it('should use image preview URL when form is not PDF', async () => {
      const imageFormFile: FileData = {
        file: new File([''], 'form.png', { type: 'image/png' }),
        previewUrl: 'data:image/png;base64,imagedata',
        base64: 'imagedata',
        type: 'image/png'
      };

      render(<ReviewPanel {...defaultProps} formFile={imageFormFile} />);

      // Wait for the useEffect to set the preview URL
      await waitFor(() => {
        expect(screen.getByAltText('Form Document')).toBeInTheDocument();
      });
    });
  });

  describe('source context', () => {
    it('should display source context when available and field not verified', () => {
      const fieldsWithContext: ExtractedField[] = [
        {
          key: 'name',
          label: 'Name',
          value: 'John',
          sourceContext: 'Patient name: John Smith',
          validation: { status: 'WARNING', message: 'Check name' },
          isVerified: false
        }
      ];

      render(<ReviewPanel {...defaultProps} fields={fieldsWithContext} />);
      expect(screen.getByText(/"Patient name: John Smith"/)).toBeInTheDocument();
    });

    it('should hide source context when field is verified', async () => {
      const user = userEvent.setup();
      const fieldsWithContext: ExtractedField[] = [
        {
          key: 'name',
          label: 'Name',
          value: 'John',
          sourceContext: 'Patient name: John Smith',
          validation: { status: 'WARNING', message: 'Check name' },
          isVerified: false
        }
      ];

      render(<ReviewPanel {...defaultProps} fields={fieldsWithContext} />);

      const verifyButton = screen.getByTitle('Mark as verified');
      await user.click(verifyButton);

      await waitFor(() => {
        expect(screen.queryByText(/"Patient name: John Smith"/)).not.toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('should not show Needs Review button when all fields are valid', () => {
      const allValidFields: ExtractedField[] = [
        { key: 'a', label: 'A', value: 'val1', validation: { status: 'VALID' }, isVerified: true }
      ];

      render(<ReviewPanel {...defaultProps} fields={allValidFields} />);
      expect(screen.queryByText(/Needs Review/)).not.toBeInTheDocument();
    });
  });

  describe('progress indicator', () => {
    it('should show Ready to Download when all fields verified', () => {
      const allVerifiedFields: ExtractedField[] = [
        { key: 'a', label: 'A', value: 'val1', validation: { status: 'VALID' }, isVerified: true }
      ];

      render(<ReviewPanel {...defaultProps} fields={allVerifiedFields} />);
      expect(screen.getByText('Ready to Download')).toBeInTheDocument();
    });

    it('should show Review in progress when not all fields verified', () => {
      render(<ReviewPanel {...defaultProps} />);
      expect(screen.getByText('Review in progress')).toBeInTheDocument();
    });
  });

  describe('field key fallback', () => {
    it('should display key as label fallback when label is missing', () => {
      const fieldsWithoutLabel: ExtractedField[] = [
        { key: 'fieldKey', label: '', value: 'test', validation: { status: 'VALID' }, isVerified: false }
      ];

      render(<ReviewPanel {...defaultProps} fields={fieldsWithoutLabel} />);
      expect(screen.getByText('fieldKey')).toBeInTheDocument();
    });

    it('should display Unknown Field when both key and label are missing', () => {
      const fieldsWithoutBoth: ExtractedField[] = [
        { label: '', value: 'test', validation: { status: 'VALID' }, isVerified: false }
      ];

      render(<ReviewPanel {...defaultProps} fields={fieldsWithoutBoth} />);
      expect(screen.getByText('Unknown Field')).toBeInTheDocument();
    });
  });
});
