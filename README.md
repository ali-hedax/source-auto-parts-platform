# هداکس | HEDAX — فروشگاه قطعات خودرو و تأمین سفارشی

سامانهٔ دوزبانهٔ فارسی (راست‌چین، پیش‌فرض) و انگلیسی (چپ‌چین) با دو مسیر خرید:

1. **خرید قطعهٔ موجود:** کاتالوگ، جست‌وجوی فارسی، سبد، رزرو موجودی و پرداخت ریالی.
2. **تأمین سفارشی برای هر برند:** درخواست، گفت‌وگو و فایل، پیش‌فاکتور نسخه‌دار، پذیرش، پرداخت تأییدشده در سرور، سپس مراحل تأمین و ارسال.

قیمت پایه به ریال (IRR) یا درهم (AED) ثبت می‌شود؛ پرداخت همیشه ریالی است و «تومان» واحد ورود یا نمایش نیست.

> **وضعیت:** نسخهٔ اول برای اجرای محلی با دادهٔ آزمایشی کامل است و آزمون‌های پذیرش را دارد. **آمادهٔ دریافت پول واقعی نیست:** اتصال درگاه زرین‌پال و پیامک کاوه‌نگار آماده است، ولی حساب پذیرندهٔ درگاه، کلید پیامک، دامنه، میزبان و متن‌های حقوقی هنوز تهیه یا تأیید نشده‌اند. فهرست کامل در [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md) و وضعیت دقیق در [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) است.

## ساختار مخزن

| مسیر | محتوا |
| --- | --- |
| `apps/web` | Next.js 16 (App Router) + next-intl: فروشگاه، حساب مشتری، پنل مدیریت |
| `apps/api` | NestJS 12: REST + WebSocket (Socket.IO)، Prisma 7، آزمون‌های یکپارچه |
| `apps/worker` | کارهای پس‌زمینه (outbox → BullMQ) و رندر PDF پیش‌فاکتور |
| `packages/domain` | منطق تجاری خالص و آزمون‌شده (پول، قیمت، جست‌وجو، وضعیت‌ها، زمان تأمین، فایل، Excel) |
| `packages/contracts` | اسکیماهای Zod و قرارداد مشترک API |
| `database/prisma` | مدل داده و migrationها |
| `infra` | Docker Compose، Dockerfile، Caddy |
| `docs` | معماری، تصمیم‌ها، راهنمای مدیر، استقرار، پشتیبان‌گیری، گزارش آزمون، چک‌لیست راه‌اندازی، OpenAPI، قالب import |
| `design-system/MASTER.md` | توکن‌ها و قواعد سیستم طراحی برند |

## پیش‌نیازها

| مورد | نسخه/توضیح |
| --- | --- |
| Node.js | ۲۲٫۱۲ یا بالاتر (آزموده با ۲۶٫۸٫۲) |
| pnpm | ۱۰٫۳۴٫۶ (`corepack enable`) |
| PostgreSQL | ۱۸ با کدگذاری UTF-8 و locale یونیکد (برای جست‌وجوی فارسی). برای توسعه بدون نصب: `pnpm --filter @hedax/api db:local` |
| Redis | ۸ — برای صف کارها، زمان‌بندی و چند نمونهٔ API؛ در production الزامی است. در توسعهٔ بدون Redis، worker را با `QUEUE_DRIVER=inline` اجرا کنید تا اسکن فایل، Excel، PDF و تطبیق پرداخت در همان فرایند worker انجام شوند |
| ClamAV | الزامی در production (`MALWARE_SCANNER=clamav`) |
| مرورگر Chromium/Edge/Chrome | برای PDF پیش‌فاکتور در worker (`PDF_BROWSER_CHANNEL` یا `PDF_BROWSER_EXECUTABLE`) |

## راه‌اندازی محلی (بدون Docker)

