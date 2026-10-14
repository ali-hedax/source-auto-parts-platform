import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { MailService } from './mail.service.js';
import { MAIL_TRANSPORT, createMailTransport } from './mail.transport.js';

/** Outgoing e-mail for the API (queues messages) and the worker (delivers them). */
@Global()
@Module({
  providers: [{ provide: MAIL_TRANSPORT, inject: [ENV], useFactory: (env: Env) => createMailTransport(env) }, MailService],
  exports: [MailService, MAIL_TRANSPORT],
})
export class MailModule {}
