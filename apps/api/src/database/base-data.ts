import { DEFAULT_ROLES, PERMISSIONS } from '@hedax/domain';
import { createPgAdapter } from '../common/pg-adapter.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Production-safe base data only: permissions, system roles, the single
 * warehouse, customer groups, an empty default business calendar (holidays
 * must be entered by the owner), the four current stock brands from the brief,
 * and default settings. No users, customers, prices, policies or transactions.
 */
export async function seedBase(prisma: PrismaClient): Promise<void> {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, create: { key, description }, update: { description } });
  }
  for (const role of DEFAULT_ROLES) {
    const saved = await prisma.role.upsert({
      where: { key: role.key },
      create: { key: role.key, nameFa: role.nameFa, nameEn: role.nameEn, isSystem: true, isOwner: role.isOwner, requiresMfa: role.requiresMfa },
      update: { nameFa: role.nameFa, nameEn: role.nameEn, isSystem: true, isOwner: role.isOwner, requiresMfa: role.requiresMfa },
    });
    // System roles are reset to their defaults only on first creation; owners may customise later.
    const existing = await prisma.rolePermission.count({ where: { roleId: saved.id } });
    if (existing === 0 || role.isOwner) {
      await prisma.rolePermission.deleteMany({ where: { roleId: saved.id } });
      await prisma.rolePermission.createMany({ data: role.permissions.map((permissionKey) => ({ roleId: saved.id, permissionKey })) });
    }
  }
  await prisma.warehouse.upsert({ where: { code: 'MAIN' }, create: { code: 'MAIN', name: 'انبار اصلی', isDefault: true }, update: {} });
  await prisma.customerGroup.upsert({ where: { key: 'workshop' }, create: { key: 'workshop', nameFa: 'تعمیرگاه / مشتری تجاری', nameEn: 'Workshop / business', requiresApproval: true }, update: {} });
  await prisma.customerGroup.upsert({ where: { key: 'wholesale' }, create: { key: 'wholesale', nameFa: 'عمده‌فروش', nameEn: 'Wholesaler', requiresApproval: true }, update: {} });
  const calendar = await prisma.businessCalendar.findFirst({ where: { isDefault: true } });
  if (!calendar) {
    // Friday is the default weekly day off; public holidays are NOT guessed — the owner enters them.
    await prisma.businessCalendar.create({ data: { name: 'تقویم کاری پیش‌فرض', timeZone: 'Asia/Tehran', weekendDays: [5], holidays: [], isDefault: true } });
  }
  const brands = [
    { code: 'IKCO', slug: 'iran-khodro', nameFa: 'ایران خودرو', nameEn: 'Iran Khodro', sortOrder: 1 },
    { code: 'SAIPA', slug: 'saipa', nameFa: 'سایپا', nameEn: 'Saipa', sortOrder: 2 },
    { code: 'TOYOTA', slug: 'toyota', nameFa: 'تویوتا', nameEn: 'Toyota', sortOrder: 3 },
    { code: 'HYUNDAI', slug: 'hyundai', nameFa: 'هیوندای', nameEn: 'Hyundai', sortOrder: 4 },
  ];
  for (const b of brands) {
    await prisma.vehicleBrand.upsert({ where: { code: b.code }, create: { ...b, isFeatured: true }, update: {} });
  }
  await prisma.siteSetting.upsert({
    where: { key: 'site' },
    create: { key: 'site', value: { reservationMinutes: 15, quoteValidityHoursDefault: 24, taxRateBasisPoints: null, taxBase: 'ITEMS', manualBankTransferEnabled: false } },
    update: {},
  });
}

export function scriptPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  return new PrismaClient({ adapter: createPgAdapter(url) });
}
