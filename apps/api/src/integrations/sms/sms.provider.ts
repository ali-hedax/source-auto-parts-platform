import { Inject, Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '@hedax/domain';
import { ENV, type Env } from '../../config/env.js';
import { unavailable } from '../../common/errors.js';
import { KavenegarSmsProvider } from './kavenegar.provider.js';

export type SmsTemplate = 'otp' | 'notification';

export interface SmsMessage {
  toE164: string;
  template: SmsTemplate;
  params: Record<string, string>;
}

/**
 * Swappable SMS contract (spec §14, §17). A live adapter is written from the
 * chosen provider's official documentation once a provider is selected.
 */
export interface SmsProvider {
  readonly name: string;
  readonly isDevelopmentOnly: boolean;
  send(message: SmsMessage): Promise<{ providerMessageId: string | null }>;
}

export const SMS_PROVIDER = Symbol('HEDAX_SMS_PROVIDER');

/** Development only: writes the message to the local log. Refused in production by the env guard. */
@Injectable()
export class DevLogSmsProvider implements SmsProvider {
  readonly name = 'dev-log';
  readonly isDevelopmentOnly = true;
  private readonly logger = new Logger('DevSms');

  async send(message: SmsMessage): Promise<{ providerMessageId: string | null }> {
    // The raw phone number is masked; the OTP is visible here only because this adapter is dev-only.
    this.logger.warn(`[DEV SMS → ${maskPhone(message.toE164)}] ${message.template} ${JSON.stringify(message.params)}`);
    return { providerMessageId: null };
  }
}

/** No provider configured: sending fails loudly instead of pretending success. */
@Injectable()
export class UnconfiguredSmsProvider implements SmsProvider {
  readonly name = 'none';
  readonly isDevelopmentOnly = false;

  async send(): Promise<{ providerMessageId: string | null }> {
    throw unavailable('SMS_NOT_CONFIGURED', 'SMS delivery is not configured yet');
  }
}

export const smsProviderFactory = {
  provide: SMS_PROVIDER,
  inject: [ENV],
  useFactory: (env: Env): SmsProvider => {
    if (env.SMS_PROVIDER === 'dev-log') return new DevLogSmsProvider();
    if (env.SMS_PROVIDER === 'kavenegar' && env.KAVENEGAR_API_KEY && env.KAVENEGAR_OTP_TEMPLATE) {
      return new KavenegarSmsProvider({ apiKey: env.KAVENEGAR_API_KEY, otpTemplate: env.KAVENEGAR_OTP_TEMPLATE, sender: env.KAVENEGAR_SENDER });
    }
    return new UnconfiguredSmsProvider();
  },
};

@Injectable()
export class SmsGateway {
  constructor(@Inject(SMS_PROVIDER) readonly provider: SmsProvider) {}
}
