# Source by HEDAX — وضعیت و نقطهٔ ادامه

آخرین به‌روزرسانی: 2026-10-19، ساعت 09:46، Asia/Tehran (+03:30).

این فایل مرجع ادامهٔ کار است. ابتدای هر جلسه، ابتدا این فایل و وضعیت واقعی Git
بررسی شوند. پس از هر مرحلهٔ مهم، نتیجه، خطاها، فایل‌ها و قدم بعدی به‌روز شوند.
هیچ رمز، توکن، دادهٔ مشتری یا محتوای محرمانهٔ فایل تأمین‌کننده در این فایل ثبت نشود.

## نقطهٔ فعلی

- ادامهٔ TEST-02 طبق درخواست مالک: Git و PR #28 با HEAD `c8eb406` تطبیق داده شدند؛
  فقط ثبت نهایی قبلی این فایل محلی بود و حفظ شد. بررسی فعلی فقط backup در Linux
  است؛ سناریوهای تکمیل‌شدهٔ Import/نمونه دوباره اجرا نمی‌شوند مگر CI به‌طور خودکار.
- **Implemented Pending Verification:** ثبت مراحل و خطای startup در suite `60`
  اضافه شد. dependency هنگام خروج child پیش از readiness با `undefined` reject
  می‌کند؛ لاگ قبلی علت اصلی را پنهان کرده بود. مرحلهٔ مستقل suite `60` به CI موجود
  افزوده شد تا شکست قابل تکرار/تشخیص باشد؛ هیچ assertion یا timeout کاهش/حذف نشد.
