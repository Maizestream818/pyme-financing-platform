'use client';

import { getAccessToken } from '../auth/session';
import { ApiEnvelope, ApiErrorPayload } from './types';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api';

export class ApiClientError extends Error {
  code: string;
  details?: ApiErrorPayload['error']['details'];
  status: number;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.error.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = payload.error.code;
    this.details = payload.error.details;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: HeadersInit;
};

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getAccessToken();
  const isFormData = options.body instanceof FormData;

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.body !== undefined && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  const requestBody: BodyInit | undefined =
    options.body === undefined
      ? undefined
      : isFormData
        ? (options.body as FormData)
        : JSON.stringify(options.body);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: requestBody,
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | ApiErrorPayload
    | null;

  if (!response.ok) {
    if (payload && 'error' in payload) {
      throw new ApiClientError(response.status, payload);
    }

    throw new Error('No se pudo completar la solicitud.');
  }

  if (!payload || !('data' in payload)) {
    throw new Error('Respuesta de API invalida.');
  }

  return payload.data;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'PATCH', body }),
};

export async function downloadFile(path: string, filenameFallback: string) {
  const token = getAccessToken();
  const headers = new Headers();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { headers });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
    if (payload?.error) {
      throw new ApiClientError(response.status, payload);
    }

    throw new Error('No se pudo descargar el archivo.');
  }

  const disposition = response.headers.get('content-disposition');
  const match = disposition?.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? filenameFallback;
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

export function formatApiError(error: unknown) {
  if (error instanceof ApiClientError) {
    const details = error.details
      ?.map((detail) => `${detail.field ?? 'campo'}: ${detail.issue}`)
      .join(', ');

    return details ? `${error.message} (${details})` : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Ocurrio un error inesperado.';
}
