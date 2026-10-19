# Source by HEDAX — وضعیت و نقطهٔ ادامه

آخرین به‌روزرسانی: 2026-10-19، مرحلهٔ پذیرش انتشار پس از 12:35، Asia/Tehran (+03:30).

این فایل مرجع ادامهٔ کار است. ابتدای هر جلسه، ابتدا این فایل و وضعیت واقعی Git
بررسی شوند. پس از هر مرحلهٔ مهم، نتیجه، خطاها، فایل‌ها و قدم بعدی به‌روز شوند.
هیچ رمز، توکن، دادهٔ مشتری یا محتوای محرمانهٔ فایل تأمین‌کننده در این فایل ثبت نشود.

## نقطهٔ فعلی

### آماده‌سازی امن Preview مستقل — 2026-10-19

- **Completed & Tested — بازیابی checkpoint:** HEAD/remote برابر
  `6475e92460485662c069ece144f8d9a0f9828d8c`، شاخه
  `refactor/source-enterprise-upgrade` و PR #28 در حالت `OPEN`/Draft/
  `MERGEABLE` هستند. CI آخرین HEAD، run `39253616669`، موفق است. فقط همین
  فایل پس از ثبت این بررسی تغییر محلی دارد؛ هیچ test سبز قبلی تکرار نشد.
- **Completed & Tested — DNS فقط‌خواندنی:** NS دامنهٔ apex در Arvan (`r` و `j`
  زیر `ns.arvancdn.ir`) است و apex از HTTPS پاسخ 200 می‌دهد. اما
  `preview.sourcebyhedax.ir` در resolver محلی و دو resolver عمومی مستقل
  (`1.1.1.1` و `8.8.8.8`) برای A/CNAME، `NXDOMAIN` است. یک hostname تصادفی زیر
  همین دامنه نیز `NXDOMAIN` است؛ wildcard عمومی هم مشاهده نشد. بنابراین مانع
  فعلی نبودن رکورد عمومی Preview است، نه صرفاً cache محلی. هیچ DNS/سرور/Production
  تغییر نکرد.
- **Completed & Tested — بررسی read-only استقرار:** `infra/docker-compose.yml`
  stack کامل جدا (PostgreSQL، Redis/BullMQ، ClamAV، API، worker، web، Caddy و
  volumeهای داده) و `.env.example` متغیرهای staging/storage/provider را دارد.
  `APP_ENV=staging` در اعتبارسنجی برنامه production محسوب نمی‌شود؛ simulator
  پرداخت و `dev-log` پیامک برای دادهٔ آزمایشی مجازند، ولی در production ممنوع‌اند.
  actual `.env` یا هر secret خوانده/نمایش داده نشد.
- **Requires Owner Decision — topology Preview:** Compose فعلی نام پروژهٔ ثابت
  `hedax` و publish پورت‌های 80/443 دارد. اجرای آن کنار Production روی یک Docker
  host بدون project/port/reverse-proxy جدا تضاد دارد. امن‌ترین topology یک host یا
  Docker context مستقل Preview است؛ هم‌مکانی فقط با طراحی reviewشدهٔ proxy مرکزی،
  project/volumeهای preview و عدم publish پورت‌های رقیب قابل بررسی است.
- **Blocked External — storage/media isolation:** Caddyfile موجود profile
  Production است و `/media/*` را به bucket عمومی Production proxy می‌کند. این
  فایل نباید برای Preview بی‌تغییر استفاده شود. پیش از deploy باید profile/override
  جدا و reviewشده‌ای وجود داشته باشد که به local preview volume یا bucketهای
  preview مستقل اشاره کند؛ bucket، private prefix و credentialهای Production
  هرگز reuse نشوند.
- **Blocked External — موارد واقعاً مفقود:** مقصد Preview (host/context و روش
  دسترسی عملیاتی)، رکورد DNS و TTL، topology routing/TLS، فایل محیط حفاظت‌شده با
  رازهای تازه، DB/Redis/queue مستقل، storage namespace مستقل، و شواهد readiness
  سرور هنوز ارائه نشده‌اند. ابزار `cloud_environment.environment_status` نیز در
  این جلسه در دسترس نبود و در workspace ویندوز فایل policy مدیریت‌شده وجود نداشت؛
  نتیجهٔ DNS فقط مشاهدهٔ عمومی است، نه دسترسی زیرساخت.
