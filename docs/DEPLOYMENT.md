# استقرار هداکس

> **وضعیت:** پیکربندی Docker (`infra/`) نوشته شده ولی در محیط ساخت **اجرا نشده است**، چون Docker و WSL نصب نبودند. پیش از استقرار واقعی، بخش «آزمون پذیرش استقرار» را روی سرور هدف اجرا کنید. خرید سرور، دامنه یا هر سرویس پولی بر عهدهٔ مالک است.

## ۱. معماری پیشنهادی (بند ۱۸)

- یک سرور لینوکسی (VPS) با Docker و امکان افزایش منابع، به‌اضافهٔ **ذخیره‌ساز شیء** برای فایل‌ها (اختیاری در شروع) و **نسخهٔ پشتیبان بیرون از سرور اصلی**.
- سرویس‌ها: `caddy` (HTTPS)، `web` (Next.js)، `api` (NestJS + WebSocket)، `worker` (صف، PDF)، `postgres` 18، `redis` 8 و `clamav`. فقط Caddy پورت ۸۰/۴۴۳ را باز می‌کند.
- **برآورد اولیهٔ منابع، نه تضمین:** ۴ vCPU، ۸ GB RAM و ۸۰ GB SSD. ClamAV حدود ۲ تا ۳ GB حافظه می‌خواهد و Chromium هنگام ساخت PDF حافظه مصرف می‌کند. ظرفیت واقعی را آزمون بار با دادهٔ نمونه تعیین می‌کند.
- محل و ارائه‌دهندهٔ سرور را با این معیارها انتخاب کنید: دسترسی واقعی کاربران ایران، شرایط درگاه پرداخت و پیامک (مثلاً محدودیت IP یا محل سرور برای callback)، شرایط سرویس و بودجه.

## ۲. پیش‌نیاز روی سرور

1. Docker Engine و Docker Compose v2؛ ساعت سرور همگام (NTP).
2. رکورد DNS از نوع A/AAAA برای دامنه به IP سرور؛ پورت‌های ۸۰ و ۴۴۳ باز؛ دیوار آتش برای بقیهٔ پورت‌ها بسته؛ ورود SSH فقط با کلید.
3. کلون مخزن روی سرور.

## ۳. پیکربندی

از `.env.example` فایل `.env` بسازید (کنار ریشهٔ مخزن، بیرون از git):

| متغیر | مقدار production |
| --- | --- |
| `APP_ENV` | `production` |
| `HEDAX_DOMAIN` | دامنهٔ نهایی، مثلاً `shop.example.ir` |
| `PUBLIC_BASE_URL` | `https://<دامنه>` |
| `ACME_EMAIL` | ایمیل مدیر برای گواهی TLS |
| `POSTGRES_PASSWORD` | رمز تصادفی بلند |
| `SESSION_SECRET`، `OTP_PEPPER`، `APP_ENCRYPTION_KEY` | هر کدام ۳۲ بایت تصادفی base64؛ **جداگانه و امن نگهداری شوند** (بدون `APP_ENCRYPTION_KEY` رمز TOTP کارکنان پس از بازیابی خوانا نیست) |
| `STORAGE_DRIVER` | `local` (حجم `storage`) یا `s3` با متغیرهای `S3_*` و `PUBLIC_MEDIA_BASE_URL` به آدرس عمومی bucket |
| `PAYMENT_PROVIDER` | `none` تا زمانی که adapter درگاه واقعی نوشته و آزموده شود؛ شبیه‌ساز در production رد می‌شود |
| `SMS_PROVIDER` | `none` تا اتصال سرویس پیامک؛ ورود مشتری با OTP تا آن زمان ممکن نیست |
| `REVALIDATE_SECRET` | ۳۲ بایت تصادفی base64. API و worker پس از تغییر کالا، قیمت، موجودی، نرخ یا متن‌ها با این راز از وب می‌خواهند cache صفحات عمومی را فوراً تازه کند (Compose نشانی داخلی `http://web:3000` را خودش می‌دهد) |

Compose این مقادیر را خودش تنظیم می‌کند: `COOKIE_SECURE=true`، `OPENAPI_ENABLED=false`، `TRUST_PROXY=true`، `MALWARE_SCANNER=clamav`. در production، اجرا با شبیه‌ساز، پیامک توسعه، «بدون اسکن»، صف درون‌فرایندی (`QUEUE_DRIVER=inline`)، کوکی ناامن، آدرس http یا OpenAPI عمومی ممتنع است. مقدار پیش‌فرض `QUEUE_DRIVER` همان `bullmq` است و نیازی به تنظیم ندارد.

## ۴. راه‌اندازی

همهٔ فرمان‌ها از ریشهٔ مخزن اجرا می‌شوند:

