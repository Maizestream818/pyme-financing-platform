import { randomUUID } from 'crypto';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
};

export type ApiMeta = {
  requestId: string;
  timestamp: string;
};

export type ApiSuccessResponse<T> = {
  data: T;
  meta: ApiMeta;
};

export function createMeta(request?: RequestLike): ApiMeta {
  const headerRequestId = request?.headers?.['x-request-id'];
  const requestId = Array.isArray(headerRequestId)
    ? headerRequestId[0]
    : headerRequestId;

  return {
    requestId: requestId || randomUUID(),
    timestamp: new Date().toISOString(),
  };
}

export function apiOk<T>(data: T, request?: RequestLike): ApiSuccessResponse<T> {
  return {
    data,
    meta: createMeta(request),
  };
}