- **برنامهٔ اجرایی پیشنهادی، بدون اجرای آن:**
  1. مالک/اپراتور مقصد مستقل Preview و اینکه آیا host از Production جداست را
     تعیین کند؛ اگر همان host است، طرح proxy/port و project `hedax-preview` باید
     پیش از تغییر review شود.
  2. یک رکورد DNS A/AAAA یا CNAME برای `preview.sourcebyhedax.ir` به مقصد Preview
     ثبت شود و propagation فقط‌خواندنی تأیید گردد. این کار تغییر DNS و نیازمند
     تأیید صریح مالک است.
  3. یک فایل محیط خارج از Git روی مقصد ساخته شود: `APP_ENV=staging`،
     `PUBLIC_BASE_URL=https://preview.sourcebyhedax.ir`، رازهای تازه و مجزا،
     providerهای آزمایشی (`PAYMENT_PROVIDER=simulator`، `SMS_PROVIDER=dev-log`،
     `MAIL_PROVIDER=none`) و بدون هر credential Production. مقادیر در chat یا
     PROGRESS ثبت نشوند.
  4. DB و Redis/BullMQ فقط در volume/context Preview ایجاد شوند؛ هیچ connection
     string، backup یا dump Production برای seed استفاده نشود. دادهٔ پایه فقط پس
     از بازبینی reference-only بودن آن و حساب/دادهٔ synthetic ساخته شود.
  5. قبل از start، profile رسانهٔ Preview آماده و review شود: bucketهای private/
     public جدا یا volume محلی Preview، و Caddy بدون proxy bucket Production.
  6. پس از تأیید صریح مالک برای عملیات Preview، SHA reviewشدهٔ PR با API/worker
     هم‌نسخه deploy، migrationهای reviewشده اجرا، سپس readiness داخلی، TLS،
     login synthetic، import preview/run/error/Undo و پاک‌بودن queue/storage
     بررسی شوند. نتیجهٔ غیرمحرمانه ثبت شود.
- **قدم بعدی:** تا دریافت اطلاعات عملیاتی غیرمحرمانه و تأیید مالک برای تغییر DNS/
  ساخت Preview، فقط می‌توان پیکربندی Preview را به‌شکل reviewable آماده کرد؛ هیچ
  deployment، migration، import یا تغییر Production/PR Merge مجاز نیست.

### پروفایل reviewable Preview — 2026-10-19

- **Completed & Tested — پیکربندی بدون تغییر خارجی:**
  `infra/docker-compose.preview.yml`، `infra/caddy/Caddyfile.preview` و
  `infra/preview.env.example` افزوده شدند و `docs/PREVIEW_ISOLATION_PROFILE.md`
  نحوه و مرز استفاده را ثبت می‌کند. overlay نام Compose را به `hedax-preview`
  تغییر می‌دهد؛ بنابراین network و volumeهای PostgreSQL، Redis/BullMQ، storage،
  ClamAV و Caddy با نام جدا ایجاد خواهند شد. اجرای آن فقط روی ingress/host مستقل
  مجاز است؛ عمداً برای hostی که Caddy Production پورت 80/443 را دارد طراحی نشده است.
- **Completed & Tested — ایزوله‌سازی رفتار:** API/worker/tools در profile جدید
  `APP_ENV=staging` و local storage دارند؛ payment، SMS، mail و Telegram/Bale
  صریحاً خاموش‌اند. Caddy Preview به API محلی برای `/media/` reverse-proxy می‌کند
  و هیچ endpoint/bucket تولیدی ندارد، کل host را با credential جدا حفاظت می‌کند،
  header `noindex` دارد و namespace webhook را 404 می‌کند. template محیط فقط نام
  متغیرها را دارد و secret ندارد.
- **Completed & Tested — اعتبارسنجی محلی:**
  `docker compose -f infra/docker-compose.yml -f infra/docker-compose.preview.yml
  --env-file infra/preview.env.example config` با مقادیر ساختگی غیرمحرمانه موفق
  شد؛ خروجی project `hedax-preview_default` و volumeهای
  `hedax-preview_{pgdata,redisdata,storage,...}` را نشان داد. سپس
  `caddy validate` در container موقت `--network none` با hash آزمایشی موفق شد؛
  هیچ stack/container ماندگار، پورت، DNS، سرور یا Production تغییر نکرد.
