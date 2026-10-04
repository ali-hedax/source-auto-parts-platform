import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { REQUEST_ID_HEADER } from '@hedax/contracts';
import { CryptoService } from './crypto.service.js';
import { runWithContext } from './request-context.js';

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Assigns/propagates a request id and runs the request inside an AsyncLocalStorage context. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly crypto: CryptoService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER.toLowerCase()];
    const requestId = typeof incoming === 'string' && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
    res.setHeader(REQUEST_ID_HEADER, requestId);
    runWithContext({ requestId, ipHash: this.crypto.hashIp(req.ip), actor: null }, () => next());
  }
}
