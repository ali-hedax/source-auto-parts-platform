# سورس | Source by HEDAX

**فروش قطعات خودرو و تأمین سفارشی، با رابط فارسی و انگلیسی.**

[English](README.md) · [فهرست راهنماها](docs/README.md) · [وضعیت عمومی انتشار](docs/DEPLOYMENT_STATUS.md)

> **پیش از راه‌اندازی فروش — به‌روز در ۲۰ مهر ۱۴۰۵.** سایت عمومی روی <https://sourcebyhedax.ir/fa> در دسترس است، ولی ورود مشتری با پیامک و پرداخت آنلاین هنوز وصل نیست و سفارش واقعی نمی‌گیرد. جزئیات در [وضعیت عمومی انتشار](docs/DEPLOYMENT_STATUS.md).

## جریان‌های اصلی

| مسیر | امکانات |
| --- | --- |
| خرید قطعهٔ موجود | کاتالوگ، جست‌وجوی فارسی، سبد، رزرو موجودی و سفارش |
| تأمین سفارشی | درخواست، گفت‌وگو، فایل، پیش‌فاکتور نسخه‌دار و مراحل تأمین |
| مدیریت عملیات | کارکنان، نقش‌ها، احراز هویت دومرحله‌ای، موجودی و گزارش‌ها |
| اسناد و قیمت | پیش‌فاکتور فارسی/انگلیسی، تسویهٔ ریالی و قیمت مرجع درهم |

## ساختار

- `apps/web`: رابط Next.js برای فروشگاه و پنل.
- `apps/api`: API با NestJS و مدل Prisma.
- `apps/worker`: کارهای پس‌زمینه و PDF.
- `packages/domain`: قواعد تجاری.
- `packages/contracts`: قراردادهای مشترک.
- `database/prisma`: مدل داده و migrationها.
- `infra`: Docker Compose و Caddy.
- `docs`: راهنماهای توسعه، مدیریت و انتشار.

## توسعهٔ محلی

Node.js 24 و pnpm اعلام‌شده در `package.json` را استفاده کنید. `.env.example` فقط نمونه است؛ تنظیمات محلی و رازهای تصادفی را بیرون از Git نگه دارید.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:generate
pnpm build
```

پیش از اجرای migration و دادهٔ نمونه، اتصال به دیتابیس محلی ایزوله را تنظیم کنید. `seed-dev` فقط برای توسعه است.

نشانی‌های محلی فروشگاه، ورود کارکنان و پنل به‌ترتیب `/fa`، `/fa/staff/login` و `/fa/admin` روی `http://localhost:3000` هستند. برای Windows، اسکریپت‌های `scripts/local/start-local.ps1` و `stop-local.ps1` موجودند.

[راهنمای تفصیلی توسعه در نسخهٔ قبلی مخزن](https://github.com/ali-hedax/source-auto-parts-platform/blob/8ce4fd449f2399ff0eefba8b022b8f1792466288/README.md) به‌عنوان سابقه نگهداری شده است؛ وضعیت انتشار آن سند قدیمی است.

## بررسی کیفیت

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
```

پیش‌نیاز آزمون‌های دیتابیس و مرورگر در [راهنمای مشارکت](CONTRIBUTING.md) و [گزارش آزمون](docs/TEST_REPORT.md) آمده است.

## راهنماها

[معماری](docs/ARCHITECTURE.md) · [مدیریت](docs/ADMIN_GUIDE.md) · [استقرار](docs/DEPLOYMENT.md) · [بکاپ و بازیابی](docs/BACKUP_RESTORE.md) · [چک‌لیست انتشار](docs/LAUNCH_CHECKLIST.md) · [امنیت](SECURITY.md)

راهنماهای قبلی شامل سوابق آزمون محلی هستند. جزئیات خصوصی زیرساخت و امنیت در مخزن عمومی ثبت نمی‌شوند.

## پروژه‌های هداکس

[راهنمای برند](https://github.com/ali-hedax/brand-guide-hedax) · [پلتفرم نمایندگی](https://github.com/ali-hedax/manage-dealership-platform)

نگهدارنده: [ali-hedax](https://github.com/ali-hedax). مخزن مجوز متن‌باز ندارد؛ عمومی‌بودن به‌معنای مجوز بازنشر نیست.