- **Incomplete / external:** مقصد مستقل Preview، هدف DNS و TTL، روش دسترسی
  اپراتوری، فایل محیط حفاظت‌شده با secretهای تازه، و مجوز صریح مالک برای ایجاد
  DNS/deploy هنوز موجود نیست. `seed-base` فقط metadata پایهٔ ایمن دارد؛
  `seed-dev` در staging رد می‌شود، پس روش ایجاد catalog/media کاملاً synthetic و
  برچسب‌دار هنوز پیش‌نیاز جداگانه است. archive خصوصی Hyundai/Kia، dump/backup و
  هر دادهٔ کاربر/سفارش/تأمین‌کنندهٔ Production برای Preview ممنوع‌اند.
- **فایل‌های تغییرکردهٔ محلی:** `PROGRESS.md`،
  `docs/PREVIEW_ISOLATION_PROFILE.md`، `infra/docker-compose.preview.yml`،
  `infra/caddy/Caddyfile.preview` و `infra/preview.env.example`. هنوز commit/push
  نشده‌اند و checkpoint بعدی باید همهٔ آن‌ها را همراه با این ثبت در Draft PR
  قرار دهد؛ هیچ CI یا وضعیت PR تا این لحظه تغییر نکرده است.
- **قدم بعدی دقیق:** مالک باید فقط اطلاعات غیرمحرمانهٔ زیر را مشخص کند: آیا
  Preview host/ingress مستقل است یا هم‌مکانی نیاز به طرح proxy دارد؛ target مورد
  تأیید DNS چیست؛ و آیا ایجاد record و deploy پس از review مجاز است. پس از آن
  ابتدا فقط همان topology/DNS review می‌شود؛ پیش از هر write عملیاتی تأیید صریح
  جداگانه لازم است.

### ادامهٔ آمادگی انتشار — 2026-10-19

- شروع این جلسه: Git روی `d5b649f` با origin همگام، فقط ثبت نهایی PROGRESS محلی
  تغییر داشت. PR #28 باز، Draft، بدون conflict و CI همان HEAD موفق بود.
- TEST-02 و baseline تکرار نشدند. دامنه فقط پذیرش XLS قدیمی، UI چندمنبعی قدیمی
  و تأیید Preview است؛ هیچ Merge یا تغییر Production/Preview انجام نشده است.
- **Completed & Tested:** UI برای outlineهای قدیمی بدون
  `options.sources` نگاشت مستقل در حافظه ایجاد می‌کند و تا ذخیره داده‌ای نمی‌نویسد؛
  امکان حذف انتخابی منبع و توضیح نیاز به بارگذاری مجدد برای تغییر header فراهم شد.
  آزمون مرورگر payload ذخیره و آزمون API با JSON قدیمی اضافه شدند.
- **Completed & Tested:** آزمون XLS واقعی برای فایل بزرگ، تعداد
  شیت/ستون و لغو مصرف‌کننده، و fault injection برای timeout/خروج/خطای worker و
  توقف deadline هنگام مصرف کند اضافه شدند. fault injection معادل OOM واقعی نیست.
- **Blocked External — Preview:** DNS محلی `preview.sourcebyhedax.ir` خطای
  `DNS_ERROR_RCODE_NAME_ERROR` داد. پیکربندی جداسازی تأییدشده در شواهد فعلی نیست؛
  نشانی/راهنمای غیرمحرمانهٔ محیط از مالک درخواست شد. صرف دسترسی دامنه اثبات جدایی
  DB، Redis/صف‌ها، storage یا provider نیست؛ هیچ تست نوشتنی روی آن اجرا نشد.
- فایل‌های جدید/تغییریافتهٔ این مرحله: `legacy-xls.test.ts`،
  `legacy-xls-lifecycle.test.ts`، suite `94-brand-workbooks`،
  `apps/web/e2e/unified-parts.spec.ts` و `brand-imports.tsx` و همین فایل.
- گزارش پذیرش و حدود UI/worker:
  [docs/PR_28_RELEASE_READINESS.md](docs/PR_28_RELEASE_READINESS.md).
