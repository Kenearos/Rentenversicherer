import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileUpload } from '../../components/FileUpload';
import { FileData } from '../../types';

describe('FileUpload', () => {
  const defaultProps = {
    label: 'Upload Document',
    description: 'PDF or Image files accepted',
    accept: '.pdf,image/*',
    onFileSelect: vi.fn(),
    selectedFile: null as FileData | null
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render upload area when no file is selected', () => {
      render(<FileUpload {...defaultProps} />);

      expect(screen.getByText('Upload Document')).toBeInTheDocument();
      expect(screen.getByText('PDF or Image files accepted')).toBeInTheDocument();
      expect(screen.getByText('Click to upload or drag and drop')).toBeInTheDocument();
    });

    it('should render file info when a file is selected', () => {
      const mockFile: FileData = {
        file: new File(['content'], 'document.pdf', { type: 'application/pdf' }),
        previewUrl: null,
        base64: 'base64content',
        type: 'application/pdf'
      };
      Object.defineProperty(mockFile.file, 'size', { value: 1048576 }); // 1MB

      render(<FileUpload {...defaultProps} selectedFile={mockFile} />);

      expect(screen.getByText('document.pdf')).toBeInTheDocument();
      expect(screen.getByText('1.00 MB')).toBeInTheDocument();
    });

    it('should show image preview when selected file is an image', () => {
      const mockFile: FileData = {
        file: new File([''], 'photo.png', { type: 'image/png' }),
        previewUrl: 'data:image/png;base64,abc123',
        base64: 'abc123',
        type: 'image/png'
      };

      render(<FileUpload {...defaultProps} selectedFile={mockFile} />);

      const img = screen.getByAltText('Preview');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'data:image/png;base64,abc123');
    });

    it('should show file icon when selected file is a PDF', () => {
      const mockFile: FileData = {
        file: new File([''], 'document.pdf', { type: 'application/pdf' }),
        previewUrl: null,
        base64: 'pdfcontent',
        type: 'application/pdf'
      };

      render(<FileUpload {...defaultProps} selectedFile={mockFile} />);

      // Should not show image preview
      expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();
    });
  });

  describe('file selection via input', () => {
    it('should call onFileSelect when a file is selected via input', async () => {
      const onFileSelect = vi.fn();
      render(<FileUpload {...defaultProps} onFileSelect={onFileSelect} />);

      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      // Mock FileReader
      const mockFileReader = {
        readAsDataURL: vi.fn(),
        result: 'data:application/pdf;base64,dGVzdCBjb250ZW50',
        onload: null as ((ev: ProgressEvent<FileReader>) => void) | null
      };

      vi.spyOn(global, 'FileReader').mockImplementation(() => {
        return mockFileReader as unknown as FileReader;
      });

      fireEvent.change(input, { target: { files: [file] } });

      // Trigger the onload callback
      mockFileReader.onload?.({} as ProgressEvent<FileReader>);

      await waitFor(() => {
        expect(onFileSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            file: expect.any(File),
            base64: 'dGVzdCBjb250ZW50', // base64 content without prefix
            type: 'application/pdf'
          })
        );
      });
    });

    it('should not call onFileSelect when no files are selected', () => {
      const onFileSelect = vi.fn();
      render(<FileUpload {...defaultProps} onFileSelect={onFileSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [] } });

      expect(onFileSelect).not.toHaveBeenCalled();
    });
  });

  describe('drag and drop', () => {
    it('should highlight on drag over', () => {
      render(<FileUpload {...defaultProps} />);

      const dropZone = screen.getByText('Click to upload or drag and drop').parentElement?.parentElement?.parentElement;

      fireEvent.dragOver(dropZone!, { preventDefault: vi.fn() });

      // Check for the dragging class (indigo border)
      expect(dropZone).toHaveClass('border-indigo-500');
    });

    it('should remove highlight on drag leave', () => {
      render(<FileUpload {...defaultProps} />);

      const dropZone = screen.getByText('Click to upload or drag and drop').parentElement?.parentElement?.parentElement;

      fireEvent.dragOver(dropZone!, { preventDefault: vi.fn() });
      fireEvent.dragLeave(dropZone!);

      expect(dropZone).not.toHaveClass('border-indigo-500');
    });

    it('should handle file drop', async () => {
      const onFileSelect = vi.fn();
      render(<FileUpload {...defaultProps} onFileSelect={onFileSelect} />);

      const file = new File(['dropped content'], 'dropped.pdf', { type: 'application/pdf' });
      const dropZone = screen.getByText('Click to upload or drag and drop').parentElement?.parentElement?.parentElement;

      // Mock FileReader
      const mockFileReader = {
        readAsDataURL: vi.fn(),
        result: 'data:application/pdf;base64,ZHJvcHBlZCBjb250ZW50',
        onload: null as ((ev: ProgressEvent<FileReader>) => void) | null
      };

      vi.spyOn(global, 'FileReader').mockImplementation(() => {
        return mockFileReader as unknown as FileReader;
      });

      fireEvent.drop(dropZone!, {
        preventDefault: vi.fn(),
        dataTransfer: { files: [file] }
      });

      // Trigger the onload callback
      mockFileReader.onload?.({} as ProgressEvent<FileReader>);

      await waitFor(() => {
        expect(onFileSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            file: expect.any(File),
            base64: 'ZHJvcHBlZCBjb250ZW50',
            type: 'application/pdf'
          })
        );
      });
    });

    it('should not process drop if no files in dataTransfer', () => {
      const onFileSelect = vi.fn();
      render(<FileUpload {...defaultProps} onFileSelect={onFileSelect} />);

      const dropZone = screen.getByText('Click to upload or drag and drop').parentElement?.parentElement?.parentElement;

      fireEvent.drop(dropZone!, {
        preventDefault: vi.fn(),
        dataTransfer: { files: [] }
      });

      expect(onFileSelect).not.toHaveBeenCalled();
    });
  });

  describe('file clearing', () => {
    it('should call onFileSelect with null when clear button is clicked', async () => {
      const onFileSelect = vi.fn();
      const mockFile: FileData = {
        file: new File([''], 'document.pdf', { type: 'application/pdf' }),
        previewUrl: null,
        base64: 'content',
        type: 'application/pdf'
      };

      render(<FileUpload {...defaultProps} onFileSelect={onFileSelect} selectedFile={mockFile} />);

      // Find the clear button (X icon button)
      const clearButton = screen.getByRole('button');
      await userEvent.click(clearButton);

      expect(onFileSelect).toHaveBeenCalledWith(null);
    });
  });

  describe('click to upload', () => {
    it('should open file dialog when upload area is clicked', () => {
      render(<FileUpload {...defaultProps} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(input, 'click');

      const uploadArea = screen.getByText('Click to upload or drag and drop').parentElement?.parentElement?.parentElement;
      fireEvent.click(uploadArea!);

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('file preview generation', () => {
    it('should generate preview URL for image files', async () => {
      const onFileSelect = vi.fn();
      render(<FileUpload {...defaultProps} onFileSelect={onFileSelect} />);

      const imageFile = new File(['image'], 'photo.png', { type: 'image/png' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      const mockFileReader = {
        readAsDataURL: vi.fn(),
        result: 'data:image/png;base64,aW1hZ2U=',
        onload: null as ((ev: ProgressEvent<FileReader>) => void) | null
      };

      vi.spyOn(global, 'FileReader').mockImplementation(() => {
        return mockFileReader as unknown as FileReader;
      });

      fireEvent.change(input, { target: { files: [imageFile] } });
      mockFileReader.onload?.({} as ProgressEvent<FileReader>);

      await waitFor(() => {
        expect(onFileSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            previewUrl: 'data:image/png;base64,aW1hZ2U=',
            type: 'image/png'
          })
        );
      });
    });

    it('should set previewUrl to null for PDF files', async () => {
      const onFileSelect = vi.fn();
      render(<FileUpload {...defaultProps} onFileSelect={onFileSelect} />);

      const pdfFile = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      const mockFileReader = {
        readAsDataURL: vi.fn(),
        result: 'data:application/pdf;base64,cGRm',
        onload: null as ((ev: ProgressEvent<FileReader>) => void) | null
      };

      vi.spyOn(global, 'FileReader').mockImplementation(() => {
        return mockFileReader as unknown as FileReader;
      });

      fireEvent.change(input, { target: { files: [pdfFile] } });
      mockFileReader.onload?.({} as ProgressEvent<FileReader>);

      await waitFor(() => {
        expect(onFileSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            previewUrl: null,
            type: 'application/pdf'
          })
        );
      });
    });
  });

  describe('accept attribute', () => {
    it('should pass accept attribute to input element', () => {
      render(<FileUpload {...defaultProps} accept=".pdf,.docx" />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input.accept).toBe('.pdf,.docx');
    });
  });

  describe('file size display', () => {
    it('should display correct file size in MB', () => {
      const mockFile: FileData = {
        file: new File([''], 'large.pdf', { type: 'application/pdf' }),
        previewUrl: null,
        base64: 'content',
        type: 'application/pdf'
      };
      // 5.5 MB
      Object.defineProperty(mockFile.file, 'size', { value: 5767168 });

      render(<FileUpload {...defaultProps} selectedFile={mockFile} />);

      expect(screen.getByText('5.50 MB')).toBeInTheDocument();
    });

    it('should display small file sizes correctly', () => {
      const mockFile: FileData = {
        file: new File([''], 'small.txt', { type: 'application/pdf' }),
        previewUrl: null,
        base64: 'content',
        type: 'application/pdf'
      };
      // 50 KB
      Object.defineProperty(mockFile.file, 'size', { value: 51200 });

      render(<FileUpload {...defaultProps} selectedFile={mockFile} />);

      expect(screen.getByText('0.05 MB')).toBeInTheDocument();
    });
  });
});
