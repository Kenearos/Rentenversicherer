import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { AppStatus, FileData, FormResponse } from '../types';

// Mock the services
vi.mock('../services/apiKeyService', () => ({
  getApiKey: vi.fn(() => 'AItest123'),
  setApiKey: vi.fn(),
  hasApiKey: vi.fn(() => true),
  clearApiKey: vi.fn(),
}));

vi.mock('../services/pdfService', () => ({
  getPdfFields: vi.fn(() => Promise.resolve([])),
  PdfFieldInfo: {},
}));

vi.mock('../services/geminiService', () => ({
  processDocuments: vi.fn(),
}));

// Mock the child components
vi.mock('../components/FileUpload', () => ({
  FileUpload: ({ label, onFileSelect, selectedFile }: any) => (
    <div data-testid={`file-upload-${label}`}>
      <span>{label}</span>
      {selectedFile && <span data-testid="file-selected">{selectedFile.file.name}</span>}
      <button
        data-testid={`select-file-${label}`}
        onClick={() => onFileSelect({
          file: new File(['test'], 'test.pdf', { type: 'application/pdf' }),
          previewUrl: null,
          base64: 'base64content',
          type: 'application/pdf'
        })}
      >
        Select File
      </button>
    </div>
  ),
}));

vi.mock('../components/ReviewPanel', () => ({
  ReviewPanel: ({ fields, summary, onReset }: any) => (
    <div data-testid="review-panel">
      <span data-testid="summary">{summary}</span>
      <span data-testid="fields-count">{fields.length} fields</span>
      <button data-testid="reset-button" onClick={onReset}>Reset</button>
    </div>
  ),
}));

vi.mock('../components/ApiKeyModal', () => ({
  ApiKeyModal: ({ isOpen, onSave, onClose }: any) => (
    isOpen ? (
      <div data-testid="api-key-modal">
        <button data-testid="save-key" onClick={() => onSave('AItest')}>Save</button>
        {onClose && <button data-testid="close-modal" onClick={onClose}>Close</button>}
      </div>
    ) : null
  ),
}));