```bash
pnpm install
cp .env.example .env
# سه کلید تصادفی بسازید و در .env بگذارید (SESSION_SECRET، OTP_PEPPER، APP_ENCRYPTION_KEY):
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# PostgreSQL 18 محلی روی 127.0.0.1:55432 (پنجرهٔ جداگانه؛ Ctrl+C برای توقف)
pnpm --filter @hedax/api db:local
# در .env:  DATABASE_URL=postgresql://hedax:<LOCAL_PG_PASSWORD>@127.0.0.1:55432/hedax?schema=public

pnpm db:generate          # کلاینت Prisma
pnpm build                # همهٔ بسته‌ها
pnpm db:migrate:deploy    # اعمال migrationها
pnpm db:seed:dev          # دادهٔ نمونهٔ برچسب‌دار (DEMO-*، فقط توسعه)

# ساخت اولین مالک (رمز فقط از متغیر محیطی یا prompt؛ ثبت TOTP در اولین ورود الزامی است)
HEDAX_OWNER_PASSWORD='...' pnpm --filter @hedax/api owner:bootstrap -- --email owner@example.com --name "نام مالک"

pnpm dev:api              # http://localhost:4000 (مستند OpenAPI در /api/docs وقتی OPENAPI_ENABLED=true)
pnpm dev:web              # http://localhost:3000/fa — پنل: /fa/staff/login
pnpm dev:worker           # با Redis؛ بدون Redis در .env بگذارید: QUEUE_DRIVER=inline (فقط توسعه)
```

- **پیش‌نمایش رابط بدون پایگاه داده:** `pnpm dev:web:fixtures` (دادهٔ نمونهٔ برچسب‌دار؛ در build production مسدود است).
- **چت زنده در توسعه:** `NEXT_PUBLIC_WS_URL=http://localhost:4000`؛ پشت reverse proxy: `same-origin`؛ مقدار `off` یعنی دریافت دوره‌ای پیام‌ها.
- **کد OTP در توسعه:** با `SMS_PROVIDER=dev-log` کد در پاسخ API و لاگ توسعه برمی‌گردد؛ در production این حالت رد می‌شود.
- **پرداخت آزمایشی:** `PAYMENT_PROVIDER=simulator` صفحهٔ «درگاه آزمایشی» با برچسب واضح می‌سازد؛ هیچ پولی جابه‌جا نمی‌شود و در production رد می‌شود.
- **sandbox زرین‌پال:** `PAYMENT_PROVIDER=zarinpal` با `ZARINPAL_SANDBOX=true` و یک UUID دلخواه در `PAYMENT_MERCHANT_ID`، مشتری را به sandbox رسمی زرین‌پال می‌برد (بدون پول؛ در production رد می‌شود). آزمون مرورگری همین مسیر: `E2E_PAYMENT=zarinpal-sandbox pnpm --filter @hedax/web e2e:real`.

## فرمان‌ها

| فرمان | کار |
| --- | --- |
| `pnpm lint` | ESLint کل مخزن |
| `pnpm typecheck` | بررسی نوع همهٔ بسته‌ها |
| `pnpm build` | build همهٔ بسته‌ها |
| `pnpm test` | آزمون‌های واحد (domain، contracts، api، worker) |
| `pnpm --filter @hedax/api test:integration` | آزمون‌های یکپارچه روی PostgreSQL موقت (خودکار راه‌اندازی می‌شود؛ پیش از آن `pnpm --filter @hedax/api build`) |
| `pnpm e2e` | آزمون‌های مرورگری وب با دادهٔ پیش‌نمایش و Edge (`PW_CHANNEL=chrome` برای Chrome) |
| `pnpm --filter @hedax/web e2e:real` | آزمون‌های مرورگری روی پشتهٔ واقعی موقت: PostgreSQL موقت، API، worker (`QUEUE_DRIVER=inline`) و وب؛ مسیر مشتری و پنل مدیریت. پایگاه دادهٔ توسعه و `.env` دست نمی‌خورند (پیش از آن build مربوط به API و worker) |
| `pnpm --filter @hedax/web e2e:real -- --perf` | اندازه‌گیری آزمایشگاهی LCP و CLS صفحه‌های اصلی، جست‌وجو و محصول روی build production همان پشتهٔ موقت. شرایط: موبایل، CPU چهار برابر کندتر، شبکهٔ ۱٫۶ مگابیت. میانهٔ چند بارگذاری گزارش می‌شود (`E2E_PERF_SAMPLES`؛ trace اختیاری با `E2E_PERF_TRACE_DIR`) |
| `pnpm --filter @hedax/api openapi:export` | بازتولید `docs/api/openapi.json` |

## استقرار

