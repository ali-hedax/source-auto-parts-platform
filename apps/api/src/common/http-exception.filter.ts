import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { isDomainError } from '@hedax/domain';
import type { ApiError } from '@hedax/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { CONFLICT_CODES } from './errors.js';
import { currentRequestId } from './request-context.js';

/**
 * Maps every thrown error to the uniform ApiError contract. Internal details
 * (SQL, stack traces, provider payloads) never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = currentRequestId() ?? 'unknown';
    const { status, body } = this.map(exception, requestId);
    if (status >= 500) {
      this.logger.error({ requestId, err: exception instanceof Error ? { name: exception.name, code: (exception as { code?: string }).code, message: exception.message, stack: exception.stack } : String(exception) });
    }
    res.status(status).json(body);
  }

  private map(exception: unknown, requestId: string): { status: number; body: ApiError } {
    const make = (status: number, code: string, message: string, extra: Partial<ApiError['error']> = {}) => ({
      status,
      body: { error: { code, message, requestId, ...extra } },
    });

    if (exception instanceof ZodError) {
      return make(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Request validation failed', {
        fields: exception.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })),
      });
    }
    if (isDomainError(exception)) {
      const status = CONFLICT_CODES.has(exception.code) ? HttpStatus.CONFLICT : HttpStatus.UNPROCESSABLE_ENTITY;
      return make(status, exception.code, exception.message, exception.details ? { details: exception.details } : {});
    }
    if (exception instanceof Prisma.PrismaClientInitializationError || isConnectivityError(exception)) {
      return make(HttpStatus.SERVICE_UNAVAILABLE, 'DATABASE_UNAVAILABLE', 'The service is temporarily unavailable');
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') return make(HttpStatus.CONFLICT, 'UNIQUE_VIOLATION', 'A record with the same unique value already exists');
      if (exception.code === 'P2025') return make(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');
      if (exception.code === 'P2034') return make(HttpStatus.CONFLICT, 'TRANSACTION_CONFLICT', 'Concurrent update, please retry');
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'object' && response && 'code' in response) {
        const r = response as { code: string; message?: string; details?: Record<string, unknown> };
        return make(status, r.code, r.message ?? r.code, r.details ? { details: r.details } : {});
      }
      const message = typeof response === 'string' ? response : exception.message;
      return make(status, status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : `HTTP_${status}`, message);
    }
    return make(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/** Connection-level failures (DB down, pool exhausted) are 503, not 500. */
function isConnectivityError(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code.startsWith('P1') || e.code === 'P2024') return true;
  const cause = JSON.stringify(e.meta ?? {});
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|DatabaseNotReachable|connection/i.test(cause);
}