- قدم بعدی: ثبت/ارسال همین تغییرات روی feature، تطبیق CI آخرین HEAD و شرح PR؛
  سپس دریافت شواهد Preview مستقل و پذیرش همان نسخه. انتشار آماده نیست.
- تغییرات این مرحله در `e4aff78977c51527e2cccd809dca4d2fe9900920` ثبت و روی
  همان `origin/refactor/source-enterprise-upgrade` ارسال شدند. push موفق است؛
  اولین read فوری GitHub هنوز HEAD قبلی `d5b649f` را برگرداند، بنابراین CI قبلی
  به‌عنوان تأیید این commit معرفی نمی‌شود. منتظر تطبیق HEAD/CI جدید هستیم.
- **خطای CI روی e4aff78، در حال رفع:** run `39229762264` در مرحلهٔ Catalog/import
  شکست خورد، در حالی‌که build/lint/typecheck/unit موفق بودند. علت assertion قدیمی
  suite 94 بود: regression تازه دو قطعه را با همان manufacturer مشترک ایجاد می‌کرد
  و شمارش انتهایی test قدیمی از ۳ به ۵ رسید. هیچ کد برنامه یا دادهٔ واقعی درگیر
  نیست. اصلاح محلی regression را روی manufacturer اختصاصی می‌برد و suite کامل 94
  اکنون دوباره اجرا می‌شود. تا CI commit بعدی سبز نشود، PR آمادهٔ بررسی نهایی نیست.
- **Completed & Tested محلی — رفع CI:** suite کامل `94-brand-workbooks` پس از
  isolation، ۳ تست موفق، exit 0، 53.35 ثانیه؛ ESLint همان فایل و `git diff --check`
  نیز موفق. اصلاح و checkpoint در `c3f7fbe443a56a51e62bcc4d72d6b19df3633683`
  ثبت و روی feature ارسال شدند. CI تازه باید فقط همین SHA را تأیید کند؛ run شکست‌خورده
  `39229762264` متعلق به `e4aff78` است و جایگزین نمی‌شود.
- CI جدید `39253160464` دقیقاً روی `c3f7fbe` ایجاد شده و در زمان این checkpoint
  در حال اجراست؛ PR #28 همچنان Draft، OPEN و `MERGEABLE` است. فقط همین فایل
  پس از ثبت وضعیت CI در working tree تغییر دارد.
- **Completed & Tested — CI نهایی اصلاح:** run `39253160464` روی
  `c3f7fbe443a56a51e62bcc4d72d6b19df3633683` کاملاً موفق شد. build API/shared،
  lint، typecheck، unit، Catalog/Import (شامل suite 94)، CMS، backup/restore
  disposable و production web build همگی success هستند. run قبلی شکست‌خورده صرفاً
  تاریخچهٔ isolation test است و با این run رفع شده است. PR از نظر CI/review فنی
  آماده است، اما برای انتشار Production آماده/مجاز نیست تا Preview مستقل و
  acceptance مستقر و سپس تأیید صریح مالک تکمیل شود.
- checkpoint CI در `6475e92460485662c069ece144f8d9a0f9828d8c` commit/push شد؛
  هر run تازه‌ای که GitHub برای این commit صرفاً مستنداتی آغاز کند باید جدا از
  CI سبز کد `c3f7fbe` ثبت شود. Git پس از این ثبت محلی فقط همین فایل را تغییرشده
  نشان می‌دهد.
- **Completed & Tested — CI آخرین HEAD:** run `39253616669` روی
  `6475e92460485662c069ece144f8d9a0f9828d8c` نیز کاملاً success شد. بنابراین
  آخرین HEAD، CI سبز، Draft/OPEN و `MERGEABLE` است. این نتیجه پس از commit برای
  حفظ checkpoint محلی ثبت شده؛ فقط `PROGRESS.md` dirty است و عمداً commit تازه‌ای
  ایجاد نمی‌شود تا CI تکراری بی‌دلیل شروع نشود.
- **Blocked External — Preview، بررسی فقط‌خواندنی تکرار شد:** DNS همچنان
  `DNS_ERROR_RCODE_NAME_ERROR` و TCP/443 بدون RemoteAddress است. هیچ تغییر DNS/
  سرور/Production و هیچ درخواست نوشتنی Preview انجام نشد. برنامهٔ راه‌اندازی
  Preview در `docs/PR_28_RELEASE_READINESS.md` و runbook باقی است؛ برای اجرا به
  نشانی/زیرساخت مستقل و شواهد غیرمحرمانهٔ isolation نیاز است.
