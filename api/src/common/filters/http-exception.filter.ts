import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global HTTP exception filter.
 * Normalizes all errors to a consistent JSON shape.
 *
 * Response shape:
 * {
 *   statusCode: 400,
 *   message: "Validation failed",
 *   error: "Bad Request",
 *   timestamp: "2024-01-01T00:00:00.000Z",
 *   path: "/api/v1/users"
 * }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | string[];
    let error: string;
    // Plan-limit errors carry a code and the plan that would allow the action,
    // so the web app can show an upgrade button instead of a generic message.
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res.message as string | string[]) ?? exception.message;
        error = (res.error as string) ?? exception.name;
        if (typeof res.code === 'string') extra = { code: res.code, plan: res.plan ?? null, upgradeTo: res.upgradeTo ?? null };
      }
    } else {
      // Unexpected errors — log full stack, return 500
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'InternalServerError';
      this.logger.error('Unhandled exception', exception);
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      ...extra,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