- **آخرین نتیجه:** CI روی HEAD `c8eb406d355adcbf4a7982b3c80b75898a5b98af`
  [موفق شد](https://github.com/ali-hedax/source-auto-parts-platform/actions/runs/39208551626):
  ۲۲۸ تست واحد (domain 128، contracts 12، API 88)، پنج suite Import/کاتالوگ با
  ۳۳ تست، دو suite CMS با ۱۲ تست، lint/typecheck و production web build همگی موفق.
  این نتیجه برای **هدف مشخص CI** است؛ شکست قبلی suite کامل backup در Linux،
  **TEST-02**، همچنان باز و مانع آماده‌اعلام‌کردن انتشار است.
- قدم ناتمام بعدی: ریشه‌یابی TEST-02 با trace در suite `60` روی Linux. IMP-07،
  خواندن نمونه، کنترل‌های محلی و CI هدفمند تکمیل‌اند و بی‌دلیل تکرار نشوند.
  همهٔ کدها و اسناد در شاخهٔ feature ثبت/ارسال شده‌اند؛ تنها تغییر محلی پس از
  آخرین commit، همین ثبت نتیجهٔ نهایی در `PROGRESS.md` است.
- ادامهٔ جدید 2026-10-19: درخواست ادامهٔ پیاده‌سازی دریافت شد؛ Git/HEAD با checkpoint
  قبلی مطابق بود. محدودیت موقت «فقط مستندسازی» با درخواست جدید ادامه جایگزین شد.
  بررسی خودکار مجوز اکنون همان اجرای محلی را پذیرفت؛ محدودیت دور زده نشد.
- **Completed & Tested محلی — IMP-07:** ذخیرهٔ اتمیک داده/آمار/خطا/ردیف
  پردازش‌شده با hash پیشوند، رد delivery عقب‌مانده و حفظ محافظه‌کارانهٔ job قدیمی
  بدون checkpoint نوشته و با هفت آزمون `95-brand-import-recovery.test.ts` تأیید شد.
  قطع پس از commit با fault injection شبیه‌سازی شد؛ کشتن فرایند/قطع برق واقعی انجام نشد.
- کنترل نهایی همین تغییر: چهار suite `91/93/94/95` شامل **۲۵ تست موفق، exit 0،
  125.29 ثانیه**؛ typecheck و lint کل workspace موفق؛ build کامل شامل وب/API/worker
  موفق. دو تست مرورگر ناتمام موفق شدند و تصویر موبایل ۳۹۰ پیکسلی بررسی شد.
- کد و تست‌های تأییدشده در commit محلی `8c1869d` ثبت شدند؛ ۲۶ فایل. سه Excel
  تولیدشده پس از مقایسهٔ ZIP/XML به HEAD بازگردانده شدند؛ فقط تاریخ و شناسهٔ ساختگی
  تست تغییر کرده بود. `next-env.d.ts` پس از build کامل با HEAD یکسان است.
- اسناد در `d125e31` ثبت و شاخهٔ feature به origin ارسال شد؛ upstream اکنون
  `origin/refactor/source-enterprise-upgrade` است. [Draft PR #28](https://github.com/ali-hedax/source-auto-parts-platform/pull/28)
  باز و ادغام‌نشده است. CI راه‌دور [39206636901](https://github.com/ali-hedax/source-auto-parts-platform/actions/runs/39206636901)
  نخست روی HEAD قبلی آغاز شد؛ نتیجهٔ مرجع اکنون اجرای موفق `39208551626` است.
- checkpoint لینک PR و upstream در `96ac35a` commit و push شد؛ کد همان
  `8c1869d` است. بررسی CI باید برای HEAD `96ac35a16026247a3790d7e331b780ac93a1fc4b`
  انجام شود، نه صرفاً اجرای قبلی. این ثبتِ نتیجه پس از commit ممکن است تنها تغییر
  محلی `PROGRESS.md` باشد؛ هیچ کد ثبت‌نشده‌ای نباید از این مرحله باقی بماند.
- **شکست CI راه‌دور در HEAD `96ac35a`:** اجرای
  [39206844504](https://github.com/ali-hedax/source-auto-parts-platform/actions/runs/39206844504)
  exit 1 داشت. lint/typecheck/unit موفق بودند، ولی به‌علت تفاوت forwarding دستور
  pnpm در Linux، `--` به Vitest رسید و فیلتر پنج فایل نادیده گرفته شد. کل integration
  اجرا شد: ۱۴۹ تست موفق، یک failed، یک skipped؛ suite بازیابی backup (`60`) timeout
  داد (هم تست و هم teardown ناموفق گزارش شدند). این failure رفع‌شده محسوب نمی‌شود.
- فرمان CI به `pnpm --filter @hedax/api exec vitest run --config ...` تغییر کرد؛
  هدف همچنان همان پنج suite است. افزایش timeout یا حذف assertion انجام نشد.
  شکست Linuxِ backup مستقل از این اصلاح فرمان، یک مورد بازِ مانع انتشار است.
- اصلاح فرمان و ثبت failure در `c8eb406d355adcbf4a7982b3c80b75898a5b98af`
  commit/push شدند. `vitest list --filesOnly` دقیقاً همان پنج فایل را انتخاب کرد؛
  این بررسی، اجرای دوبارهٔ آزمون‌ها نبود. CI جدید
  [39208551626](https://github.com/ali-hedax/source-auto-parts-platform/actions/runs/39208551626)
  برای همین HEAD موفق شد. شرح PR نیز TEST-02 را به‌عنوان مورد باز نشان می‌دهد.
- lint اولیه فقط سه خطای console در دو اسکریپت خصوصی ignored در `.local-run` داشت.
  این مسیر runtime از قبل در Git نادیده گرفته می‌شد؛ اکنون از ESLint نیز مستثنا شد.
  اجرای مجدد lint موفق بود؛ قواعد source برنامه ضعیف نشدند.
- ابتدای جلسه `PROGRESS.md`، `AGENTS.md`، Git و diff با HEAD قبلی `e45515d`
  تطبیق داده شدند؛ سپس دو commit این مرحله ثبت شدند. کارهای قبلی حفظ و baseline تکرار نشد.
- شروع 2026-10-19: checkpoint قبلی پیش از ثبت نتایج نهایی متوقف شده بود؛ شواهد
  اجرای همان جلسه با فایل‌ها تطبیق داده شد. خواندن نمونه و تست‌های موفق تکرار نمی‌شوند.
- مرحلهٔ جاری: خواندن XLS و ZIP ترکیبی، تشخیص/انتخاب ردیف عنوان و نگاشت مستقل
  هر شیت. کل نمونه خوانده شده؛ برخی منابع دارای عنوان مقدماتی، سرستون نامشخص،
  سرستون تکراری یا بدون سرستون هستند. ستون‌های قیمت تاریخی/تعداد سفارش وجود دارند.
  این بررسی مجوز تبدیل آنها به قیمت/موجودی یا سازگاری قطعی خودرو نیست.
- پیاده‌سازی workbook نوشته شده و پذیرش نهایی آن باقی است: SheetJS رسمی نسخهٔ ثابت 0.20.3 اضافه شد؛
  XLS در worker thread با محدودیت حافظه/زمان خوانده می‌شود؛ ZIP شامل XLS/XLSX/CSV
  و نگاشت مستقل منبع در API/پنل نوشته شده‌اند. هنوز نباید این مرحله را کامل تلقی کرد.
- آزمون‌های هدفمند جدید: domain header/mapping هشت تست و archive/spreadsheet نه
  تست موفق. خطای TypeScript مقداردهی timer اصلاح شد؛ build API و typecheck کل
  workspace موفق شدند. سه suite مرتبط `91`، `93`، `94` شامل ۱۸ تست، exit 0، موفق بودند.
- parser جدید کل ZIP واقعی را خواند: ۴۴ فایل، ۵۴ شیت، ۱۶٬۲۰۴ ردیف غیرخالی؛
  ۳۹ شیت نیازمند بررسی دستی سرستون هستند. دادهٔ نمونه وارد هیچ دیتابیسی نشده است.
- آزمون مرورگر جدید و lint در پایان جلسهٔ قبل اجرا نشدند: سامانهٔ بررسی خودکار
  مجوز به‌علت سقف مصرف حساب نتوانست بررسی را تکمیل کند؛ این تشخیص ناامن‌بودن نبود.
  تلاش 2026-10-19 هم پیش از اجرای فرمان‌ها با `Selected model is at capacity`
  متوقف شد. هیچ‌یک اجرا نشدند و مسیر مجوز دور زده نشد.
- مالک پس از خطای ابزار ابتدا مستندسازی را انتخاب کرد و سپس ادامهٔ کار را خواست؛
  این سابقه به معنی منع فعلی تست محلی نیست. آزمون‌های قدیمی و خواندن نمونه تکرار نشدند؛
  اجرای هدفمند ۲۵ تست به‌علت تغییر جدید مسیر run ضروری بود.
- مورد **IMP-07** ابتدا با بازبینی ایستا پیدا شد و اکنون اصلاح شده است: شمارنده و
  خطاها در retry پاک نمی‌شوند؛ پیشوند ذخیره‌شده فقط برای بازسازی تشخیص تکرار خوانده
  می‌شود. شماره‌قطعهٔ ویرایش‌شده پس از commit دوباره ساخته نمی‌شود. job قدیمی RUNNING
  بدون checkpoint با حفظ داده/گزارش برای بررسی متوقف می‌شود؛ QUEUED کاملاً دست‌نخورده
  می‌تواند checkpoint اولیه بگیرد. worker قدیمی نباید با worker جدید هم‌زمان مصرف‌کننده باشد.
- گزارش ممیزی، بررسی نمونه و محدودیت‌ها، تصمیم معماری و runbook انتشار/بازگشت
  نوشته شدند؛ راهنماهای موجود با وضعیت شاخه هماهنگ شدند. جزئیات و معیار پذیرش
  IMP-07 در [docs/SOURCE_UPGRADE_AUDIT.md](docs/SOURCE_UPGRADE_AUDIT.md) است.

- درخواست فعال: ممیزی و ارتقای تدریجی پروژهٔ موجود؛ اکنون مرحلهٔ اصلاح ایمنی
  Import/Undo، شماره‌قطعه و فیلتر سازگاری خودرو در حال تکمیل است.
- درخواست جدید مالک: ثبت دائمی پیشرفت و دستور ادامهٔ جلسات؛ این فایل و
  `AGENTS.md` ریشه برای همین منظور ایجاد شدند.
- شاخهٔ کاری: `refactor/source-enterprise-upgrade`.
- commit پیاده‌سازی: `8c1869de1d41313f0d1fb0a3a7b6ba0f2e62eb00`.
  HEAD بازبینی‌شده پس از اصلاح CI: `c8eb406d355adcbf4a7982b3c80b75898a5b98af`.
- مبنای تغییرات کد: `d205e373478b628f377feb4915dd19477d0f4eae`
  (ادغام PR #26، visual website builder).
- شاخه از `origin/main` به‌روز ایجاد شده؛ upstream فعلی شاخهٔ feature روی origin است.
  هنگام push مقصد feature صریح بماند. main محلی اولیه `391513d` بود و تغییر نکرده است.
- `AGENTS.md` و نسخهٔ اولیهٔ `PROGRESS.md` در `e45515d` ثبت شدند؛ پیاده‌سازی و
  تست‌ها در `8c1869d` و اسناد در `d125e31` commit و push شدند. Draft PR #28 ایجاد شد.
  نتیجهٔ نهایی CI و همین به‌روزرسانی checkpoint باید با وضعیت واقعی Git تطبیق داده شوند.
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
| `pnpm lint` پس از اصلاحات اولیه | موفق؛ این نتیجه پیش از تغییرات workbook است، نه تأیید نسخهٔ فعلی |
| کنترل تغییر harness | `pnpm --filter @hedax/api typecheck`، ESLint فایل `global-setup.ts` و `git diff --check` موفق |
| build بسته‌های مشترک و API در مرحلهٔ اولیه | موفق؛ build کامل در ادامهٔ 2026-10-19 تکمیل شد |
| `pnpm --filter @hedax/web e2e -- unified-parts.spec.ts` | ۹ از ۹ موفق، exit 0؛ مرورگر محلی با fixture ساختگی، نه backend واقعی |
| API integration: `85-vehicles`, `91-unified-parts`, `93-brand-import-integrity` | اجرای اولیه: ۲۴ assertion موفق، teardown ناموفق. پس از اصلاح harness: هر سه فایل و ۲۴ تست موفق، exit 0، مدت 61.58 ثانیه |
| بررسی اولیه ZIP واقعی | parser اولیه `ZIP_HAS_NO_CSV` می‌داد؛ این محدودیت با reader جدید رفع شده است |
| reader جدید روی نمونهٔ واقعی | ۴۴ فایل (۲۵ XLS، ۱۹ XLSX)، ۵۴ شیت و ۱۶٬۲۰۴ ردیف غیرخالی خوانده شد؛ بدون import دیتابیس؛ ۳۹ شیت نیازمند بررسی سرستون |
| آزمون‌های جدید header/archive | domain هشت تست و API نه تست موفق؛ مربوط به مرحلهٔ workbook و جدا از شمارش baseline |
| API integration پس از workbook | `91-unified-parts`، `93-brand-import-integrity`، `94-brand-workbooks`: سه فایل، ۱۸ تست موفق، exit 0، مدت 79.75 ثانیه |
| build/typecheck پس از workbook | API build و `pnpm typecheck` موفق؛ lint/مرورگر در آن جلسه اجرا نشده بودند و در ادامهٔ 2026-10-19 تکمیل شدند |
| بازبینی و مستندسازی 2026-10-19 | بررسی ایستای retry، نگاشت هر منبع، reader/حدود و سازگاری rollback؛ چهار سند جدید و دو راهنمای موجود تکمیل شدند. این بازبینی جایگزین تست اجرایی نیست |
| کنترل مستندات 2026-10-19 | هر ۱۹ پیوند محلی در هفت فایل معتبر؛ متن UTF-8 بدون نویسهٔ جایگزین؛ `git diff --check` بدون خطا؛ فهرست تغییرات با Git تطبیق داده شد |
| بازیابی Import پس از اصلاح IMP-07 | `pnpm --filter @hedax/api test:integration -- test/integration/91-unified-parts.test.ts test/integration/93-brand-import-integrity.test.ts test/integration/94-brand-workbooks.test.ts test/integration/95-brand-import-recovery.test.ts`: چهار فایل، ۲۵ تست موفق، exit 0، 125.29 ثانیه؛ شامل هفت تست جدید بازیابی |
| `pnpm typecheck` پس از IMP-07 | کل workspace موفق، exit 0؛ بررسی ترجمه/مجوز/audit موفق |
| `pnpm lint` پس از IMP-07 | اجرای اول سه خطای diagnostic خصوصی؛ پس از استثنای `.local-run/**` اجرای مجدد موفق، exit 0 |
| مرورگرِ مرحلهٔ workbook | با `CI=true` و فیلتر `brand database import\|workbook mapping`: دو تست موفق، exit 0، 1.3 دقیقه؛ تصویر موبایل بررسی شد؛ fixture، نه backend واقعی |
| `pnpm build` کل workspace | موفق، exit 0؛ shared/API، Next production build با ۱۶۷ صفحهٔ static و worker؛ فقط build محلی، نه انتشار |
| CI راه‌دور روی `96ac35a` | ناموفق، exit 1؛ lint/typecheck/unit موفق؛ اجرای ناخواستهٔ کل integration: ۱۴۹ موفق، یک failed و یک skipped، 621.07 ثانیه؛ شکست در `60-backup-restore`، همراه timeout afterAll 180 ثانیه. موفقیت ۱۴۹ assertion به معنی موفقیت job نیست |
| CI راه‌دور روی `c8eb406` | run `39208551626` موفق؛ ۲۲۸ unit، ۳۳ تست در پنج فایل Import/کاتالوگ (23.14 ثانیه)، ۱۲ تست در دو فایل CMS (9.00 ثانیه)؛ lint/typecheck و web build موفق. این اجرای هدفمند شامل suite `60` نیست و TEST-02 را رفع نمی‌کند |

## پیاده‌سازی جاری — Implemented Pending Verification

اصلاحات زیر نوشته شده‌اند و تست‌های مرتبط بالا را دارند؛ تحلیل read-only نمونه و
مرحلهٔ مستندسازی، IMP-07، مرورگر/lint و build کامل محلی انجام شده‌اند؛ پذیرش‌های
تکمیلیِ مشخص‌شده، TEST-02 و Preview باقی هستند؛ CI هدفمند راه‌دور موفق شده است:

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
  و افزودن suiteهای `85/91/93/94/95` به مسیر CI. CI راه‌دور روی `c8eb406` موفق است.
- XLS در worker، ZIP ترکیبی، حفظ قالب عددی، انتخاب سرستون/بدون سرستون و نگاشت
  مستقل هر منبع با حذف انتخابی شیت؛ دادهٔ قیمت/موجودی نمونه وارد جریان تجاری نمی‌شود.
- اسناد جدید: `docs/SOURCE_UPGRADE_AUDIT.md`، `docs/IMPORT_WORKBOOKS.md`،
  `docs/ADR_BRAND_WORKBOOK_IMPORT.md` و `docs/SOURCE_UPGRADE_RUNBOOK.md`.
  مرحلهٔ بازبینی/مستندسازی انجام شد؛ این اسناد وضعیت انتشار را «آماده» اعلام نمی‌کنند.

## خطاها و موارد ناتمام

1. **خطای teardown ویندوز، رفع‌شده در اجرای مجدد:** پس از موفقیت ۲۴ تست اولیه، حذف پوشهٔ موقت
   `apps/api/.local-pg/test-9400` در `global-setup.ts` با `EPERM` شکست خورد.
   بررسی کد dependency نشان داد `stop()` حذف بدون retry جداگانه‌ای دارد و harness
   خطای آن را پنهان می‌کرد؛ حذف sync نیز به callbackهای بستن فایل فرصت نمی‌داد.
   مالکیت cleanup به harness منتقل شد، مسیر هر اجرا با `mkdtemp` یکتا شد، خطای
   shutdown دیگر مخفی نمی‌شود و حذف async با retry و کنترل محدودهٔ مسیر انجام می‌شود.
   اجرای مجدد سه suite با ۲۴ تست و exit 0 موفق بود. علت دقیق قفل سیستم‌عامل در
   اجرای قبلی اثبات نشده؛ پوشهٔ قدیمی باقی است و فرایند/دیتابیس نامرتبط تغییر نکرد.
2. خطاهای اولیهٔ `spawn EPERM` ناشی از sandbox با اجرای مجاز محلی رفع شدند.
   نبود وابستگی‌های جدید در node_modules با نصب frozen lockfile رفع شد.
3. **شکاف اولیهٔ نمونه، رفع‌شده در parser و نیازمند نگاشت انسانی:** `Hyundai-Kia-Parts-List-sff8fl.zip` در Desktop
   بررسی شد: ۴٬۵۳۹٬۲۶۲ بایت فشرده، ۲۷٬۲۹۴٬۳۶۵ بایت مجموع فایل‌ها، ۴۴ فایل
   (۲۵ XLS، ۱۹ XLSX)، بدون مسیر traversal در فهرست آرشیو. اکنون کل آرشیو خوانده شده؛
   خروجی خصوصی تحلیل فقط در مسیر ignored `.local-run/supplier-analysis` است.
   نام‌های ZIP با encoding نامشخص، شناسهٔ پایدار مبتنی بر بایت‌های نام می‌گیرند؛
   نام فارسی حدس زده نمی‌شود. ۳۹ شیت به بررسی سرستون و همهٔ منابع به انتخاب درست
   سازنده نیاز دارند. نمونه فقط داده است؛ نباید commit یا به Production وارد شود.
4. **IMP-07، رفع‌شده در آزمون‌های محلی:** cursor/hash پیشوند و شمارنده‌ها/خطاها
   با دادهٔ batch در یک تراکنش ذخیره می‌شوند. هفت تست بازیابی، رقابت، rollback
   تراکنش، ویرایش شماره‌قطعه، تغییر/کوتاه‌شدن منبع و وضعیت قدیمی موفق‌اند. این مورد
   نباید دوباره از ابتدا پیاده شود. آزمون قطع برق واقعی یا chaos روی زیرساخت انجام نشده است.
5. مقایسهٔ عملکرد قبل/بعد این اصلاحات اندازه‌گیری نشده؛ اعداد قدیمی را نباید به
   عنوان benchmark فعلی یا ادعای بهبود سرعت معرفی کرد.
6. **مانع اجرای ابزار، رفع‌شده:** پس از تلاش‌های ناموفق قبلی به‌علت quota/capacity،
   درخواست جدید ادامه دریافت و همان مسیر مجوز موفق شد. lint، دو تست مرورگر، typecheck
   و build کامل اکنون انجام شده‌اند. اولین lint به اسکریپت خصوصی ایراد گرفت و با
   هماهنگ‌کردن ignore مسیر runtime رفع شد؛ CI هدفمند PR #28 روی `c8eb406` موفق است.
7. پذیرش سازگاری UI ورودهای قدیمی چندمنبعی و آزمون قطع/cleanup در برخورد با حدود
   منابع XLS باقی است؛ این موارد شکاف پوشش‌اند و به‌عنوان خرابی مشاهده‌شده ثبت نمی‌شوند.
8. **TEST-02، باز و مانع انتشار:** timeout آزمون backup/restore در Linux CI دیده شد؛
   علت اصلی آن هنوز اثبات نشده است. فیلتر فرمان CI اصلاح شد، ولی این کار رفع شکست
   backup نیست. بررسی بعدی باید هدفمند روی suite `60` در Linux و با trace shutdown
   باشد؛ baseline موفق ویندوز جایگزین این بررسی نیست. تست/teardown آن تغییر نکرده‌اند.
   لاگ دقیق: تست اصلی `Unknown Error: undefined` گزارش می‌دهد و afterAll به ۱۸۰
   ثانیه می‌رسد؛ صرفاً timeout تست اصلی را افزایش ندهید. stderr و مراحل توقف/شروع
   PostgreSQL اختصاصی در suite `60` فعلاً خاموش‌اند. در dependency، `stop()` برای
   event خروج صبر می‌کند و guard برای child ازقبلخارج‌شده ندارد؛ این مسیر باید با
   trace بررسی شود و هنوز علت اثبات‌شدهٔ خرابی restore نیست. هفت تست suite `95`
   در همان Linux run موفق بوده‌اند؛ job کلی با این وجود شکست خورده است.

## فایل‌های تغییرکرده در این مرحله

فهرست زیر تغییرات نسبت به مبناست؛ کدها در `8c1869d` ثبت شده‌اند. پیش از ادامه،
وضعیت فایل‌های ثبت‌نشده با `git status --short` تطبیق داده شود.

- پردازش Import:
  `apps/api/src/modules/brand-imports/brand-file.ts`،
  `apps/api/src/modules/brand-imports/brand-imports.controller.ts`،
  `apps/api/src/modules/brand-imports/brand-imports.service.ts`،
  `apps/api/src/modules/brand-imports/legacy-xls.ts` (جدید)،
  `apps/api/src/modules/imports/spreadsheet.ts`،
  `apps/api/src/modules/imports/number-format.ts` (جدید).
- کاتالوگ و قرارداد: `apps/api/src/modules/catalog/catalog.service.ts`،
  `packages/contracts/src/brand-imports.ts`، `packages/domain/src/brand-import.ts`.
- وابستگی XLS: `apps/api/package.json` و `pnpm-lock.yaml`؛ نسخهٔ ثابت رسمی
  SheetJS CE 0.20.3 و integrity ثبت‌شده در lockfile.
- تست‌ها: `apps/api/test/integration/85-vehicles.test.ts`،
  `apps/api/test/integration/global-setup.ts` (اصلاح cleanup موقت)،
  `apps/api/test/integration/93-brand-import-integrity.test.ts` (جدید)،
  `apps/api/test/integration/94-brand-workbooks.test.ts` (جدید)،
  `apps/api/test/integration/95-brand-import-recovery.test.ts` (جدید)،
  `apps/api/test/unit/spreadsheet-reader.test.ts`،
  `apps/api/test/unit/brand-archive.test.ts` (جدید)،
  `apps/api/test/unit/brand-upload-cleanup.test.ts` (جدید)،
  `packages/domain/test/brand-import.test.ts`، `apps/web/e2e/unified-parts.spec.ts`،
  `.github/workflows/ci.yml`.
- کنترل کیفیت: `eslint.config.mjs`، استثنای مسیر خصوصی `.local-run/**` مطابق Git ignore.
- پنل و ترجمه: `apps/web/src/components/admin/brand-imports.tsx`،
  `apps/web/messages/fa.json`، `apps/web/messages/en.json`.
- راهنما: `docs/PARTS_UNIFIED_PHASE4.md`، `docs/STAFF_GUIDE_PARTS.md`.
- ممیزی و عملیات (جدید): `docs/SOURCE_UPGRADE_AUDIT.md`، `docs/IMPORT_WORKBOOKS.md`،
  `docs/ADR_BRAND_WORKBOOK_IMPORT.md`، `docs/SOURCE_UPGRADE_RUNBOOK.md`.
- استمرار کار: `AGENTS.md` و `PROGRESS.md` ریشه در `e45515d` ثبت شده‌اند؛
  این فایل پس از checkpoint به‌روز شده است.
- تغییرات جانبی تولیدشده توسط تست/dev، پاک‌سازی‌شده پیش از commit:
  `apps/web/next-env.d.ts`، `docs/import/hedax-products-template.xlsx`،
  `docs/import/sample-import-with-errors.xlsx`، `docs/import/sample-row-errors.xlsx`.
  سه XLSX با مقایسهٔ XML تأیید و restore شدند؛ `next-env.d.ts` با build به نسخهٔ
  HEAD برگشت. این فایل‌ها در commit تغییر محصولی ندارند؛ سایر تغییرات بازگردانده نشدند.

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

1. IMP-07 و کنترل‌های محلی تکمیل شدند؛ تکرار نشوند مگر تغییر/خطای جدیدی وجود داشته باشد.
   کد و اسناد commit/push و Draft PR #28 ساخته شده‌اند؛ artifacts نیز پاک‌سازی شده‌اند.
2. اصلاح forwarding در `c8eb406` ثبت/ارسال و run `39208551626` موفق شد؛ دوباره
   اجرا نشود مگر تغییر/دلیل تازه‌ای وجود داشته باشد. CI قبلی شکست خورد و تاریخچهٔ
   آن حفظ شود. push روی همین PR، CI را فعال می‌کند؛ بدون PR، فیلتر push شاخهٔ
   `refactor/**` را پوشش نمی‌دهد.
3. **اکنون از TEST-02** (backup/restore در Linux) با اجرای هدفمند و trace ادامه دهید؛ سپس
   پذیرش UI ورودهای قدیمی چندمنبعی و کنترل termination/cleanup هنگام عبور XLS از
   حد منابع. Preview/انتشار تا رفع موارد باز آماده اعلام نشود.
4. تست‌های موفق فقط با تغییر جدید یا دلیل مشخص تکرار شوند؛ baseline کامل بی‌دلیل تکرار نشود.
5. Preview تنها پس از تأیید جدایی محیط و دسترسی موجود؛ Production تنها با تأیید مالک.

## تاریخچهٔ مراحل

- 2026-10-18: بررسی repo/Git، به‌روزرسانی مبنا، ایجاد شاخهٔ feature و baseline موفق.
- 2026-10-18: اصلاحات Import/Undo/ZIP/Excel/fitment و تست‌های رگرسیون نوشته شدند؛
  واحد/typecheck/lint/مرورگر موفق؛ شکست teardown تست یکپارچه به‌عنوان مورد باز ثبت شد.
- 2026-10-18 18:25 +03:30: ایجاد `PROGRESS.md` و دستور دائمی در `AGENTS.md` طبق
  درخواست مالک؛ کار قبلی حفظ شده، Production تغییر نکرده است.
- 2026-10-18 18:29 +03:30: متن UTF-8 دو فایل، تطبیق فهرست تغییرات با Git و
  `git diff --check` بررسی شد؛ موفق. فقط دو فایل استمرار کار در `e45515d` commit شدند.
- 2026-10-18 18:30 +03:30: اصلاح harness پاک‌سازی PostgreSQL موقت؛ تکرار هدفمند
  سه suite با ۲۴ تست و exit 0 موفق. فرادادهٔ ZIP واقعی و شکست parser فعلی بررسی و
  شکاف پشتیبانی XLS/ZIP حاوی workbook به‌عنوان قدم بعدی ثبت شد.
- 2026-10-18: typecheck API، lint تغییر harness و بررسی whitespace موفق؛
  نقطهٔ ادامه به تحلیل محتوای workbookهای واقعی منتقل شد. هیچ تست یا سرور موقتی
  از اجرای مجدد این مرحله در حال اجرا نیست؛ محیط توسعهٔ موجود دست‌نخورده است.
- 2026-10-18: reader XLS/ZIP، نگاشت هر شیت و انتخاب سرستون پیاده شد؛ ۱۷ تست
  هدفمند، ۱۸ تست یکپارچه، API build و typecheck موفق؛ کل نمونه خوانده شد. اجرای
  lint و مرورگر جدید به‌علت عدم تکمیل بررسی خودکار مجوز (سقف مصرف) انجام نشد.
- 2026-10-19: شروع از همین نقطه؛ تطبیق Git و به‌روزکردن نتایج عقب‌افتادهٔ گزارش.
- 2026-10-19: دو فرمان lint/مرورگر دوباره پیش از اجرا با خطای ظرفیت مدلِ بررسی
  خودکار مجوز متوقف شدند. مالک ادامهٔ بازبینی/مستندسازی را انتخاب کرد؛ محدودیت دور زده نشد.
- 2026-10-19: IMP-07 از بازبینی کد ثبت شد؛ گزارش ممیزی، بررسی نمونه، ADR و runbook
  تهیه و راهنماهای قدیمی اصلاح شدند. هیچ رفتار اجرایی برنامه در این مرحله تغییر نکرد؛
  تست‌های موفق تکرار نشدند، commit/push/deploy جدید انجام نشد.
- 2026-10-19 08:35 +03:30: کنترل پیوندها و متن مستندات، whitespace و وضعیت Git
  موفق بود. نقطهٔ ادامه، اصلاح و آزمون IMP-07 پس از ازسرگیری پیاده‌سازی است؛
  محدودیت اجرای lint/مرورگر و انتخاب فعلی مالک برای کار مستنداتی همچنان ثبت شده‌اند.
- 2026-10-19: با درخواست جدید ادامه، مسیر مجوز دوباره پذیرفته شد. IMP-07 اصلاح و
  تست شد: اجرای اولیهٔ پنج سناریو موفق؛ پس از اضافه‌کردن دو حالت تغییر منبع، چهار
  suite با ۲۵ تست موفق و exit 0. خطای lint اسکریپت‌های خصوصی رفع شد؛ lint/typecheck،
  دو تست مرورگر و build کامل موفق. تصویر موبایل بررسی شد؛ هیچ انتشار یا نوشتن روی
  سایت اصلی انجام نشد. اصل نمونه دوباره خوانده یا وارد DB نشد.
- 2026-10-19 09:19 +03:30: پس از مقایسهٔ محتوای ZIP/XML، سه artifact تولیدشده
  بازگردانده و ۲۶ فایل پیاده‌سازی/تست در `8c1869d` commit شدند. GitHub دسترسی
  لازم را تأیید کرد؛ PR تکراری وجود ندارد. اسناد و checkpoint مرحلهٔ بعدِ ثبت هستند.
- 2026-10-19 09:21 +03:30: اسناد در `d125e31` ثبت؛ feature با مقصد صریح push و
  Draft PR #28 ایجاد شد. upstream feature اصلاح شد. workflow موجود فقط CI است؛
  اجرای راه‌دور شروع شد. main، Preview و Production ادغام/منتشر/تغییر داده نشدند.
- 2026-10-19 09:23 +03:30: لینک PR و وضعیت upstream در commit صرفاً مستنداتی
  `96ac35a` ثبت و push شد. Git پیش از ثبت این نتیجه تمیز و با origin هماهنگ بود؛
  بررسی CI باید به آخرین HEAD متصل باشد. Draft هنوز باز و ادغام‌نشده است.
- 2026-10-19 09:40 +03:30: CI روی `96ac35a` شکست خورد: literal `--` در Linux
  موجب اجرای کل suite و آشکارشدن timeout مستقل backup شد. فرمان هدفمند به exec
  Vitest تغییر کرد؛ شکست backup تحت TEST-02 باز و مانع انتشار ثبت شد. هیچ تستی
  skip یا timeoutی برای سبزکردن job افزایش داده نشد.
- 2026-10-19: فرمان portable با list تأیید و در `c8eb406` ثبت/ارسال شد؛ CI جدید
  `39208551626` شروع شد. توضیح Draft PR با failure واقعی و TEST-02 هماهنگ شد.
- 2026-10-19 09:46 +03:30: CI روی `c8eb406` کاملاً موفق شد: ۲۲۸ unit، ۳۳
  Import/کاتالوگ و ۱۲ CMS؛ lint/typecheck/web build موفق. شکست قبلی backup مستقل
  باقی است؛ انتشار آماده اعلام نشد. Git با origin همگام بود؛ فقط ثبت نهایی این
  فایل پس از commit محلی مانده است. Production و Preview تغییر نکرده‌اند.