- نتیجهٔ میانی: هر ۱۰ تست XLS موفق؛ lint و typecheck کل workspace موفق شدند.
  تست جدید API ابتدا به علت assertion روی `product.nameEn` شکست خورد؛ نام انگلیسی
  در `translations` ذخیره می‌شود، assertion به همان مدل واقعی اصلاح شد. مرورگر
  دو تست قبلی را گذراند؛ تست جدید به علت نادیده‌گرفتن پیشنهاد موجود `description`
  در payload مورد انتظار شکست خورد و انتظار دقیق اصلاح شد. کد برنامه برای این
  دو شکست عوض نشد؛ فقط دو تست ناموفق دوباره اجرا می‌شوند.
- نتیجهٔ نهایی محلی: تست API قدیمی در suite 94 با `-t 'old inspections'` موفق،
  یک تست، دو مورد قبلی عمداً فیلتر، exit 0، کل 38.93 ثانیه. دو محصول و ترجمهٔ
  انگلیسی، نگاشت مستقل و کنارگذاشتن منبع سوم تأیید شدند. تست مرورگر جدید در
  تکرار هدفمند یک pass، exit 0، 22.6 ثانیه؛ دو مورد قبلی در اجرای اول موفق بودند.
  نتیجهٔ شکست اولیه پاک نشده است. هر ۱۰ unit XLS و typecheck API موفق؛ lint
  نهایی فایل‌های تغییرکرده و `git diff --check` موفق. هیچ تغییر کد backend لازم نشد.
- محدودیت‌های عملیاتی: انتخاب header فقط از ۲۰ ردیف نمونه؛ outline قدیمی بدون
  sample برای تغییر header نیازمند upload مجدد است؛ یک سازنده در هر job و بازبینی
  انسانی همچنان لازم‌اند. این‌ها محدودیت مستندند، نه خرابی حل‌نشدهٔ UI. تست واقعی
  OOM/RSS کل فرایند یا benchmark انجام نشده؛ خطای worker به روش fault injection
  آزموده شد و حذف spool/توقف worker با XLS واقعی بررسی شد.
- `next-env.d.ts` فقط با Next dev به مسیر typeهای dev تغییر کرد و پس از اتمام
  تست به همان دو import نسخهٔ HEAD برگشت؛ در تغییر محصولی وارد نمی‌شود.

- **Completed & Tested — TEST-02:** علت واقعی در Linux بازتولید و رفع شد. کپی
  PGDATA مجوز ریشه را از `0700` به `0755` تبدیل می‌کرد و PostgreSQL restore را رد
  می‌کرد. خطای خالی startup و انتظار stop برای child ازقبلخارج‌شده، علت را پنهان
  و timeout ثانویه ایجاد می‌کردند. گزارش کامل:
  [docs/TEST_02_BACKUP_REPORT.md](docs/TEST_02_BACKUP_REPORT.md).
- اصلاح محدود به fixture و CI موجود است: حفظ/بررسی مجوز ریشه در backup و restore،
  I/O ناهمگام، خطای startup قابل تشخیص، shutdown بدون پنهان‌کردن خطا، مسیر موقت
  یکتا و کنترل محدودهٔ copy/remove. هیچ ساختار اصلی، schema یا کد برنامه عوض نشد.
