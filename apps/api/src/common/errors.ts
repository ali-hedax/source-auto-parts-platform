import { HttpException, HttpStatus } from '@nestjs/common';

/** Application error carrying a stable machine code for the uniform error contract. */
export class AppError extends HttpException {
  constructor(
    readonly code: string,
    status: HttpStatus,
    message?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super({ code, message: message ?? code, details }, status);
  }
}

export const badRequest = (code: string, message?: string, details?: Record<string, unknown>) =>
  new AppError(code, HttpStatus.BAD_REQUEST, message, details);
export const unauthorized = (code = 'UNAUTHENTICATED', message = 'Authentication required') =>
  new AppError(code, HttpStatus.UNAUTHORIZED, message);
export const forbidden = (code = 'FORBIDDEN', message = 'Not allowed') => new AppError(code, HttpStatus.FORBIDDEN, message);
/** Used for object-level denials too: never reveal whether someone else's object exists. */
export const notFound = (code = 'NOT_FOUND', message = 'Not found') => new AppError(code, HttpStatus.NOT_FOUND, message);
export const conflict = (code: string, message?: string, details?: Record<string, unknown>) =>
  new AppError(code, HttpStatus.CONFLICT, message, details);
export const unprocessable = (code: string, message?: string, details?: Record<string, unknown>) =>
  new AppError(code, HttpStatus.UNPROCESSABLE_ENTITY, message, details);
export const tooMany = (code = 'RATE_LIMITED', message = 'Too many requests') =>
  new AppError(code, HttpStatus.TOO_MANY_REQUESTS, message);
export const unavailable = (code: string, message?: string) => new AppError(code, HttpStatus.SERVICE_UNAVAILABLE, message);

/** Domain error codes that are conflicts (state/version) rather than validation problems. */
export const CONFLICT_CODES = new Set([
  'INVALID_TRANSITION',
  'VERSION_CONFLICT',
  'REFUND_EXCEEDS_REMAINING',
  'INSUFFICIENT_STOCK',
  'LAST_OWNER',
  'ALREADY_PAID',
]);
