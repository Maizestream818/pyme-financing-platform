import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { createMeta } from './api-response';

type ExceptionBody = {
  code?: string;
  message?: string | string[];
  details?: unknown;
};

type ResponseLike = {
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

const STATUS_CODE_MAP: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'DUPLICATE_RESOURCE',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<ResponseLike>();
    const request = context.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const body =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as ExceptionBody)
        : undefined;

    const rawMessage = body?.message;
    const message = Array.isArray(rawMessage)
      ? 'La solicitud contiene datos invalidos.'
      : rawMessage ?? 'Ocurrio un error interno.';

    response.status(status).json({
      error: {
        code: body?.code ?? STATUS_CODE_MAP[status] ?? 'INTERNAL_ERROR',
        message,
        details: body?.details,
      },
      meta: createMeta(request),
    });
  }
}