```bash
COMPOSE="docker compose -f infra/docker-compose.yml --env-file .env"

$COMPOSE build
$COMPOSE up -d postgres redis clamav           # اولین اجرای ClamAV چند دقیقه طول می‌کشد
$COMPOSE run --rm tools                        # prisma migrate deploy
# اولین مالک (seed پایه هم اجرا می‌شود؛ رمز فقط از متغیر محیطی)
read -s HEDAX_OWNER_PASSWORD && export HEDAX_OWNER_PASSWORD
$COMPOSE run --rm -e HEDAX_OWNER_PASSWORD tools node dist/cli/bootstrap-owner.js --email owner@your-domain --name "نام مالک"
unset HEDAX_OWNER_PASSWORD
$COMPOSE up -d
```

- **دادهٔ نمونه (`seed-dev`) را روی production اجرا نکنید**؛ در `APP_ENV=production` اجرا رد می‌شود.
- پس از اولین ورود مالک در `https://<دامنه>/fa/staff/login`، ثبت TOTP اجباری است.
- سپس در پنل این موارد را کامل کنید: شرایط فروش و سیاست‌ها (منتشرشده)، روش‌های ارسال، نرخ تبدیل، تقویم کاری، اطلاعات تماس تأییدشده و مالیات. چک‌لیست کامل در [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md) است.

## ۵. آزمون پذیرش استقرار (پیش از باز کردن سایت)

```bash
$COMPOSE ps                                                   # همه healthy
$COMPOSE exec api node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
```

باید `database`، `redis` و `storage` برابر `up`، `searchLocale` برابر `ok` و `scanner` برابر `up` باشد. سپس:

1. `https://<دامنه>/fa` و `/en` باز شوند و `/parts` به `/fa/parts` هدایت شود.
2. یک محصول با عکس ساخته و منتشر شود و عکس در فروشگاه دیده شود.
3. بارگذاری یک PDF در گفت‌وگو پس از اسکن «آماده» شود و فایل EICAR آزمایشی «رد» شود.
4. یک پیش‌فاکتور ارسال شود و PDF فارسی و انگلیسی آن ساخته شود.
5. چت دوطرفه در دو مرورگر زنده باشد (WebSocket از مسیر `/api/v1/ws`).
6. پشتیبان‌گیری و بازیابی آزمایشی طبق [`BACKUP_RESTORE.md`](BACKUP_RESTORE.md) اجرا شود.

## ۶. امنیت عملیاتی

- PostgreSQL، Redis، ClamAV و ذخیره‌ساز خصوصی هیچ پورت عمومی ندارند (فقط شبکهٔ داخلی Compose).
- `.env` با دسترسی `600` و مالک کاربر سرویس؛ هیچ رازی در image یا git نیست (`.dockerignore`).
- به‌روزرسانی منظم سیستم‌عامل و imageها؛ نسخهٔ Node و پایگاه داده پین شده‌اند.
- لاگ‌ها JSON و چرخشی‌اند (هر سرویس ۵×۱۰MB). لاگ درخواست بدنه، کوکی یا دادهٔ شخصی ندارد.
- مسیر `/health` از اینترنت در دسترس نیست و بررسی سلامت داخل شبکهٔ Docker انجام می‌شود.

## ۷. پایش و هشدار

حداقل این‌ها هشدار داشته باشند: خطای readiness، پر شدن دیسک (بیش از ۸۰٪)، توقف صف (رویداد outbox در وضعیت `PENDING` قدیمی‌تر از چند دقیقه)، شکست پشتیبان‌گیری، انقضای گواهی TLS و ناهمگامی ساعت سرور. پرونده‌های باز پرداخت در داشبورد دیده می‌شوند.

## ۸. به‌روزرسانی نسخه

```bash
git pull
$COMPOSE build
$COMPOSE run --rm tools          # migrationهای جدید (افزایشی)
$COMPOSE up -d
```

پیش از هر به‌روزرسانی پشتیبان بگیرید. migrationها افزایشی نوشته شده‌اند. برای بازگشت، image قبلی را اجرا کنید و در صورت نیاز پایگاه داده را از پشتیبان بازیابی کنید.

## ۹. اتصال درگاه و پیامک واقعی

- **درگاه:** adapter جدید interface `PaymentProvider` را پیاده می‌کند (ایجاد نشست، تأیید سرور به سرور، استعلام و در صورت پشتیبانی استرداد). آدرس callback برابر است با `https://<دامنه>/api/v1/payments/callback/<code>`. callback فقط شناسه است و موفقیت فقط با تأیید سرور ثبت می‌شود. پیش از فعال‌سازی، آزمون‌های A08 تا A12 با حساب آزمایشی درگاه تکرار شوند.
- **پیامک:** adapter جدید interface `SmsProvider` (قالب OTP و اعلان‌ها) را پیاده می‌کند. محدودیت نرخ در Redis در production فعال است.
