import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors.js';

/** Upstream gateway problem: the customer may retry; nothing was charged by HEDAX. */
export const badGatewayLike = (code: string, message: string) => new AppError(code, HttpStatus.BAD_GATEWAY, message);
