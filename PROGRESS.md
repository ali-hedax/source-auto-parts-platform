# Source by HEDAX — وضعیت و نقطهٔ ادامه

آخرین به‌روزرسانی: 2026-10-18، ساعت 18:25، Asia/Tehran (+03:30).

این فایل مرجع ادامهٔ کار است. ابتدای هر جلسه، ابتدا این فایل و وضعیت واقعی Git
بررسی شوند. پس از هر مرحلهٔ مهم، نتیجه، خطاها، فایل‌ها و قدم بعدی به‌روز شوند.
هیچ رمز، توکن، دادهٔ مشتری یا محتوای محرمانهٔ فایل تأمین‌کننده در این فایل ثبت نشود.

## نقطهٔ فعلی

- درخواست فعال: ممیزی و ارتقای تدریجی پروژهٔ موجود؛ اکنون مرحلهٔ اصلاح ایمنی
  Import/Undo، شماره‌قطعه و فیلتر سازگاری خودرو در حال تکمیل است.
- درخواست جدید مالک: ثبت دائمی پیشرفت و دستور ادامهٔ جلسات؛ این فایل و
  `AGENTS.md` ریشه برای همین منظور ایجاد شدند.
- شاخهٔ کاری: `refactor/source-enterprise-upgrade`.
- HEAD بررسی‌شده و مبنای تغییرات: `d205e373478b628f377feb4915dd19477d0f4eae`
  (ادغام PR #26، visual website builder).
- شاخه از `origin/main` به‌روز ایجاد شده؛ upstream فعلی `origin/main` است.
  هنگام push باید نام شاخهٔ feature صریح باشد. main محلی اولیه `391513d` بود.
- تغییرات این مرحله هنوز commit/push نشده‌اند؛ PR جدیدی ایجاد نشده است.
- یک worktree جدا با شاخهٔ `deploy/card-fitment` وجود دارد؛ در این کار تغییر نکرده است.
- هیچ deploy، migration یا تغییر داده روی Production در این کار انجام نشده است.
  هر تغییر Production به تأیید صریح مالک نیاز دارد.

## وضعیت واقعی پروژه و کارهای موجود

- Monorepo شامل `apps/web` (Next.js/React)، `apps/api` (NestJS/Prisma)،
  `apps/worker`، و بسته‌های مشترک domain/contracts/config است.
- PostgreSQL، Redis/BullMQ، ذخیره‌سازی فایل و زیرساخت Docker/Caddy/ClamAV وجود دارند.
- کاتالوگ فنی یکپارچه با Product، قیمت/موجودی مستقل، Brand Import، جدول‌های
  نگاشت مهاجرت کاتالوگ، مرکز دانش، CMS با draft/publish/rollback و جریان تأمین
  از قبل در کد موجودند؛ نباید دوباره از صفر ساخته شوند.
- در بررسی اولیه ۱۸ پوشهٔ migration و ۹۰ فایل page/route وب شمارش شد.
- `IMPLEMENTATION_PROGRESS.md`، `IMPLEMENTATION_STATUS.md` و اسناد `docs/`
  سابقهٔ قبلی‌اند؛ ادعاهای استقرار/تست قدیمی، تأیید وضعیت فعلی Production نیستند.
- وابستگی‌های محلی پس از به‌روزرسانی شاخه با `pnpm install --frozen-lockfile`
  همگام شدند؛ manifest/lockfile تغییر نکرد. Prisma Client محلی تولید شد.
- تست‌های یکپارچه از PostgreSQL موقت و دادهٔ ساختگی استفاده می‌کنند؛ اتصال
  پرداخت/پیامک شبیه‌سازی شده است. محیط محلی موجود یا دادهٔ Production مصرف نشد.

## تکمیل‌شده و شواهد آزمون — Completed & Tested

این نتایج در همین کار اجرا شده‌اند؛ موفقیت تست‌های محلی معادل آماده‌بودن انتشار نیست.

| بررسی | نتیجه و محدوده |
| --- | --- |
| baseline واحد روی مبنای شاخه | ۲۱۷ تست: domain 125، contracts 12، API 80 موفق |
| baseline یکپارچه API | ۱۳۴ موفق؛ یک benchmark اختیاری اجرا نشده؛ ۲۸ فایل موفق، یک فایل skipped؛ exit 0 |
| بازیابی پشتیبان در baseline | تست بازیابی PostgreSQL موقت موفق؛ اثبات بازیابی backup واقعی Production نیست |
| واحد پس از اصلاحات | ۲۲۲ تست: domain 125، contracts 12، API 85 موفق |
| تست‌های هدفمند آرشیو/Excel/upload | ۷ تست موفق؛ زیرمجموعهٔ شمارش بالا هستند |
| `pnpm typecheck` | موفق در کل workspace؛ بررسی ترجمه‌ها/مجوزها/audit نیز موفق |
| `pnpm lint` | موفق پس از اصلاحات |
| build بسته‌های مشترک و API | موفق؛ build نهایی کل پروژه هنوز انجام نشده |
| `pnpm --filter @hedax/web e2e -- unified-parts.spec.ts` | ۹ از ۹ موفق، exit 0؛ مرورگر محلی با fixture ساختگی، نه backend واقعی |
| API integration: `85-vehicles`, `91-unified-parts`, `93-brand-import-integrity` | همهٔ ۲۴ assertion موفق؛ فرمان به علت خطای teardown با exit 1 پایان یافت؛ جزئیات زیر |

## پیاده‌سازی جاری — Implemented Pending Verification

اصلاحات زیر نوشته شده‌اند و تست‌های مرتبط بالا را دارند؛ بازبینی نهایی، نمونهٔ واقعی،
build کامل و رفع شکست teardown هنوز باقی است:

- Undo با checkpoint نسخهٔ قطعه، حفظ ویرایش‌های بعدی و قطعات دارای استفادهٔ تجاری؛
  جلوگیری از حلقهٔ بی‌پایان Undo و حفظ محافظه‌کارانهٔ Importهای قدیمی بدون checkpoint.
- قفل تراکنشی عملیات هم‌زمان یک سازنده، ترتیب بر اساس شروع واقعی، ثبت FAILED
  برای اجرای ناقص، امکان Undo اجرای ناقص و پردازش قابل تکرار Undo.
- حفظ صفرهای اول شماره‌قطعه در قالب صریح Excel مانند `000000`؛ فرمول اجرا نمی‌شود.
- محدودیت و بررسی ساختار ZIP، حجم واقعی inflate، metadata XLSX و مسیر منبع فایل؛
  جلوگیری از تداخل دو فایل هم‌نام در پوشه‌های متفاوت.
- پاک‌سازی upload موقت با metadata نامعتبر و خنثی‌سازی formula injection در CSV خطا.
- فیلتر خودرو: مدل نامعتبر، غیرفعال یا بدون خودروی متناظر دیگر نتیجهٔ نامرتبط نمی‌دهد.
- توضیح دقیق Undo و آمار حفظ‌شده‌ها در پنل/راهنما، ترجمهٔ خطا و رویداد شکست،
  و افزودن سه suite مرتبط به CI. CI راه‌دور هنوز اجرا نشده است.

## خطاها و موارد ناتمام

1. **خطای باز در teardown ویندوز:** پس از موفقیت ۲۴ تست اخیر، حذف پوشهٔ موقت
   `apps/api/.local-pg/test-9400` در `global-setup.ts` با `EPERM` شکست خورد.
   علت دقیق هنوز تأیید نشده؛ توقف PostgreSQL و قفل فایل باید بررسی شود. هیچ
   process یا دیتابیس نامرتبطی نباید متوقف یا حذف شود. نتیجهٔ کل فرمان موفق نیست.
2. خطاهای اولیهٔ `spawn EPERM` ناشی از sandbox با اجرای مجاز محلی رفع شدند.
   نبود وابستگی‌های جدید در node_modules با نصب frozen lockfile رفع شد.
3. نمونهٔ واقعی `Hyundai-Kia-Parts-List-sff8fl.zip` در Desktop توسط مالک معرفی شد
   (حدود ۴٫۵ مگابایت). محتوا هنوز بررسی نشده؛ فقط داده محسوب می‌شود. دادهٔ نمونه
   نباید commit شود یا به Production وارد شود.
4. بازبینی نهایی تغییرات، بررسی retry/counter در اجرای Import، build کامل، آزمون
   نمونهٔ واقعی و تکمیل گزارش ممیزی/تصمیم معماری/runbook/rollback باقی مانده‌اند.
5. مقایسهٔ عملکرد قبل/بعد این اصلاحات اندازه‌گیری نشده؛ اعداد قدیمی را نباید به
   عنوان benchmark فعلی یا ادعای بهبود سرعت معرفی کرد.

## فایل‌های تغییرکرده در این مرحله

فهرست زیر checkpoint است؛ پیش از ادامه با `git status --short` تطبیق داده شود.

- پردازش Import:
  `apps/api/src/modules/brand-imports/brand-file.ts`،
  `apps/api/src/modules/brand-imports/brand-imports.controller.ts`،
  `apps/api/src/modules/brand-imports/brand-imports.service.ts`،
  `apps/api/src/modules/imports/spreadsheet.ts`،
  `apps/api/src/modules/imports/number-format.ts` (جدید).
- کاتالوگ و قرارداد: `apps/api/src/modules/catalog/catalog.service.ts`،
  `packages/contracts/src/brand-imports.ts`.
- تست‌ها: `apps/api/test/integration/85-vehicles.test.ts`،
  `apps/api/test/integration/93-brand-import-integrity.test.ts` (جدید)،
  `apps/api/test/unit/spreadsheet-reader.test.ts`،
  `apps/api/test/unit/brand-archive.test.ts` (جدید)،
  `apps/api/test/unit/brand-upload-cleanup.test.ts` (جدید)، `.github/workflows/ci.yml`.
- پنل و ترجمه: `apps/web/src/components/admin/brand-imports.tsx`،
  `apps/web/messages/fa.json`، `apps/web/messages/en.json`.
- راهنما: `docs/PARTS_UNIFIED_PHASE4.md`، `docs/STAFF_GUIDE_PARTS.md`.
- استمرار کار: `AGENTS.md` و `PROGRESS.md` ریشه (جدید).
- تغییرات جانبی تولیدشده توسط تست/dev، نیازمند بازگردانی کنترل‌شده پیش از commit:
  `apps/web/next-env.d.ts`، `docs/import/hedax-products-template.xlsx`،
  `docs/import/sample-import-with-errors.xlsx`، `docs/import/sample-row-errors.xlsx`.
  این فایل‌ها تغییر محصولی عمدی نیستند؛ سایر تغییرات نباید بازگردانده شوند.

## وابستگی خارجی و تصمیم مالک

- **Blocked External:** محیط و روش استقرار مستقل `preview.sourcebyhedax.ir` و
  جدایی دیتابیس/فایل‌های آن هنوز تأیید نشده؛ Preview مستقر نشده است. عدم موفقیت
  ابزار وب در بازکردن دامنه، اثبات خاموش‌بودن سایت نیست.
- **Requires Owner Decision:** هر deploy یا migration روی Production؛ ادغام در
  مسیر انتشار Production؛ فعال‌سازی سرویس پولی یا ارسال پیام واقعی.
- **Blocked External:** داده/API دارای مجوز VIN/Microcat و اعتبارنامهٔ providerهای
  واقعی تأیید نشده‌اند؛ نباید سازگاری خودرو یا پاسخ واقعی سرویس جعل شود.
- **Deferred Later:** قابلیت‌های اختیاری AI/RAG تا تکمیل یکپارچگی داده و مشخص‌شدن
  منبع معتبر/سرویس؛ بازطراحی گستردهٔ بی‌دلیل در این مرحله انجام نشود.

## قدم بعدی دقیق

1. صحت دو فایل استمرار کار و تطبیق این checkpoint با Git بررسی شود.
2. خطای teardown بررسی و در صورت نیاز فقط harness تست اصلاح شود؛ سپس suiteهای
   هدفمند دوباره اجرا شوند تا نتیجهٔ کل فرمان روشن شود. baseline کامل بی‌دلیل تکرار نشود.
3. فهرست ورودی‌های ZIP واقعی بدون استخراج کور بررسی شود؛ سپس ساختار/ستون‌ها و
   حفظ شماره‌قطعه با parser موجود در محیط محلی ایزوله ارزیابی شوند.
4. بازبینی اصلاحات، مستندات ممیزی، build و کنترل‌های لازم تکمیل؛ تغییرات جانبی
   تولیدشده بازگردانده؛ checkpoint در شاخهٔ feature commit و PR قابل بررسی آماده شود.
5. Preview تنها پس از تأیید جدایی محیط و دسترسی موجود؛ Production تنها با تأیید مالک.

## تاریخچهٔ مراحل

- 2026-10-18: بررسی repo/Git، به‌روزرسانی مبنا، ایجاد شاخهٔ feature و baseline موفق.
- 2026-10-18: اصلاحات Import/Undo/ZIP/Excel/fitment و تست‌های رگرسیون نوشته شدند؛
  واحد/typecheck/lint/مرورگر موفق؛ شکست teardown تست یکپارچه به‌عنوان مورد باز ثبت شد.
- 2026-10-18 18:25 +03:30: ایجاد `PROGRESS.md` و دستور دائمی در `AGENTS.md` طبق
  درخواست مالک؛ کار قبلی حفظ شده، Production تغییر نکرده است.
