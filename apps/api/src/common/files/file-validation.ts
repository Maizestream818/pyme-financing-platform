import { extname } from 'path';
import { ApiException } from '../filters/api.exception';
import { UploadedFile } from './uploaded-file';

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_BY_EXTENSION: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
};

export function validateUploadedFile(file?: UploadedFile) {
  if (!file) {
    throw fileValidationError('file', 'required');
  }

  if (!file.buffer || file.buffer.length === 0 || file.size <= 0) {
    throw fileValidationError('file', 'empty');
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw fileValidationError('file', 'max_size_exceeded');
  }

  validateOriginalFilename(file.originalname);

  const extension = extname(file.originalname).toLowerCase();
  const allowedMimeTypes = ALLOWED_MIME_BY_EXTENSION[extension];

  if (!allowedMimeTypes) {
    throw fileValidationError('originalFilename', 'extension_not_allowed');
  }

  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw fileValidationError('mimeType', 'mime_not_allowed');
  }

  return {
    extension,
    safeOriginalFilename: file.originalname.trim(),
  };
}

function validateOriginalFilename(filename: string) {
  const trimmed = filename.trim();

  if (!trimmed) {
    throw fileValidationError('originalFilename', 'required');
  }

  if (trimmed.length > 180) {
    throw fileValidationError('originalFilename', 'too_long');
  }

  if (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('..') ||
    /[\u0000-\u001f]/.test(trimmed)
  ) {
    throw fileValidationError('originalFilename', 'unsafe_name');
  }
}

function fileValidationError(field: string, issue: string) {
  return new ApiException(
    400,
    'FILE_VALIDATION_ERROR',
    'El archivo no cumple las validaciones requeridas.',
    [{ field, issue }],
  );
}
