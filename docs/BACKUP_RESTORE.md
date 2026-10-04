# پشتیبان‌گیری و بازیابی

## ۱. از چه چیزی پشتیبان می‌گیریم

| داده | محل | روش |
| --- | --- | --- |
| پایگاه داده (سفارش، پیام، پرداخت، audit، …) | حجم `pgdata` در PostgreSQL | `pg_dump` با قالب custom (روزانه) |
| فایل‌های خصوصی (پیوست مشتری، PDF پیش‌فاکتور، Excel) | حجم `storage` → `private/` یا bucket خصوصی S3 | کپی همگام (tar یا rclone) |
| تصاویر عمومی محصول | `storage` → `public/` یا bucket عمومی | کپی همگام |
| کلیدها (`APP_ENCRYPTION_KEY`، `SESSION_SECRET`، `OTP_PEPPER`) و `.env` | بیرون از سرور | **جداگانه** در مدیر رمز یا گاوصندوق مالک |
| گواهی‌های Caddy | حجم `caddy_data` | اختیاری (دوباره صادر می‌شوند) |

نکته‌ها:

- بدون همان `APP_ENCRYPTION_KEY`، رمز TOTP کارکنان پس از بازیابی خوانا نیست و همه باید دوباره ثبت‌نام TOTP کنند.
- پایگاه داده و فایل‌ها را در یک بازهٔ کوتاه پشت سر هم پشتیبان بگیرید تا ارجاع پیام به فایل‌ها سازگار بماند.

## ۲. پشتیبان‌گیری روزانه (production، Docker)

```bash
COMPOSE="docker compose -f infra/docker-compose.yml --env-file .env"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p backups/$STAMP

# پایگاه داده: dump سازگار بدون توقف سرویس
$COMPOSE exec -T postgres pg_dump -U hedax -d hedax -Fc --no-owner > backups/$STAMP/hedax.dump

# فایل‌ها (درایور local)
$COMPOSE run --rm --entrypoint tar -v "$PWD/backups/$STAMP:/backup" api -czf /backup/storage.tgz -C /data storage

# رمزگذاری پیش از ارسال به بیرون از سرور (مثلاً با age یا gpg) و حذف نسخهٔ رمزنشده
```

- **نگهداری پیشنهادی:** ۷ نسخهٔ روزانه، ۴ هفتگی و ۶ ماهانه، در محلی بیرون از سرور اصلی (ذخیره‌ساز شیء یا سرور دوم).
- **هشدار:** شکست پشتیبان‌گیری یا کوچک‌شدن ناگهانی اندازهٔ فایل dump باید هشدار بدهد.
- با درایور S3، پیکربندی versioning و lifecycle خودِ bucket نسخهٔ قبلی فایل‌ها را نگه می‌دارد.
- در صورت نیاز به بازیابی تا لحظهٔ مشخص (PITR)، آرشیو WAL با ابزاری مثل pgBackRest یا WAL-G مرحلهٔ بعدی است و در نسخهٔ اول پیکربندی نشده است.

## ۳. بازیابی

```bash
COMPOSE="docker compose -f infra/docker-compose.yml --env-file .env"
# ۱) توقف سرویس‌هایی که می‌نویسند
$COMPOSE stop web api worker
# ۲) پایگاه داده: ایجاد پایگاه خالی و بازیابی
$COMPOSE exec -T postgres dropdb -U hedax --if-exists hedax
$COMPOSE exec -T postgres createdb -U hedax hedax
$COMPOSE exec -T postgres pg_restore -U hedax -d hedax --no-owner < backups/<STAMP>/hedax.dump
# ۳) فایل‌ها
$COMPOSE run --rm --entrypoint sh -v "$PWD/backups/<STAMP>:/backup" api -c "rm -rf /data/storage/* && tar -xzf /backup/storage.tgz -C /data"
# ۴) همان کلیدهای .env (به‌ویژه APP_ENCRYPTION_KEY)، سپس migrationهای احتمالاً جدیدتر و اجرا
$COMPOSE run --rm tools
$COMPOSE up -d
```

### بررسی پس از بازیابی (همان معیارهای آزمون A32)

1. readiness سالم است.
2. یک سفارش پرداخت‌شده با همان مبلغ، رسید و تاریخچه دیده می‌شود.
3. گفت‌وگوی یک درخواست تأمین با همهٔ پیام‌ها باز می‌شود.
4. پیوست آن گفت‌وگو برای صاحبش دانلود می‌شود و برای مشتری دیگر «پیدا نشد» است.
5. کارمند پشتیبانِ ارجاع‌شده گفت‌وگو را می‌بیند ولی همچنان نمی‌تواند قیمت را تغییر دهد.
6. مالک با TOTP وارد می‌شود.
7. جدول‌های append-only (مثل `audit_log`) همچنان تغییرناپذیرند.

## ۴. وضعیت آزمون

| روش | وضعیت |
| --- | --- |
| **مانور بازیابی سطح فایل** | **اجرا و پاس شد** (آزمون خودکار `apps/api/test/integration/60-backup-restore.test.ts`، PostgreSQL 18.4 بومی). داده ساخته شد (سفارش پرداخت‌شده، پیام با پیوست، ارجاع کارمند)؛ پس از خاموشی تمیز، پوشهٔ داده و فایل‌های خصوصی کپی شدند؛ هر دو حذف و از پشتیبان بازگردانده شدند. شمار سفارش، پیام، فایل، نقش و audit برابر بود؛ هش فایل دانلودشده یکسان بود؛ دسترسی‌ها، TOTP مالک و trigger جدول‌های append-only برقرار ماندند |
| **روش production با `pg_dump`/`pg_restore` و Docker** | **اجرا و پاس شد روی پشتهٔ Docker محلی (۲۰۲۶-۱۰-۰۴، حالت production)، به‌صورت غیرمخرب.** دستورهای بخش ۲ عیناً اجرا شدند: dump حدود ۲۲۴ کیلوبایت و آرشیو فایل‌ها. بازیابی در پایگاه **جدید** `hedax_restore` و volume **جدید** انجام شد. شمار ردیف‌های کاربر، کالا، عکس، فایل، audit، outbox، حرکت موجودی، import و نقش با اصل برابر بود و ۷ trigger برقرار ماند. ویرایش `audit_log` در نسخهٔ بازیابی‌شده رد شد («append-only»). hash هر دو فایل ذخیره‌شده یکسان بود. API روی پایگاه بازیابی‌شده «ready» شد و همان کالا را نشان داد. **روی سرور هدف، و مسیر بازیابی جایگزین (حذف پایگاه و فایل‌های جاری)، هنوز اجرا نشده است** |

**مسیر پشتیبان:** پوشهٔ `backups/` در `.gitignore` و `.dockerignore` است، چون dump و آرشیو فایل‌ها دادهٔ مشتری دارند و نباید وارد git یا build ایمیج شوند. نسخهٔ بیرون از سرور را رمزگذاری کنید.
