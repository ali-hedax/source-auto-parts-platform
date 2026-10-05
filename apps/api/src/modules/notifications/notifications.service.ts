import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { SMS_PROVIDER, type SmsProvider } from '../../integrations/sms/sms.provider.js';
import { notFound } from '../../common/errors.js';
import { type SmsNotificationType, siteSettingsSchema } from '@hedax/contracts';
import { SITE_SETTINGS_KEY } from '../settings/settings.service.js';

const SMS_TEXT_FA: Record<SmsNotificationType, (p: Record<string, unknown>) => string> = {
  'order.paid': (p) => `سورس: پرداخت سفارش ${String(p.reference ?? '')} تأیید شد.`,
  'order.shipped': (p) => `سورس: سفارش ${String(p.reference ?? '')} ارسال شد.`,
  'sourcing.submitted': (p) => `سورس: درخواست تأمین ${String(p.reference ?? '')} ثبت شد.`,
  'sourcing.needs_info': (p) => `سورس: برای درخواست ${String(p.reference ?? '')} اطلاعات بیشتری لازم است.`,
  'quote.sent': (p) => `سورس: پیش‌فاکتور ${String(p.reference ?? '')} آماده است.`,
  'procurement.paid': (p) => `سورس: پرداخت ${String(p.reference ?? '')} تأیید شد و تأمین آغاز می‌شود.`,
  'procurement.delayed': (p) => `سورس: زمان برآورد ${String(p.reference ?? '')} تغییر کرد.`,
  'procurement.shipped': (p) => `سورس: سفارش تأمین ${String(p.reference ?? '')} ارسال شد.`,
};

/**
 * In-app notifications and SMS delivery. A failed SMS is recorded and retried
 * but never rolls back the paid order or other business state (spec §17).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  /** Worker: materialize an outbox notification (idempotent via dedupeKey). */
  async deliver(payload: { userId: string; type: string; params: Record<string, unknown>; linkPath: string | null; sms: boolean }, dedupeKey: string): Promise<void> {
    await this.prisma.notification.createMany({
      data: [{ userId: payload.userId, type: payload.type, params: payload.params as Prisma.InputJsonValue, linkPath: payload.linkPath, dedupeKey }],
      skipDuplicates: true,
    });
    const n = await this.prisma.notification.findUniqueOrThrow({ where: { dedupeKey } });
    await this.prisma.notificationDelivery.createMany({ data: [{ notificationId: n.id, channel: 'IN_APP', status: 'SENT', sentAt: new Date(), attempts: 1 }], skipDuplicates: true });
    const template = SMS_TEXT_FA[payload.type as SmsNotificationType] as ((p: Record<string, unknown>) => string) | undefined;
    if (payload.sms && template && !(await this.smsSwitchedOff(payload.type))) {
      await this.prisma.notificationDelivery.createMany({ data: [{ notificationId: n.id, channel: 'SMS', status: 'PENDING', nextAttemptAt: new Date() }], skipDuplicates: true });
    }
  }

  /** The owner can switch the SMS copy of a notification type off (admin settings); the in-app one always stays. */
  private async smsSwitchedOff(type: string): Promise<boolean> {
    const row = await this.prisma.siteSetting.findUnique({ where: { key: SITE_SETTINGS_KEY } });
    const parsed = siteSettingsSchema.safeParse(row?.value ?? {});
    return parsed.success && (parsed.data.smsDisabledTypes as readonly string[]).includes(type);
  }

  /** Worker: send pending SMS with capped exponential backoff. */
  async sendPendingSms(limit = 50): Promise<number> {
    const due = await this.prisma.notificationDelivery.findMany({
      where: { channel: 'SMS', status: 'PENDING', nextAttemptAt: { lte: new Date() } },
      include: { notification: { include: { user: { select: { mobileE164: true } } } } },
      take: limit,
    });
    let sent = 0;
    for (const d of due) {
      const mobile = d.notification.user.mobileE164;
      const template = SMS_TEXT_FA[d.notification.type as SmsNotificationType] as ((p: Record<string, unknown>) => string) | undefined;
      if (!mobile || !template) {
        await this.prisma.notificationDelivery.update({ where: { id: d.id }, data: { status: 'SKIPPED', lastError: 'NO_MOBILE_OR_TEMPLATE' } });
        continue;
      }
      try {
        const res = await this.sms.send({ toE164: mobile, template: 'notification', params: { text: template(d.notification.params as Record<string, unknown>) } });
        await this.prisma.notificationDelivery.update({ where: { id: d.id }, data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 }, providerMessageId: res.providerMessageId } });
        sent += 1;
      } catch (e) {
        const attempts = d.attempts + 1;
        const giveUp = attempts >= 6;
        await this.prisma.notificationDelivery.update({
          where: { id: d.id },
          data: {
            attempts,
            status: giveUp ? 'FAILED' : 'PENDING',
            lastError: (e instanceof Error ? e.message : 'send failed').slice(0, 500),
            nextAttemptAt: giveUp ? null : new Date(Date.now() + Math.min(2 ** attempts * 60_000, 6 * 3_600_000)),
          },
        });
        this.logger.warn(`sms delivery ${d.id} failed (attempt ${attempts})`);
      }
    }
    return sent;
  }

  async list(actor: Actor) {
    const rows = await this.prisma.notification.findMany({ where: { userId: actor.userId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((n) => ({ id: n.id, type: n.type, params: n.params, linkPath: n.linkPath, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }));
  }

  async markRead(actor: Actor, id: string | 'all') {
    if (id === 'all') {
      await this.prisma.notification.updateMany({ where: { userId: actor.userId, readAt: null }, data: { readAt: new Date() } });
      return;
    }
    const res = await this.prisma.notification.updateMany({ where: { id, userId: actor.userId }, data: { readAt: new Date() } });
    if (res.count !== 1) throw notFound();
  }
}