// Import the mocked modules
import * as apiKeyService from '../services/apiKeyService';
import * as pdfService from '../services/pdfService';
import * as geminiService from '../services/geminiService';

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: user has API key
    vi.mocked(apiKeyService.hasApiKey).mockReturnValue(true);
    vi.mocked(apiKeyService.getApiKey).mockReturnValue('AItest123');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial rendering', () => {
    it('should render the app header with title', () => {
      render(<App />);

      expect(screen.getByText('AutoForm AI')).toBeInTheDocument();
    });

    it('should render the main heading', () => {
      render(<App />);

      expect(screen.getByText('Fill Forms Automatically with AI')).toBeInTheDocument();
    });

    it('should render two file upload components', () => {
      render(<App />);

      expect(screen.getByTestId('file-upload-Fillable PDF Form')).toBeInTheDocument();
      expect(screen.getByTestId('file-upload-Source Data')).toBeInTheDocument();
    });

    it('should render the analyze button', () => {
      render(<App />);

      expect(screen.getByText('Analyze & Fill')).toBeInTheDocument();
    });
  });

  describe('API key modal', () => {
    it('should show API key modal when no API key exists', () => {
      vi.mocked(apiKeyService.hasApiKey).mockReturnValue(false);

      render(<App />);

      expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
    });

    it('should not show API key modal when API key exists', () => {
      vi.mocked(apiKeyService.hasApiKey).mockReturnValue(true);

      render(<App />);

      expect(screen.queryByTestId('api-key-modal')).not.toBeInTheDocument();
    });

    it('should save API key when save is clicked', async () => {
      vi.mocked(apiKeyService.hasApiKey).mockReturnValue(false);
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByTestId('save-key'));

      expect(apiKeyService.setApiKey).toHaveBeenCalledWith('AItest');
    });

    it('should show settings button that opens API key modal', async () => {
      const user = userEvent.setup();

      render(<App />);

      // Find settings button by title
      const settingsButton = screen.getByTitle('API Key Einstellungen');
      await user.click(settingsButton);

      expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
    });
  });

  describe('analyze button state', () => {
    it('should disable analyze button when no files are selected', () => {
      render(<App />);

      const button = screen.getByText('Analyze & Fill').closest('button');
      expect(button).toBeDisabled();
    });

    it('should enable analyze button when both files are selected', async () => {
      const user = userEvent.setup();

      render(<App />);

      // Select both files
      await user.click(screen.getByTestId('select-file-Fillable PDF Form'));
      await user.click(screen.getByTestId('select-file-Source Data'));

      const button = screen.getByText('Analyze & Fill').closest('button');
      expect(button).not.toBeDisabled();
    });
  });

  describe('processing state', () => {
    it('should show processing UI when analyzing', async () => {
      const user = userEvent.setup();
      // Make processDocuments hang
      vi.mocked(geminiService.processDocuments).mockImplementation(
        () => new Promise(() => {})
      );

      render(<App />);

      // Select both files
      await user.click(screen.getByTestId('select-file-Fillable PDF Form'));
      await user.click(screen.getByTestId('select-file-Source Data'));

      // Click analyze
      await user.click(screen.getByText('Analyze & Fill'));

      await waitFor(() => {
        expect(screen.getByText('Processing Documents...')).toBeInTheDocument();
      });
    });

    it('should show processing step indicators', async () => {
      const user = userEvent.setup();
      vi.mocked(geminiService.processDocuments).mockImplementation(
        () => new Promise(() => {})
      );

      render(<App />);

      await user.click(screen.getByTestId('select-file-Fillable PDF Form'));
      await user.click(screen.getByTestId('select-file-Source Data'));
      await user.click(screen.getByText('Analyze & Fill'));

      await waitFor(() => {
        expect(screen.getByText('Parsing PDF')).toBeInTheDocument();
        expect(screen.getByText('Extracting Data')).toBeInTheDocument();
        expect(screen.getByText('Filling Form')).toBeInTheDocument();
      });
    });
  });

  describe('review state', () => {
    it('should show ReviewPanel after successful analysis', async () => {
      const user = userEvent.setup();
      const mockResponse: FormResponse = {
        summary: 'Test summary',
        fields: [
          { label: 'Name', value: 'John', validation: { status: 'VALID' } },
        ],
      };
      vi.mocked(geminiService.processDocuments).mockResolvedValue(mockResponse);

      render(<App />);

      await user.click(screen.getByTestId('select-file-Fillable PDF Form'));
      await user.click(screen.getByTestId('select-file-Source Data'));
      await user.click(screen.getByText('Analyze & Fill'));

      await waitFor(() => {
        expect(screen.getByTestId('review-panel')).toBeInTheDocument();
      });
    });

    it('should display summary from response', async () => {
      const user = userEvent.setup();
      const mockResponse: FormResponse = {
        summary: 'Document processed successfully',
        fields: [],
      };
      vi.mocked(geminiService.processDocuments).mockResolvedValue(mockResponse);

      render(<App />);

      await user.click(screen.getByTestId('select-file-Fillable PDF Form'));
      await user.click(screen.getByTestId('select-file-Source Data'));
      await user.click(screen.getByText('Analyze & Fill'));

      await waitFor(() => {
        expect(screen.getByText('Document processed successfully')).toBeInTheDocument();
      });
    });

    it('should reset to idle state when reset button is clicked', async () => {
      const user = userEvent.setup();
      const mockResponse: FormResponse = {
        summary: 'Test',
        fields: [],
      };
      vi.mocked(geminiService.processDocuments).mockResolvedValue(mockResponse);

      render(<App />);

      await user.click(screen.getByTestId('select-file-Fillable PDF Form'));
      await user.click(screen.getByTestId('select-file-Source Data'));
      await user.click(screen.getByText('Analyze & Fill'));

      await waitFor(() => {
        expect(screen.getByTestId('review-panel')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('reset-button'));

      await waitFor(() => {
        expect(screen.queryByTestId('review-panel')).not.toBeInTheDocument();
        expect(screen.getByText('Fill Forms Automatically with AI')).toBeInTheDocument();
      });
    });
  });

  describe('error state', () => {
    it('should show error message when analysis fails', async () => {
      const user = userEvent.setup();
      vi.mocked(geminiService.processDocuments).mockRejectedValue(
        new Error('API error occurred')
      );

      render(<App />);

      await user.click(screen.getByTestId('select-file-Fillable PDF Form'));
      await user.click(screen.getByTestId('select-file-Source Data'));
      await user.click(screen.getByText('Analyze & Fill'));

      await waitFor(() => {
        expect(screen.getByText('API error occurred')).toBeInTheDocument();
      });
    });

    it('should show generic error message when error has no message', async () => {
      const user = userEvent.setup();
      vi.mocked(geminiService.processDocuments).mockRejectedValue(new Error());

      render(<App />);

      await user.click(screen.getByTestId('select-file-Fillable PDF Form'));
      await user.click(screen.getByTestId('select-file-Source Data'));
      await user.click(screen.getByText('Analyze & Fill'));

      await waitFor(() => {
        expect(screen.getByText('Something went wrong during analysis.')).toBeInTheDocument();
      });
    });

    it('should allow retry after error', async () => {
      const user = userEvent.setup();
      vi.mocked(geminiService.processDocuments)
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce({ summary: 'Success', fields: [] });

      render(<App />);

      await user.click(screen.getByTestId('select-file-Fillable PDF Form'));
      await user.click(screen.getByTestId('select-file-Source Data'));

      // First attempt fails
      await user.click(screen.getByText('Analyze & Fill'));
      await waitFor(() => {
        expect(screen.getByText('First failure')).toBeInTheDocument();
      });

      // Second attempt succeeds
      await user.click(screen.getByText('Analyze & Fill'));
      await waitFor(() => {
        expect(screen.getByTestId('review-panel')).toBeInTheDocument();
      });
    });
  });

  describe('PDF field detection', () => {
    it('should detect PDF fields when form file is selected', async () => {
      const user = userEvent.setup();
      vi.mocked(pdfService.getPdfFields).mockResolvedValue([
        { name: 'field1', type: 'PDFTextField' },
        { name: 'field2', type: 'PDFTextField' },
      ]);

      render(<App />);

      await user.click(screen.getByTestId('select-file-Fillable PDF Form'));

      await waitFor(() => {
        expect(pdfService.getPdfFields).toHaveBeenCalled();
      });
    });

    it('should show fillable fields count when detected', async () => {
      const user = userEvent.setup();
      vi.mocked(pdfService.getPdfFields).mockResolvedValue([
        { name: 'field1', type: 'PDFTextField' },
        { name: 'field2', type: 'PDFTextField' },
        { name: 'field3', type: 'PDFTextField' },
      ]);

      render(<App />);

      await user.click(screen.getByTestId('select-file-Fillable PDF Form'));

      await waitFor(() => {
        expect(screen.getByText('3 fillable fields detected')).toBeInTheDocument();
      });
    });

    it('should not show field count when no fields detected', async () => {
      const user = userEvent.setup();
      vi.mocked(pdfService.getPdfFields).mockResolvedValue([]);

      render(<App />);

      await user.click(screen.getByTestId('select-file-Fillable PDF Form'));

      await waitFor(() => {
        expect(screen.queryByText(/fillable fields detected/)).not.toBeInTheDocument();
      });
    });

    it('should pass PDF fields to processDocuments', async () => {
      const user = userEvent.setup();
      const mockFields = [
        { name: 'firstName', type: 'PDFTextField' },
        { name: 'lastName', type: 'PDFTextField' },
      ];
      vi.mocked(pdfService.getPdfFields).mockResolvedValue(mockFields);
      vi.mocked(geminiService.processDocuments).mockResolvedValue({
        summary: 'Test',
        fields: [],
      });

      render(<App />);

      await user.click(screen.getByTestId('select-file-Fillable PDF Form'));

      // Wait for PDF analysis
      await waitFor(() => {
        expect(pdfService.getPdfFields).toHaveBeenCalled();
      });

      await user.click(screen.getByTestId('select-file-Source Data'));
      await user.click(screen.getByText('Analyze & Fill'));

      await waitFor(() => {
        expect(geminiService.processDocuments).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          mockFields
        );
      });
    });
  });

  describe('navigation steps', () => {
    it('should display workflow steps in header', () => {
      render(<App />);

      expect(screen.getByText('1. Scan')).toBeInTheDocument();
      expect(screen.getByText('2. Extract')).toBeInTheDocument();
      expect(screen.getByText('3. Review')).toBeInTheDocument();
    });
  });
});