Docker Compose با Caddy (HTTPS)، PostgreSQL، Redis، ClamAV، API، worker و وب در [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) شرح داده شده است. پشتیبان‌گیری و بازیابی در [`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md) است. پیکربندی Docker روی رایانهٔ توسعه با Docker Desktop اجرا و آزموده شده است (آزمون پذیرش در حالت production و ۱۵ آزمون مرورگری؛ [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md) بخش ۶). روی سرور هدف هنوز اجرا نشده است.

**نسخهٔ محلی برای بررسی (Docker، حالت توسعه با دادهٔ نمونه):** فایل `.env.docker-dev` را مانند `.env.example` بسازید، با رازهای تصادفی، `APP_ENV=development`، `PAYMENT_PROVIDER=simulator`، `SMS_PROVIDER=dev-log`، `HEDAX_DOMAIN=localhost`، `PUBLIC_BASE_URL=https://localhost` و `ACME_EMAIL`. این فایل بیرون از git می‌ماند. سپس به این ترتیب اجرا کنید: migration (`run --rm tools`)، ساخت مالک (`owner:bootstrap`) و **پس از آن** `seed-dev`، و در پایان `up -d`. همه با `docker compose -p hedax-review -f infra/docker-compose.yml --env-file .env.docker-dev`. Caddy برای `localhost` گواهی محلی می‌دهد و مرورگر یک‌بار هشدار نشان می‌دهد.

## قابلیت‌ها و اتصال‌ها

| دسته | وضعیت |
| --- | --- |
| کاتالوگ، جست‌وجوی فارسی، سبد، checkout، رزرو اتمیک، سفارش و ارسال | تکمیل و آزموده روی پایگاه دادهٔ واقعی |
| درخواست تأمین هر برند، چت و فایل، پیش‌فاکتور نسخه‌دار با PDF فارسی/انگلیسی، تأمین | تکمیل و آزموده |
| کارکنان، نقش‌ها، MFA، audit، Excel ورود/خروج، مرجوعی و استرداد | تکمیل و آزموده |
| **اتصال‌های آزمایشی** | شبیه‌ساز درگاه پرداخت، پیامک توسعه (`dev-log`)، اسکنر «بدون اسکن» توسعه، صف درون‌فرایندی worker (`QUEUE_DRIVER=inline`) — همه در production رد می‌شوند |
| **اتصال‌های واقعیِ آزموده** | PostgreSQL 18.4، Socket.IO، ذخیرهٔ فایل محلی، رندر PDF با Edge و با Chromium در Docker، Redis/BullMQ، ClamAV، Docker Compose و Caddy (روی Docker محلی) |
| **آماده، در انتظار حساب مالک** | درگاه زرین‌پال (آزموده با sandbox رسمی زرین‌پال؛ نیازمند شناسهٔ مرچنت)، پیامک کاوه‌نگار (آزمون واحد و قالب درخواست؛ نیازمند کلید API و قالب تأییدشده) — `docs/DEPLOYMENT.md` بخش ۹ |
| **آماده، در انتظار سرور** | پشتیبان خودکار رمزگذاری‌شده (`--profile backup`، `docs/BACKUP_RESTORE.md` بخش ۲٫۱) و دریافت امضای ضدویروس از mirror خصوصی (`infra/docker-compose.clamav-mirror.yml`)، هر دو آزموده روی Docker؛ سن امضای ضدویروس در readiness و داشبورد (آزمون واحد) |
| **نوشته‌شده ولی اجرانشده** | ذخیره‌ساز S3؛ استقرار روی سرور هدف با دامنه و گواهی عمومی |
| **موکول به بعد** | بیعانه/اقساط، رمزگشایی خودکار VIN، مدل سازگاری خودرو (طرح در `docs/FUTURE_CATALOG.md`) |

## مستندات

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — مرز ماژول‌ها، مدل داده، جریان پرداخت و تأمین
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — پیش‌فرض‌ها، ارز تسویه، اولویت قیمت، قواعد زمانی
- [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md) — محصول، تصویر، موجودی، Excel، کارمند، قیمت، سفارش
- [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md) — نتیجهٔ واقعی آزمون‌های پذیرش
- [`docs/api/openapi.json`](docs/api/openapi.json) — قرارداد API؛ [`docs/import/`](docs/import) — قالب import و نمونهٔ خطای سطری

## امنیت

- رازها فقط در `.env` یا مدیر رمز سرور؛ `.env` در git نیست و `.env.example` فقط نام متغیرها را دارد.
- هیچ مدیر یا رمز پیش‌فرضی در seed نیست؛ اولین مالک فقط با فرمان `owner:bootstrap` ساخته می‌شود و TOTP برایش اجباری است.
- در `APP_ENV=production` شبیه‌ساز پرداخت، پیامک توسعه، «بدون اسکن»، کوکی ناامن، آدرس http و OpenAPI عمومی باعث امتناع از اجرا می‌شوند.
