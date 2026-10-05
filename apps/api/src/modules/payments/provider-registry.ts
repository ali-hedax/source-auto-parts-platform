import { Inject, Injectable } from '@nestjs/common';
import type { PaymentProvider } from '@hedax/domain';
import { ENV, type Env, isProduction } from '../../config/env.js';
import { unavailable } from '../../common/errors.js';
import { SimulatorPaymentProvider } from './simulator.provider.js';
import { ZarinpalPaymentProvider } from './zarinpal.provider.js';

/**
 * Holds the one active payment provider. With PAYMENT_PROVIDER=none (no live
 * gateway chosen yet) every payment start is refused with PAYMENT_NOT_CONFIGURED
 * before any order is created — nothing pretends to be live.
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly provider: PaymentProvider | null;

  constructor(@Inject(ENV) private readonly env: Env) {
    if (env.PAYMENT_PROVIDER === 'simulator') {
      if (isProduction(env)) throw new Error('PAYMENT_PROVIDER=simulator is forbidden in production');
      this.provider = new SimulatorPaymentProvider(env.PUBLIC_BASE_URL, env.PAYMENT_MERCHANT_ID, env.PAYMENT_SESSION_MINUTES, env.APP_ENV);
    } else if (env.PAYMENT_PROVIDER === 'zarinpal') {
      if (isProduction(env) && env.ZARINPAL_SANDBOX) throw new Error('The Zarinpal sandbox is forbidden in production');
      this.provider = new ZarinpalPaymentProvider({ merchantId: env.PAYMENT_MERCHANT_ID, sandbox: env.ZARINPAL_SANDBOX, sessionMinutes: env.PAYMENT_SESSION_MINUTES });
    } else {
      this.provider = null;
    }
  }

  get merchantId(): string {
    return this.env.PAYMENT_MERCHANT_ID;
  }

  active(): PaymentProvider {
    if (!this.provider) throw unavailable('PAYMENT_NOT_CONFIGURED', 'Online payment is not configured yet');
    return this.provider;
  }

  byCode(code: string): PaymentProvider | null {
    return this.provider && this.provider.code === code ? this.provider : null;
  }

  simulator(): SimulatorPaymentProvider | null {
    return this.provider instanceof SimulatorPaymentProvider ? this.provider : null;
  }

  isConfigured(): boolean {
    return this.provider !== null;
  }
}
