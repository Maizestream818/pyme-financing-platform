import { HttpException } from '@nestjs/common';

export type ApiErrorDetail = {
  field?: string;
  issue: string;
};

export class ApiException extends HttpException {
  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: ApiErrorDetail[],
  ) {
    super(
      {
        code,
        message,
        details,
      },
      statusCode,
    );
  }
}