- **CI نهایی موفق** روی کد `767183ff7c7949855366f173f17e7b49390884f7`:
  [run 39225452667](https://github.com/ali-hedax/source-auto-parts-platform/actions/runs/39225452667).
  ۲۲۸ تست واحد، ۳۳ Import/کاتالوگ، ۱۲ CMS و یک backup؛ lint/typecheck و web build
  همگی موفق. PGDATA اصلی/backup/restored در Linux همگی `0700` و startup سالم است.
- کنترل هدفمند ویندوز نیز موفق: `pnpm --filter @hedax/api exec vitest run --config
  vitest.integration.config.ts test/integration/60-backup-restore.test.ts`، یک تست،
  exit 0، کل اجرا 115.03 ثانیه با setup. timeout خود تست همان ۹۰ ثانیه باقی ماند.
- تاریخچهٔ شکست حفظ شده است: run تشخیصی `39216172835` روی `f24630e` علت permission
  و timeout cleanup را نشان داد؛ اصلاح permission در `00e9e98` روی Linux موفق شد.
  اجرای همگام ویندوز timeout داشت؛ نسخهٔ ناهمگام `767183f` روی هر دو محیط موفق شد.
  هیچ assertion حذف و هیچ timeout برای سبزکردن تست افزایش داده نشد.
- [PR #28](https://github.com/ali-hedax/source-auto-parts-platform/pull/28) هنوز Draft،
  باز و ادغام‌نشده است. TEST-02 دیگر مانع فنی نیست؛ تغییرات برای بررسی کد آماده‌اند.
  **انتشار Production آماده/مجاز اعلام نمی‌شود:** Preview مستقل هنوز تأیید نشده،
  پذیرش UI قدیمی و cleanup هدفمند XLS در ادامهٔ همین جلسه تکمیل شدند؛ بررسی مالک
  و تأیید صریح انتشار نیز لازم است. backup فعلی سرور هدف با این تست مصنوعی اثبات نشد.

### سابقهٔ Git در checkpoint بسته‌شدهٔ TEST-02؛ HEAD جاری بالاست

- شاخه: `refactor/source-enterprise-upgrade`؛ upstream:
  `origin/refactor/source-enterprise-upgrade`.
- آخرین HEAD کدِ تست‌شده: `767183ff7c7949855366f173f17e7b49390884f7`.
  commitهای TEST-02: `f24630e` (تشخیص)، `00e9e98` (permission/cleanup)،
  `767183f` (I/O ناهمگام). همگی روی feature ارسال شده‌اند؛ commit اسناد بعدی ممکن
  است HEAD را جلو ببرد و SHA آن باید با Git تطبیق داده شود.
- مبنای feature: `d205e373478b628f377feb4915dd19477d0f4eae`؛ پیاده‌سازی Import
  قبلی در `8c1869d` و اصلاح فرمان portable CI در `c8eb406` ثبت شده‌اند.
- main محلی اولیه `391513d` و worktree جداگانهٔ `deploy/card-fitment` دست‌نخورده‌اند.
  هیچ merge، deployment، migration یا نوشتن داده روی Production/Preview انجام نشد.
- این مرحله فقط TEST-02 بود. IMP-07، خواندن ZIP خصوصی و baseline تکرار نشدند؛
  CI طبق workflow خودش کنترل‌های لازم را اجرا کرد. نمونهٔ تأمین‌کننده وارد DB نشد.
- فایل‌های همین مرحله: `apps/api/test/integration/60-backup-restore.test.ts`،
  `.github/workflows/ci.yml`، `PROGRESS.md` و اسناد گزارش/backup/audit/runbook.
  گزارش نهایی اسناد ثبت شده است؛ هر تغییر باقی‌مانده را با Git بررسی کنید.
- گزارش نهایی در `d5b649f8dc23f023dc5830c9f21538a877e09f57` commit/push شد؛
  شرح PR نیز با بسته‌شدن TEST-02 و شروط باقی‌ماندهٔ انتشار هماهنگ شد. Git قبل از
  این ثبت نتیجه تمیز و با origin همگام بود. PR باز، Draft و بدون conflict است؛
  هیچ Merge انجام نشده. CI خودکار این commit صرفاً مستنداتی،
  [39226951115](https://github.com/ali-hedax/source-auto-parts-platform/actions/runs/39226951115)،
  نیز **موفق شد**؛ HEAD واقعی PR/Git همان `d5b649f` است و کد fixture همان نسخهٔ
  تأییدشدهٔ `767183f`. پس از ثبت نتیجه، تنها تغییر محلی همین `PROGRESS.md` است؛
  کد، گزارش نهایی و شرح PR ثبت/ارسال شده‌اند. مرحلهٔ درخواستی TEST-02 تکمیل است.
- پوشهٔ قدیمی `apps/api/.local-pg/test-9400` و سرویس‌های نامرتبط پاک/متوقف نشدند.

### ادامهٔ بعدی

TEST-02 و کنترل‌های موفق بالا دوباره اجرا یا پیاده نشوند مگر تغییر/خرابی تازه‌ای باشد.
گزارش TEST-02 و پذیرش هدفمند UI/XLS ثبت شده‌اند؛ از تطبیق CI/HEAD همین اصلاح
و سپس تأیید جدایی و پذیرش Preview ادامه دهید. Merge و Production
فقط با تأیید صریح مالک؛ فعلاً PR در حالت Draft باقی بماند.

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
| بازتولید TEST-02 روی Linux | run `39216172835`، `f24630e`: ناموفق؛ PGDATA اصلی `0700`، کپی و restore `0755`، خطای FATAL مجوزها و سپس timeout ثانویهٔ cleanup ۱۸۰ ثانیه. علت اصلی با لاگ اثبات شد |
| اصلاح اولیهٔ permission روی Linux | run `39223797071`، `00e9e98`: موفق؛ مجوز اصلی/backup/restore `0700` و مرحلهٔ صریح backup موفق |
| کنترل ویندوز نسخهٔ همگام | ناموفق، exit 1؛ تست timeout ۹۰ ثانیه و حدود ۴۰۰ ثانیه مدت body در I/O همگام. علت دقیق تأخیر OS اثبات نشده؛ نتیجهٔ ناموفق حفظ شده است |
| کنترل ویندوز نسخهٔ ناهمگام | فقط suite `60`، یک تست موفق، exit 0، 115.03 ثانیه کل اجرا شامل setup؛ timeoutها و assertionها حفظ شدند |
| CI نهایی TEST-02 روی `767183f` | run `39225452667` موفق: ۲۲۸ unit، ۳۳ Import/کاتالوگ، ۱۲ CMS و یک backup؛ lint/typecheck و production web build موفق. startup دیتابیس restored سالم و مجوز هر سه ریشه `0700` است |
| CI آخرین HEAD PR روی `d5b649f` | run `39226951115` نیز موفق؛ HEAD PR تطبیق داده شد، Draft و OPEN باقی است و conflict ندارد. build وب و تمام مراحل CI از جمله backup موفق‌اند؛ Merge/انتشار انجام نشده |

## پیاده‌سازی جاری — Implemented Pending Verification

اصلاحات زیر نوشته شده‌اند و تست‌های مرتبط بالا را دارند؛ تحلیل read-only نمونه و
مرحلهٔ مستندسازی، IMP-07، مرورگر/lint و build کامل محلی انجام شده‌اند؛ پذیرش‌های
تکمیلیِ مشخص‌شده و Preview باقی هستند؛ TEST-02 نیز روی Linux/Windows رفع و CI کاملِ
دارای مرحلهٔ backup موفق شده است:

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
- TEST-02: کد fixture و CI تأیید شده‌اند؛ گزارش نهایی در
  `docs/TEST_02_BACKUP_REPORT.md` و وضعیت جاری در `docs/BACKUP_RESTORE.md` ثبت شد.

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
7. **Completed & Tested:** سازگاری UI ورودهای قدیمی چندمنبعی با adapter در editor
   رفع و با مرورگر/API بررسی شد؛ termination/cleanup هدفمند XLS ده تست موفق دارد.
   حدود آزمون و تاریخچهٔ دو assertion ناموفق در checkpoint بالاست؛ تست امنیتی جامع نیست.
8. **TEST-02، رفع‌شده و تأییدشده:** علت Linux حفظ‌نشدن مجوز PGDATA بود (`0700 →
   0755`)، نه خرابی دادهٔ مصنوعی. root mode در هر دو مرحله حفظ/بررسی شد و انتظار
   stop پس از startup شکست‌خورده حذف شد. I/O ناهمگام ویندوز نیز موفق است؛ CI نهایی
   `39225452667` شامل backup روی `767183f` موفق شد. شکست اولیه و timeout ویندوز
   در گزارش/تاریخچه حفظ شده‌اند؛ این موارد نباید دوباره به‌عنوان کار حل‌نشده پیاده شوند.

## فایل‌های تغییرکرده در این مرحله

فهرست زیر تغییرات نسبت به مبناست؛ هستهٔ feature در `8c1869d` و fixture نهایی TEST-02
در `767183f` ثبت شده‌اند. پیش از ادامه،
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
- همین مرحلهٔ TEST-02: `apps/api/test/integration/60-backup-restore.test.ts`، مرحلهٔ
  مستقل backup در `.github/workflows/ci.yml`، `docs/BACKUP_RESTORE.md` و
  `docs/TEST_02_BACKUP_REPORT.md` (جدید)، همراه به‌روزرسانی audit/runbook/PROGRESS.
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

1. گزارش نهایی TEST-02 و وضعیت PR در `d5b649f` ثبت/ارسال شده‌اند؛ کد نهایی `767183f` روی Windows و
   Linux تأیید شده است. TEST-02، IMP-07، نمونه و baseline کامل تکرار نشوند مگر دلیل تازه‌ای باشد.
2. پذیرش UI قدیمی و termination/cleanup هدفمند XLS نیز تکمیل شد؛ از تطبیق CI
   commit جدید و گزارش `docs/PR_28_RELEASE_READINESS.md` ادامه دهید، نه تکرار تست‌های محلی.
3. جدایی database/storage/queue و روش استقرار Preview تأیید و سپس پذیرش واقعی آن
   انجام شود. هنوز Preview مستقل مستقر/تأیید نشده و Production آماده اعلام نمی‌شود.
4. قبل از ادامه، SHA واقعی Git و نتیجهٔ CI همان SHA خوانده شود. کد و fixture تست‌شده
   با commit صرفاً مستنداتی بعدی اشتباه گرفته نشوند؛ کنترل موفق بی‌دلیل تکرار نشود.
5. PR #28 در حالت Draft و بدون Merge بماند؛ Merge و هر تغییر Production نیازمند
   تأیید صریح مالک هستند. داده/کلید واقعی یا فایل نمونهٔ خصوصی وارد Git نشود.

## تاریخچهٔ مراحل

- 2026-10-19، پس از checkpoint TEST-02: UI ورود قدیمی چندمنبعی در editor موجود
  اصلاح شد؛ ده unit برای XLS و cleanup واقعی، یک API قدیمی و سه browser مرتبط
  موفق شدند. دو assertion اولیهٔ نادرست اصلاح و فقط همان دو تست تکرار شدند؛
  lint/typecheck و diff check موفق. گزارش آمادگی جدید و audit/workbook/runbook
  هماهنگ شدند. DNS محلی Preview نام را پیدا نکرد و جداسازی هنوز تأیید نشده است.
  تست‌های تکمیل‌شدهٔ TEST-02، baseline و خواندن نمونه دستی تکرار نشدند؛ هیچ Merge
  یا تغییر Production/Preview انجام نشد.

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
- 2026-10-19: شروع از TEST-02؛ Git/PR تطبیق داده شد. در `f24630e` خطای PostgreSQL
  قابل مشاهده و آزمون backup وارد CI شد. run `39216172835` خطای مجوز `0755` را
  بازتولید کرد. در `00e9e98` مجوز کپی/restore و چرخهٔ cleanup اصلاح شد؛ Linux سبز شد.
- 2026-10-19: اجرای Windows با fixture همگام timeout داشت؛ I/O در `767183f`
  ناهمگام شد. تکرار هدفمند ویندوز موفق (exit 0، کل 115.03 ثانیه) و CI نهایی Linux
  `39225452667` موفق شد. TEST-02 بسته شد؛ تست‌ها حذف و timeoutها افزایش داده نشدند.
  یک read وضعیت CI به deadline بررسی خودکار مجوز خورد؛ retry همان مسیر موفق شد و
  این خطای ابزار با شکست آزمون اشتباه گرفته نشد.
- 2026-10-19 12:23 +03:30: گزارش نهایی و checkpoint فعلی فشرده/هماهنگ شدند؛
  شواهد شکست و تاریخچهٔ قبلی حفظ شدند. PR برای بررسی کد آماده، ولی تا پذیرش‌های
  باقی‌مانده، تأیید Preview و مجوز مالک برای Production آماده/مجاز اعلام نشد.
- 2026-10-19 12:35 +03:30: گزارش نهایی در `d5b649f` ثبت/ارسال، شرح Draft PR به‌روز
  و CI همان HEAD (`39226951115`) موفق شد. ۱۴ پیوند محلی و UTF-8/whitespace پنج سند
  بررسی شدند؛ موفق. همهٔ کد و گزارش‌ها در PR هستند؛ فقط این ثبت نهایی نتیجه در
  PROGRESS محلی باقی است. TEST-02 تکمیل شد؛ هیچ Merge یا تغییر Production انجام نشد.
