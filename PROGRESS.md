# Source by HEDAX — وضعیت و نقطهٔ ادامه

آخرین به‌روزرسانی: 2026-10-20، بازبینی واقعی نسخهٔ محلی دستیار، Asia/Tehran (+03:30).

این فایل مرجع ادامهٔ کار است. ابتدای هر جلسه، ابتدا این فایل و وضعیت واقعی Git
بررسی شوند. پس از هر مرحلهٔ مهم، نتیجه، خطاها، فایل‌ها و قدم بعدی به‌روز شوند.
هیچ رمز، توکن، دادهٔ مشتری یا محتوای محرمانهٔ فایل تأمین‌کننده در این فایل ثبت نشود.

## نقطهٔ فعلی

### بازبینی واقعی شش قابلیت و اجرای محلی — 2026-10-20، Asia/Tehran

- **Completed & Tested — ۱. ظاهر:** asset نهایی فعلی alpha واقعی دارد و در مشاهدهٔ
  screenshot هیچ کارت/مربع/دایره/پس‌زمینه دور خود کاراکتر نبود. بازبینی اول نشان
  داد ابعاد تمام‌قد با اندازهٔ SVG قدیمی کوچک است؛ اندازه 1.8 برابر و collision
  geometry اصلاح و متن زیر pet حذف شد. visual 390 بعد از اصلاح موفق شد. شباهت و
  لباس از دو مرجع تولید شده‌اند، اما پذیرش هنری نهایی هنوز تصمیم مالک است.
- **Completed & Tested — ۲. تعامل / ناقص از نظر 3D:** mouse/pointer drag واقعی،
  آستانه click/drag، clamp، ذخیره/reset موقعیت، keyboard، hide/minimize و حرکت idle
  در browser test آزموده شدند. فایل ویدئو
  `.local-run/assistant-ai-review/assistant-drag-dialog-390.webm` و تصاویر full/open
  کنار آن ساخته شدند. این PNG متحرک‌شده با CSS است؛ مدل rigged سه‌بعدی نیست، حالت‌های
  مستقل تصویری/اسکلتی کامل ندارد و آزمون touch روی دستگاه فیزیکی انجام نشده است.
- **Incomplete/Blocked — ۳. AI آزاد:** endpoint/provider واقعی وجود ندارد؛ پاسخ
  همچنان adapter قطعی مرحلهٔ اول است. provider، مدل مجاز، secret server-side، منطقهٔ
  داده، retention و سقف هزینه لازم‌اند. پاسخ هوشمند واقعی آزموده یا فعال نشده است.
- **Incomplete/Blocked — ۴. ابزار کاتالوگ:** سرویس موجود کاتالوگ در همین stack
  قیمت/موجودی مصنوعی را نمایش می‌دهد، ولی دستیار آن را فراخوانی نمی‌کند. بنابراین
  نمایش کاتالوگ شاهد ابزار AI نیست و این مورد تکمیل‌شده محسوب نمی‌شود.
- **Incomplete/Blocked — ۵. صوت:** کنترل میکروفن/STT/TTS/stream وجود ندارد؛ دریافت
  فارسی، transcript، صدای خروجی و stop عملاً آزموده نشده‌اند. فایل صوت یا نمایش
  ساختگی ارائه نشد. provider صوت و آزمون مرورگر/میکروفن واقعی لازم است.
- **Completed & Tested — ۶. مدیریت:** ذخیرهٔ صریح SiteSetting با RBAC/CSRF/MFA،
  version conflict، audit و default-off در integration واقعی DB موقت قبلاً موفق
  بوده؛ فرم browser نیز save/reset را آزموده است. در stack فعلی مسیر مدیریت باز است
  و تا ورود مالک آزمایشی پیام ورود نشان می‌دهد؛ پذیرش دستی این اجرای تازه به عهدهٔ
  مالک است.
- **Completed & Tested — اجرای فعلی:** launcher واقعی با PostgreSQL/storage تازه،
  queue inline، بدون اتصال Redis و بدون `.env`/Production روی 3191/4191/55439 در
  حال اجراست. تب‌های login، `/fa/admin/assistant` و `/fa` در مرورگر باز و deliverable
  هستند. حساب فقط `owner@hedax.test` است؛ رمز در این فایل ثبت نشده. پس از ورود/MFA،
  فعال‌سازی و save، تب خانه refresh شود. stack در پایان این جلسه عمداً باز می‌ماند.
- **شواهد:** ضبط اول به‌دلیل قفل Next روی dev server دوم اجرا نشد؛ retry روی سرور
  موجود به نبود FFmpeg رسید. مؤلفه رسمی Playwright FFmpeg با مجوز نصب و retry نهایی
  visual 390 با video موفق شد: 1 passed، exit 0. هیچ صوتی در ویدئو نیست.

### ارتقای دستیار هوشمند/صوتی — milestone A در حال اجرا، 2026-10-20

- **Implemented Pending Verification:** درخواست مالک برای مراحل A تا F خوانده شد؛
  تصاویر مرجع واقعاً بررسی شدند و راهنمای Server/Client نسخهٔ نصب‌شدهٔ Next 16.3.7
  خوانده شد. همان شاخه و تغییرات مرحلهٔ اول حفظ شده‌اند؛ commit/push/merge/deploy
  یا تماس با Production انجام نشده است.
- **Implemented Pending Verification:** با ImageGen داخلی و هر دو مرجع، یک رندر
  idle تمام‌قد با لباس مکانیک سرمه‌ای ساخته و در
  `apps/web/public/assistant/hedax-mechanic-idle-v1.png` قرار گرفت. فایل
  1024×1536 و دارای alpha واقعی است (pixel گوشه alpha=0). عکس شخصی و پوستر مرجع
  داخل public/Git کپی نشده‌اند. prompt تولید: رندر مکانیک سه‌بعدی‌نما، حفظ هویت
  مرجع چهره و لباس showcase، patch خالی برند، cutout شفاف، بدون متن/قاب/دایره/
  حلقه/پس‌زمینه/UI. این فایل فقط رندر دوبعدی است و GLB/glTF rigged نیست.
- **Completed & Tested:** launcher کارت‌دار حذف و کاراکتر شفاف جایگزین شد؛ drag
  با pointer برای mouse/touch، آستانهٔ تفکیک click/drag، clamp به visual viewport،
  ذخیرهٔ فقط مختصات غیرحساس، reset قابل‌دسترسی، minimize، hide تا navigation و
  pause/reduced-motion پیاده شد. کنترل‌ها سطح کوچک مستقل دارند و خود کاراکتر هیچ
  کارت، مربع، دایره یا حلقه ندارد.
- **Completed & Tested:** web typecheck و ESLint هدفمند موفق شدند. نخستین browser
  run دو تست را به علت `next/image localPatterns` شکست داد؛ assertion حذف یا ضعیف
  نشد. asset ثابت با `unoptimized` اصلاح شد و اجرای مجدد سناریوی اصلی و visual 390
  شامل نبود قاب، drag واقعی، عدم بازشدن dialog هنگام drag، ذخیره/reset موقعیت،
  reduced motion، keyboard و dialog موفق شد: 2 passed، exit 0.
- **Completed & Tested:** visual 768 نیز در اجرای بعدی موفق شد. visual 1440 ابتدا
  نشان داد action bar عرض compact را نگه می‌دارد؛ action bar به overlay مستقل تبدیل
  شد. retry بعدی صرفاً به‌علت پوشاندن launcher توسط Next dev overlay هنگام pointer
  click timeout شد؛ مسیر keyboard واقعی (`focus` + Enter) بدون force-click استفاده
  شد و همان تست کامل 1440 موفق شد: 1 passed، exit 0. تغییر تولیدی `next-env.d.ts`
  پس از dev server به محتوای tracked بازگردانده شد.
- **Blocked External:** ابزار تصویر می‌تواند رندر شفاف بسازد اما مدل سه‌بعدی
  rigged و انیمیشن GLB/glTF تولید نمی‌کند. asset/ابزار 3D حرفه‌ای برای نیاز اصلی
  کاراکتر و تأیید ظاهر همین رندر توسط مالک لازم است. رندر فعلی سه‌بعدی واقعی نامیده
  نشود. برای provider متن/صوت واقعی نیز حساب، مدل مجاز، منطقهٔ داده، سیاست retention
  و سقف هزینه لازم است؛ کلید باید فقط در secret manager/environment تنظیم شود و در
  چت ارسال نشود. آزمون صوت واقعی هنوز انجام نشده است.
- **Deferred Later:** مراحل B تا F (adapter واقعی AI و ابزارهای فروشگاه، RAG مجاز،
  صوت واقعی، مدیریت نسخه‌دار/حافظه/handoff، آزمون کامل و بستهٔ انتشار) هنوز پیاده یا
  تأیید نشده‌اند. پاسخ‌های فعلی همچنان deterministic مرحلهٔ اول‌اند و نباید قابلیت
  AI/voice فعال تلقی شوند.
- **قدم بعدی دقیق:** پس از پذیرش/اصلاح ظاهر idle، حالت‌های تصویری هماهنگ یا asset
  rigged تأمین شود؛ مستقل از آن، مرحلهٔ B با provider adapter ساختگی، endpoint سمت
  سرور، quota و ابزار خواندنی کاتالوگ موجود پیاده و روی DB/Redis/storage ایزوله
  آزموده شود. سپس مراحل C تا F بدون ادعای اتصال واقعی تا فراهم‌شدن credential ادامه یابند.

### اجرای محلی برای بازبینی مالک — 2026-10-20 16:23، Asia/Tehran

- **Completed & Tested:** وضعیت واقعی Git و همین checkpoint بررسی شد؛ شاخه
  `codex/assistant-phase-one` روی `b16770c` است و تغییرات پیاده‌سازی مرحلهٔ اول
  همچنان فقط محلی و بدون commit/push/merge/deploy هستند.
- **Completed & Tested:** جدایی launcher پیش از اجرا دوباره تأیید شد: فایل‌های
  `.env` خوانده نمی‌شوند؛ PostgreSQL تازه در پوشهٔ موقت روی loopback و storage
  داخل همان پوشه ساخته می‌شوند؛ `QUEUE_DRIVER=inline` است و اتصال Redis ندارد؛
  پرداخت/ایمیل خاموش و API/Web فقط روی `127.0.0.1` هستند. هیچ داده یا سرویس
  Production استفاده یا تغییر نکرد.
- **Completed & Tested:** buildهای معتبر قبلی دوباره اجرا نشدند. launcher واقعی
  `node apps/web/scripts/assistant-local.mjs` با موفقیت در حال اجراست؛ صفحهٔ اصلی
  `http://localhost:3191/fa` و صفحهٔ مدیریت
  `http://localhost:3191/fa/admin/assistant` در مرورگر باز و برای تحویل به مالک
  نگه داشته شدند؛ هر دو endpoint پاسخ HTTP 200 دارند. صفحهٔ مدیریت تا ورود، لینک
  ورود کارکنان را نشان می‌دهد. تغییر خودکار dev server در `next-env.d.ts` نیز به
  محتوای tracked قبلی بازگردانده شد و تغییر پروژه‌ای محسوب نمی‌شود.
- **خطای رفع‌شده:** تلاش اول فقط به‌علت رد شدن رمز آزمایشی با سیاست
  `COMMON_WORD` پیش از ساخت حساب متوقف شد؛ launcher دادهٔ موقت همان تلاش را پاک
  کرد. اجرای دوم با رمز تصادفی محلی پذیرفته شد و حساب موقت
  `owner@hedax.test` ساخته شد. هیچ رمز در این فایل ثبت نشده است.
- **Requires Owner Decision / قدم بعدی:** مالک با حساب آزمایشی وارد شود، MFA
  موقت را برای همین stack ثبت کند، در `/fa/admin/assistant` دستیار را فعال و
  صریحاً ذخیره کند، سپس تب `/fa` را refresh کند تا مکانیک و پنجرهٔ گفتگو را
  ببیند. توقف launcher با Ctrl+C داده‌های موقت را حذف می‌کند. قابلیت تازه، AI/RAG،
  commit، push یا انتشار انجام نشود.

### دستیار مرحلهٔ اول — 2026-10-20، Asia/Tehran

- **Implemented Pending Verification:** درخواست جدید مالک، مجوز ویرایش و آزمون
  محلی ایزوله است؛ commit/push/merge/deploy ممنوع. مبنا `main` در `b16770c`،
  working tree هنگام شروع تمیز و شاخهٔ فعلی `codex/assistant-phase-one` است.
- root/web AGENTS و راهنمای Server/Client نسخهٔ نصب‌شده Next 16.3.7 خوانده شد.
  PR #20 هنوز OPEN و merge نشده است؛ SVG مکانیک از ref محلی همان PR بازیابی و
  به‌عنوان تصویر دوبعدی توسعه داده شد، نه مدل سه‌بعدی. هیچ شاخهٔ قدیمی جایگزین نشد.
- قرارداد تنظیمات bounded دوزبانه با پیش‌فرض خاموش، adapter قطعی با لینک‌های واقعی
  `/parts?q=` (سقف ۱۲۰ کاراکتر)، `/request-part` و `/contact` اضافه شدند.
- SettingsService/SiteSetting با کلید مستقل `assistant.phase1`، permission موجود
  `settings.manage`، قفل تراکنشی concurrent create/update، audit و مسیر تنظیمات
  زیر `admin/settings` برای invalidation موجود استفاده شدند؛ migration تازه نیست.
- UI مدیریت `/fa/admin/assistant` و `/en/admin/assistant` شامل چهار بخش کاربردی،
  ذخیرهٔ صریح و reset صرفاً فرم است. ویجت lazy، پنجره Radix، کنترل motion/compact،
  reduced-motion/visibility و مسیرهای allowlist دارد. پیام فقط حافظهٔ component است.
- **آزمون جاری:** build contracts/API موفق؛ نخستین web typecheck نبود label تازهٔ
  audit را یافت و در حال اصلاح است. هنوز backend/browser/build نهایی تأیید نشده.
  harness integration دیتابیس PostgreSQL موقت تازه و storage داخل همان پوشه دارد؛
  Redis URL آزمایشی مجزا و worker production اجرا نمی‌شود. فایل محیط واقعی خوانده نشد.
- **قدم بعدی:** اصلاح label، آزمون قرارداد/API ایزوله، مرورگر ۳۹۰/۷۶۸/۱۴۴۰ و بررسی
  واقعی تصاویر، سپس lint/typecheck/build مرتبط. نتایج و شکست‌ها همین‌جا ثبت شوند.
- فایل‌های جاری: `packages/contracts/src/assistant.ts` و export/test آن، سرویس/
  controller تنظیمات API و test 96، entry/widget/admin assistant وب، route مدیریت،
  site layout، shell، CSS، messages، fixture عمومی پیش‌فرض خاموش و SVG مکانیک.
- **Completed & Tested:** ۹ تست قرارداد، ۴ API integration روی DB واقعی موقت
  (RBAC مشتری/پشتیبانی/مهمان، persistence، concurrent create 200/409، audit و
  projection عمومی)، و regression موجود گفت‌وگوی انسانی با نام acknowledged
  message موفق شدند؛ ۷ تست نامرتبط همان فایل عمداً انتخاب نشدند.
- **Completed & Tested:** اجرای اصلاح‌شدهٔ شش browser test کامل موفق شد، با عکس
  ۳۹۰/۷۶۸/۱۴۴۰. عکس‌های موبایل open، تبلت open و دسکتاپ launcher واقعاً دیده شدند؛
  نزدیکی لبهٔ launcher به CTA سبب افزودن shrink/yield تطبیقی شد. کدهای لاتین در
  متن فارسی اکنون bdi مستقل دارند؛ این تغییر UI و تست visibility/collision تازه
  هنوز در انتظار اجرای هدفمند نهایی‌اند.
- **تاریخچهٔ شکست، رفع‌شده:** نخستین اجرای test به spawn EPERM sandbox خورد؛
  همان مسیر با مجوز اجرا شد. lint مرز zod-free را نشان داد؛ constants/adapter
  از schema جدا شدند. اجرای هم‌زمان مرورگر هنگام rebuild موقتاً export قدیمی دید
  و یک fixture نقش owner نامعتبر داشت؛ rebuild و نقش staff علت‌ها را رفع کردند.
  هیچ assertion برای سبزشدن ضعیف نشده است. ترجمهٔ فارسیِ تولیدشده با encoding
  نامناسب پیش از پذیرش اصلاح و تغییرات newline نامرتبط پاک شدند.
- **Implemented Pending Verification:** launcher اختصاصی
  `apps/web/scripts/assistant-local.mjs` برای بررسی مالک با DB/storage تازه،
  inline queue، environment allowlist بدون .env و bind loopback اضافه شد؛
  smoke آن در حال اجراست. تلاش اول فقط approval deadline خورد و اجرا نشد؛ retry
  همان درخواست پذیرفته شد. راهنما در `docs/HEDAX_ASSISTANT_PHASE1.md` است.
- هیچ commit/push/merge/deploy یا تماس با سرور/DNS/دادهٔ Production انجام نشده.
- **Completed & Tested — نتیجهٔ نهایی مرحله:** قرارداد/پایداری تنظیمات و پوستهٔ
  راهنمای دوزبانه پیاده و محلی آزموده شدند. دستیار همچنان به‌صورت پیش‌فرض خاموش
  است؛ API مدل، RAG، حافظه، VIN، قیمت‌گذاری یا اقدام تجاری خودکار اضافه نشده‌اند.
- **Completed & Tested — آزمون نهایی:**
  - `pnpm --filter @hedax/contracts exec vitest run test/assistant.test.ts`:
    ۹ تست موفق؛ اجرای نهایی پس از تفکیک public/schema نیز exit 0.
  - `pnpm --filter @hedax/api exec vitest run --config vitest.integration.config.ts
    test/integration/96-assistant-settings.test.ts`: چهار تست، exit 0 و cleanup موفق.
  - همان integration config، فایل `30-chat-files-access.test.ts` و
    `-t 'acknowledged message'`: یک regression واقعی REST/WebSocket موفق، exit 0.
  - browser: شش سناریوی اولیه موفق؛ با افزودن visibility هفت سناریو شد. اصلاح
    جلوگیری از پوشاندن کنترل‌ها ابتدا launcher را در viewport کوتاه پنهان کرد؛
    این شکست حفظ و با جابه‌جایی محدود به لبهٔ مقابل/ارتفاع امن رفع شد. چهار تست
    متاثر نهایی (`-g 'disabled by default|visual'`) همگی موفق، exit 0 در 35.3s؛
    سه سناریوی دیگرِ مسیرهای مستثنا/ذخیرهٔ صریح/visibility قبلاً موفق بودند و
    بی‌دلیل دوباره اجرا نشدند. assertion عدم تقاطع، حرکت عمودی یا افقیِ بدون
    پوشاندن کنترل را می‌سنجد؛ تست یا معیار پذیرفتن هم‌پوشانی حذف نشده است.
  - `pnpm lint`، typecheck API/web/contracts، build API/contracts و build نهایی
    وب موفق‌اند. `pnpm --filter @hedax/web build` در 169 صفحه و TypeScript
    exit 0 داشت؛ فقط endpoint محلیِ بی‌داده برای build تنظیم شد. شکست اول build
    دسترسی sandbox به SWC native cache بود؛ همان فرمان با مجوز موفق شد، package
    تازه یا ارتقای وابستگی انجام نشد. lint/typecheck هدفمند پس از آخرین اصلاح
    launcher نیز موفق‌اند؛ `git diff --check` سالم است.
- **Completed & Tested — راه اجرای ایزوله:**
  `node apps/web/scripts/assistant-local.mjs --smoke` با DB/storage تازه و API/web
  loopback واقعاً اجرا شد، public default=false و صفحهٔ مدیریت HTTP/200 بودند؛
  سپس stack/داده‌های موقتِ خودش پاک شدند. این smoke معادل ورود/ذخیرهٔ UI نیست؛
  ذخیره در API integration و رفتار فرم در browser fixture جدا آزموده شده است.
- **Completed & Tested — تصاویر:** هر شش تصویر نهایی launcher/open در عرض‌های
  ۳۹۰، ۷۶۸ و ۱۴۴۰ دیده و بررسی شدند؛ برش متن، خروج پنجره از viewport یا پوشاندن
  CTA اصلی دیده نشد. تصویر موبایل و تبلت RTL خوانا و کنتراست پنجره مناسب است.
  نسخهٔ قابل‌مراجعهٔ تصاویر در `.local-run/assistant-phase1/assistant-*.png`
  (ignored؛ فقط دادهٔ synthetic) نگهداری می‌شود.
- **Deferred Later / محدودیت پذیرش:** کیبورد و safe-area دستگاه فیزیکی iPhone/
  Android بررسی نشده‌اند؛ مرورگر desktop با visual viewport کوتاه و reduced
  motion بررسی شد. browser fixture اثبات backend واقعی محسوب نمی‌شود. فعال‌سازی
  روی سایت اصلی و اتصال مدل AI در این مرحله انجام نمی‌شود.
- **قدم بعدی دقیق:** مالک با دستورهای راهنمای `docs/HEDAX_ASSISTANT_PHASE1.md`
  launcher محلی را اجرا کند، در `http://localhost:3191/fa/staff/login` با مالک
  کاملاً آزمایشی وارد شود و `/fa/admin/assistant` را بررسی کند. تغییرات کد فقط
  local/uncommitted روی `codex/assistant-phase-one` با HEAD `b16770c` باقی‌اند؛
  commit/push/merge/deploy تنها با درخواست تازهٔ مالک. baseline یا آزمون‌های سبز
  تکرار نشوند مگر تغییر یا شکست تازه. `next-env.d.ts` پس از build برابر HEAD است.

### انتشار Production — 2026-10-20، 09:25 Asia/Tehran

- **Completed & Tested — تصمیم و Git:** مالک پس از دریافت طرح/ریسک‌ها، صریحاً
  Merge، انتشار و commit/push را تأیید کرد. PR #28 با guard روی SHA
  `883df80db8febd1eadf308967c3b079adbf9a3ab` ادغام شد. merge commit برابر
  `0c6e94cc30a92065b563402f7b3415c876b8ab0b` و tree آن دقیقاً برابر candidate است.
  CI feature، run `39373413011`، و CI main پس از merge، run `39376889261`، SUCCESS شدند.
- **Completed & Tested — انتشار واقعی:** در 05:49 UTC ورودی API/web متوقف،
  Importهای فعال عادی/برند و outbox تخلیه، سپس worker قدیمی متوقف شد. API، worker
  و web هماهنگ با سه image آمادهٔ revision `883df80` جایگزین شدند. هیچ migration،
  تغییر DNS/storage policy، restore زنده یا ورود فایل تأمین‌کننده انجام نشد.
- **Completed & Tested — سلامت پس از انتشار:** readiness شامل database/Redis/
  storage/scanner سالم و امضاهای scanner تازه؛ صفحات www، فارسی، انگلیسی، قطعات
  و ورود کارکنان HTTPS/200 هستند. www به apex فارسی هدایت می‌شود. API/web healthy،
  worker running و restart count هر سه صفر است. دسترسی بدون ورود به فهرست و فایل
  نمونهٔ Import با 401 رد شد. مالک شخصاً وارد مدیریت شد و dashboard واقعی باز شد. مشاهدهٔ 05:55 UTC دوباره سلامت هفت سرویس، صفر restart، صفر job ناتمام و صفر خط error سطح برنامه را تأیید کرد؛ یک فایل عمومی S3 از مسیر سایت 200 و دانلود یک attachment خصوصی واقعی بدون ورود 401 بود.
- **Completed & Tested — ماندگاری و بازگشت:** checkout سرور روی branch
  `deploy/pr28-20261020` و merge commit بالا قرار گرفت؛ resolved Compose پیش/پس
  دقیقاً برابر بود. imageهای قبلی با tag مستقل محفوظ‌اند؛ tagهای عادی سه سرویس
  به candidate اشاره می‌کنند. wrapper ثابت `/opt/hedax-compose-current` همان طرح
  انتشار را اجرا می‌کند. restart policy موجود حفظ شد؛ سرویس‌های داده دست‌نخورده‌اند.
- **Completed & Tested — بازیابی:** بکاپ کامل
  `pr28-complete-20261020T050208Z`، رمزگشایی واقعی روی رایانهٔ مالک، restore ایزولهٔ
  ۹۹ جدول/۱۸ migration و تطبیق ۶۷ آبجکت موفق بودند؛ نسخهٔ رمزگذاری‌شدهٔ خارج از
  سرور نیز با hash برابر تأیید شد. جزئیات و شکست رفع‌شدهٔ harness در تاریخچه پایین‌اند.
- **Blocked External — پذیرش Import زنده:** در baseline هیچ manufacturer ثبت
  نشده بود (count=0). برند مشخصاً آزمایشی «آزمون انتشار PR28» از UI و با audit
  ساخته شد. هنگام انتخاب CSV مصنوعی دو ردیفی، مرورگر مجوز upload را با علت
  «user declined permission» رد کرد. فایل upload نشده، job ساخته نشده و Import/
  Undo هنوز آزموده نشده‌اند. مسیر جایگزین برای دورزدن منع upload استفاده نشد.
  مالک می‌تواند فایل مصنوعی آماده را شخصاً در فرم انتخاب/بارگذاری کند؛ سپس فقط
  همان job با publish=false پیش‌نمایش/اجرا/Undo و نتیجه ثبت شود. برند آزمون پس از
  پایان آزمون غیرفعال شود؛ سابقه/audit حفظ شود. دانلود مجاز فایل خصوصی واقعی
  هنوز جداگانه تأیید نشده و با موفقیت restore یا ورود مالک اشتباه گرفته نشود.
- **Deferred Later — عملیات دوره‌ای و سرویس‌ها:** بکاپ روزانهٔ موجود هنوز S3
  را پوشش نمی‌دهد و کلید قبلی آن پیدا نشده است؛ بکاپ کامل فعلی این شکاف دوره‌ای
  را حل نمی‌کند. payment/SMS provider هنوز none است؛ checkout/OTP واقعی آماده
  اعلام نمی‌شود. Preview عمومی مستقر نشده؛ این ریسک در تأیید مالک ارائه شد.
- **قدم بعدی:** تکمیل پذیرش مصنوعی از همان فرم پس از upload توسط مالک، سپس ثبت
  نتیجهٔ پذیرش در Git. کد مستقر همان 883df80 است؛ ثبت این checkpoint صرفاً مستنداتی است. baseline/XLS/TEST-02 یا ساخت imageها تکرار نشوند.
  rollback کد دادهٔ جدید را معکوس نمی‌کند؛ worker قدیمی تنها پس از reconciliation
  jobهای جدید مجاز است. restore مخرب نیازمند تصمیم جداگانه دربارهٔ داده‌های تازه است.

### تاریخچهٔ آمادگی انتشار مستقیم — 2026-10-20 (با انتشار بالا جایگزین شد)

- **Completed & Tested — Git/دامنهٔ کار:** کد PR #28 روی
  `3343dcbaaa1d520c817809317ac6a4ceed8f1d56` و مبنا `d205e37` است؛ PR باز، Draft
  و ادغام‌نشده است. CI همین SHA، run `39258053730`، موفق بود. فقط PROGRESS و
  گزارش readiness در آماده‌سازی حاضر تغییر کرده‌اند. baseline، تست‌های XLS/UI،
  TEST-02 و نمونهٔ تأمین‌کننده دوباره اجرا نشدند.
- **Requires Owner Decision — انتخاب مالک:** انتشار مستقیم Production ترجیح
  مالک است؛ ایجاد Preview قدم جاری نیست. مجوز بررسی/آماده‌سازی و ورود به آروان
  داده شده است؛ Merge و تغییر سرویس‌های زنده همچنان نیازمند توضیح تغییر/خطر و
  تأیید صریح نهایی هستند. برنامه‌های Preview پایین این بخش تاریخچه‌اند.
- **Completed & Tested — دسترسی/ثبت:** پس از ردهای سیاست مجوز قبلی، مالک Full
  access را فعال کرد و اتصال SSH موفق شد. patch آماده با مسیر مطلق روی فایل‌های
  اصلی اعمال و تغییر محلی قبلی حفظ شد؛ whitespace سالم است. نخستین check با مسیر
  نسبی اشتباه، پیش از هر تغییری شکست خورد و با مسیر درست رفع شد. رمز و OTP گرفته نشد.
- **Completed & Tested — هدف فعلی:** Git سرور تمیز و روی `232afae` است؛ tree آن
  با مبنای PR برابر است. هر ۱۸ migration نصب‌شده کامل و checksumها مطابق‌اند؛
  این PR تغییر Schema ندارد. API/worker در پیکربندی و دو ماژول با هش برابر
  هماهنگ‌اند. سرویس‌ها سالم و Import/صف event فعال در بررسی تازه صفر بودند؛
  quiesce/drain باید درست پیش از rollout مجاز دوباره تأیید شود.
- **Completed & Tested — بکاپ/بازیابی واقعی:** بکاپ کامل
  `pr28-complete-20261020T050208Z` تهیه شد. شمارش هر ۹۹ جدول و pg_dump از یک
  snapshot read-only مشترک گرفته شدند. هر ۱۸ فایل خصوصی و ۴۹ فایل عمومی S3 با
  مقایسهٔ دانلودی محتوا تأیید و موجودی پیش/پس بدون تغییر بود. فایل‌های محلی و
  پیکربندی نیز در آرشیو رمزگذاری‌شده قرار گرفتند؛ هیچ دادهٔ خصوصی وارد Git نشد.
- **Completed & Tested — رمزگشایی/restore:** کلید مستقلِ تازه در محل خصوصی مالک
  خارج از سرور با ACL محدود ساخته و کلیدهای قدیمی حفظ شدند. آرشیو از سرور به
  محل حفاظت‌شدهٔ مالک منتقل، واقعاً رمزگشایی و هر ۷۶ hash payload تطبیق داده شد.
  همان آرشیو رمزگشایی‌شده در PostgreSQL موقت با network=none، بدون پورت عمومی یا
  mount زنده، بازیابی شد: شمار هر ۹۹ جدول، migrationها و hash هر ۶۷ آبجکت برابر؛
  trigger append-only audit فعال؛ چهار ciphertext MFA با کلید برنامهٔ موجود در
  بکاپ قابل رمزگشایی بودند. کلیدهای لازمِ config نیز با runtime برابر بودند.
  این آزمون، ورود واقعی مالک یا تست API مجوزهای دانلود نبود.
- **تاریخچهٔ شکست restore، رفع‌شده:** تلاش اول پس از pg_isready زودتر از ساخته‌شدن
  دیتابیس مقصد به سرور موقت init وصل شد. شرط PID 1=postgres و SELECT 1 موفق
  اضافه شد؛ تلاش دوم تمام کنترل‌های بالا را گذراند. container موقت پاک شد و
  log شکست اول حفظ شد. این شکست، خرابی dump یا تغییر Production نبود.
- **Completed & Tested — نسخهٔ خارج از سرور:** فایل رمزگذاری‌شده در مقصد خصوصی
  بکاپ موجود کپی و دوباره خوانده شد؛ SHA-256 و اندازهٔ 4,250,824 بایت با نسخهٔ
  رمزگشایی/بازیابی‌شده برابر بود. کلید خصوصی جدید روی سرور یا داخل بکاپ/Git نیست.
- **Deferred Later — برنامهٔ روزانه:** بکاپ کامل این انتشار اثبات شد؛ اسکریپت
  روزانهٔ موجود هنوز S3 را پوشش نمی‌دهد و کلید پیشینِ آن پیدا نشده است. اصلاح
  schedule/retention یا جایگزینی کلید آن انجام نشده است. نسخه‌نگاری خصوصی در
  مشاهدهٔ 2026-10-19 و عمومی در 2026-10-20 غیرفعال بود؛ policy تغییر نکرد.
- **Implemented Pending Verification — بستهٔ انتشار:** قدم جاری ساخت imageهای
  API/worker/web از SHA مشخص PR، بررسی dependency/worker XLS در image بدون
  شبکه/دادهٔ زنده، ثبت شناسهٔ imageها و بررسی CI همان commit است. هنوز هیچ
  image جدیدی جای سرویس زنده را نگرفته است.
- **Requires Owner Decision — rollout/rollback:** پس از ساخت و کنترل نسخه،
  نتیجه و ریسک نبود Preview عمومی ارائه و تأیید نهایی Merge/انتشار همان نسخه
  گرفته شود. ورودی Import مهار، jobها تخلیه و API/worker/web هماهنگ جایگزین شوند؛
  imageهای قبلی با شناسهٔ ثابت حفظ شوند. rollback کد، دادهٔ Import را معکوس
  نمی‌کند و worker قدیمی نباید job جدید مصرف کند. restore مخرب تصمیم جداگانه لازم دارد.
- **Checkpoint ثبت/ارسال‌شده:** فقط دو سند PROGRESS/readiness در commit 883df80db8febd1eadf308967c3b079adbf9a3ab ثبت و روی feature ارسال شدند؛ کد برنامه تغییر نکرد. GitHub connector یک خطای transport داد؛ read از gh و ls-remote همان مبدأ/مقصد را تأیید کرد. candidate همین SHA در مسیر مستقل و با نام imageهای جدا در حال build است؛ container برنامه در برابر Production شروع نشده است. CI این SHA باید جدا از CI قبلی بررسی شود. این خط پس از commit تغییر محلی PROGRESS است.
- **Completed & Tested — CI آخرین feature:** run 39373413011 روی SHA 883df80db8febd1eadf308967c3b079adbf9a3ab کاملاً SUCCESS شد؛ PR Draft/OPEN/CLEAN است. نخستین build candidate پیش از ساخت با unknown flag --progress متوقف شد چون Buildx روی سرور نصب نبود. log حفظ شده؛ ابزار رسمی Docker Buildx با digest انتشار در tooling اختصاصی candidate آماده می‌شود، بدون تغییر daemon یا سرویس‌های Production. فقط ساخت بسته تکرار خواهد شد؛ restore و baseline تکرار نمی‌شوند.
- **Completed & Tested — بستهٔ نهایی:** هر سه image API/worker/web از
  `883df80db8febd1eadf308967c3b079adbf9a3ab` ساخته و با همین revision برچسب‌گذاری
  شدند. hash آرشیو source روی سرور و مبدأ محلی برابر است. imageها با نام جدا
  نگهداری می‌شوند؛ سرویس زنده همچنان نسخهٔ قبلی را اجرا می‌کند. ماژول‌های
  Import/reader در API و worker hash برابر دارند. ابزار رسمی Buildx فقط در
  tooling مستقل candidate قرار گرفت؛ daemon/config عمومی Docker تغییر نکرد.
- **Completed & Tested — smoke داخل بسته:** XLS واقعیِ کاملاً مصنوعی با دو ردیف
  در container بدون شبکه خوانده شد؛ dependency همان SheetJS 0.20.3 است و شمارهٔ
  000123 درست حفظ شد. تلاش اولِ smoke، --input-type=module را به worker eval
  ارث می‌داد و require در آن محیط تعریف نبود؛ همان ReferenceError با worker
  کوچک جدا بازتولید شد. اجرای آزمون از فایل با execArgv معمول Production موفق
  شد؛ کد برنامه و imageها تغییر/دوباره ساخته نشدند. log شکست اولیه محفوظ است.
- **Completed & Tested — طرح rollout/rollback:** Compose هر دو طرح فقط image سه
  سرویس و pull_policy=never را عوض می‌کند؛ environment، network و volumeها برابر
  baseline باقی می‌مانند. شناسه‌های image قدیمی موجود و rollback reviewable است.
  helper اجرا نشده و تنها syntax آن بررسی شده است. پیش از جایگزینی، API/web
  متوقف، تمام jobهای Import معمولی/برند و outbox تخلیه، سپس worker قدیمی متوقف
  می‌شود تا نسخه‌های worker مخلوط نشوند. هیچ migration یا restore زنده در طرح نیست.
- **Completed & Tested — وضعیت نهایی قبل از تأیید:** CI آخرین feature، run
  `39373413011`، SUCCESS و PR #28 همان SHA، OPEN/Draft/CLEAN است. سرویس‌های قدیمی
  healthy و scannerSignatures=fresh بود؛ صف event فعال/منتظر صفر بود. Importهای
  معمولی موجود FAILED/AWAITING_MAPPING/PREVIEW_READY/COMMITTED بودند و مورد فعال
  نداشتند؛ هیچ‌کدام دستی تغییر وضعیت داده نشدند.
- **Requires Owner Decision — تنها قدم اجرایی بعدی:** تأیید صریح نهایی مالک برای
  Merge PR #28 روی SHA دقیق 883df80 و انتشار همین سه image آماده لازم است. طرح
  شامل وقفهٔ کوتاه احتمالی، کنترل سلامت/صف‌ها، ورود کارکنان توسط خود مالک و تست
  فایل مصنوعی کوچک با Undo فقط همان job است؛ آرشیو تأمین‌کننده وارد نمی‌شود.
  نبود Preview عمومی و کار بعدی بکاپ دوره‌ای باید در تصمیم مالک دیده شوند.
  rollback کد دادهٔ تازه را معکوس نمی‌کند؛ بازگشت worker قدیمی تنها پس از بررسی
  jobهای جدید مجاز است. restore مخربِ دادهٔ زنده تأیید جداگانه می‌خواهد.
- **Completed & Tested — کنترل نهایی 2026-10-20 ساعت 09:14 Asia/Tehran:** هر ۱۸
  checksum migration با source candidate برابر، Import فعال معمولی/برند و outbox
  ناتمام صفر، صفحات عمومی و ورود HTTPS/200 بودند. readiness وابستگی‌ها سالم و
  امضاهای scanner تازه بود؛ سرویس‌ها همچنان imageهای قدیمی را اجرا می‌کردند.
  نخستین پرس‌وجوی آخر فقط به علت escaping کوتیشن در shell خطای syntax داشت و
  هیچ داده‌ای عوض نشد؛ با اجرای آرگومان‌های SQL از helper Python، همان کنترل
  هدفمند موفق شد. طرح دقیق تصمیم انتشار در خروجی RELEASE_NEXT_STEP همین گفتگو
  آماده است. اکنون فقط تأیید نهایی مالک برای Merge/rollout/تست مصنوعی منتظر است.
- **ثبت محلی پس از commit:** این نتایج ساخت/طرح در PROGRESS و readiness محلی
  ثبت می‌شوند؛ remote HEAD/کد/imageها همچنان 883df80 هستند. CI سبز همان SHA است.
  برای ثبت هر خط نتیجه commit/CI تکراری ساخته نشود. هیچ Merge یا rollout انجام نشده است.

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
- **Checkpoint ثبت‌شده:** همهٔ پنج فایل بالا در commit
  `3343dcb` (`docs: add isolated preview deployment profile`) ثبت و روی
  `origin/refactor/source-enterprise-upgrade` push شدند. هیچ Merge/deploy/DNS یا
  تغییر Production انجام نشد. CI همان SHA، run `39258053730`، در ۲m۳۸s کاملاً
  موفق شد (lint، typecheck، unit، catalog/import، CMS، backup/restore و build
  وب). تنها annotation غیرمسدودکننده، deprecation وابستگی Node 20 در
  `pnpm/action-setup` است؛ job روی Node 24 اجرا شد. این checkpoint پس از commit
  محلی به‌روزرسانی شده و تنها تغییرِ باقی‌مانده است.
- **وضعیت نهایی PR در این جلسه:** PR #28 روی SHA
  `3343dcbaaa1d520c817809317ac6a4ceed8f1d56` هنوز `OPEN` و Draft است؛
  `mergeStateStatus=CLEAN` و check CI همان SHA `SUCCESS` است. این فقط آمادگی
  بازبینی فنی را نشان می‌دهد، نه مجوز Merge یا انتشار. مانع انتشار همچنان نبود
  Preview مستقلِ مستقر و پذیرش‌شده و سپس تأیید صریح مالک است.

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

- **Completed & Tested — final owner approval / merge 2026-10-20 09:18 Asia/Tehran:** مالک صریحاً انتشار و commit/push نهایی را تأیید کرد. PR #28 با guard روی SHA 883df80 ادغام شد؛ merge commit 0c6e94cc30a92065b563402f7b3415c876b8ab0b و tree آن دقیقاً برابر candidate است. تأیید شامل تست مصنوعی و Undo همان job است. rollout اکنون قدم جاری است؛ restore مخرب مجاز نشده است.
# Checkpoint — 2026-10-20 18:05 Asia/Tehran — assistant operational paths

**Branch / inspected HEAD:** `codex/assistant-phase-one` / `b16770c` (working tree intentionally uncommitted; no push, merge, deploy or Production change).

## Completed & Tested

- Added a server-side assistant module with `POST /assistant/messages`, an adapter boundary (`mock`/`openai`), server-only model configuration, fixed system prompt, at most 8 history entries, 3–30s timeout, output-token cap, daily request cap, per-IP/user rate limiting and generic provider errors that do not expose keys or upstream bodies.
- Free-form widget messages now use the server endpoint. The old deterministic free-form `assistantRespond` path is no longer called; the four explicit navigation shortcuts remain local by design.
- The message service calls the existing `CatalogService.list` for every query. Product cards are built directly from `ProductCard` fields (name/number, registered fitment, availability, price currency and sales unit). Model prose is not used as the source of those facts. No order/customer tool is exposed, so the assistant cannot read personal data; any future personal tool must require an authenticated actor and ownership check.
- Added `POST /assistant/transcribe` (5 MB in-memory limit; raw recording is not stored) and `POST /assistant/speech`. The browser requests microphone access only after the mic button, shows the returned transcript by placing it in the input, sends it through the same message endpoint, plays speech, exposes stop-through-mute and mute controls, and drives `data-speaking` from actual audio play/end events. Permission/provider failure leaves text available.
- Admin now reads `GET /admin/assistant/status` and shows provider, model, configured/live state, timeout, output cap and daily cap. Secrets are never returned.
- Safe placeholder names were added to `.env.example`: `ASSISTANT_AI_PROVIDER`, `ASSISTANT_LIVE_CALLS_ENABLED`, `OPENAI_API_KEY`, text/STT/TTS models and voice, timeout/output/daily limits. The key stays server-side and is never a `NEXT_PUBLIC_*` value.
- Isolated verification passed: `pnpm --filter @hedax/api test -- test/unit/assistant.service.test.ts` → 2/2; API and web typechecks passed; API build passed; web production build passed after the running dev server released/recreated its generated `.next/dev` state. The first sandbox test attempt failed only with Windows `spawn EPERM`; the first build attempt failed on the SWC cache permission and a locked stale generated route file, then passed outside that restriction.
- Live local HTTP evidence against the disposable stack: message returned provider `mock`, model `synthetic-test-provider`, 4 CatalogService-backed products for «لنت ترمز»; speech returned `audio/wav`, 4044 bytes. Browser accessibility confirms the HEDAX guide is visible on `http://localhost:3191/fa`. Admin is open at `/fa/admin/assistant`.

## Implemented Pending Verification / Blocked External

- **Text AI:** code complete and mock-tested; a real OpenAI response has not been called. Required: set `OPENAI_API_KEY` in the server secret environment, choose/confirm model values, set `ASSISTANT_AI_PROVIDER=openai`, and explicitly approve the paid-call budget before setting `ASSISTANT_LIVE_CALLS_ENABLED=true`.
- **Catalog:** implemented and locally exercised with synthetic seeded catalog data. Production catalog data was not accessed. Exact fitment is shown only when registered; no VIN/Microcat source exists.
- **Voice:** browser capture/control and server STT/TTS paths are implemented; mock transcription and a synthetic WAV were tested. Real Persian/English recognition, audible TTS quality and the full user-voice → text → real model → real speech chain remain blocked on the same credential and paid-call approval. A physical microphone permission/recording was not automated.
- The daily live-call counter is process-local. It is a hard local safeguard, not a shared multi-instance monetary ledger; production enablement needs an owner-approved provider budget and, for multiple API replicas, a shared Redis usage counter.

## Local review state and exact next action

- Launcher session is running and must remain open: web `http://localhost:3191`, API `127.0.0.1:4191`, disposable PostgreSQL `127.0.0.1:55439`, inline queue, temporary storage, provider `mock`, live calls false. It loads no repository `.env` and uses no Production database/Redis/storage. The local assistant is enabled only in the disposable database.
- Local account: `owner@hedax.test`; use the already supplied local-only password and enroll local MFA. Do not record that password here.
- Next owner decision: approve a maximum paid-call budget/request allowance and place `OPENAI_API_KEY` in the local server environment/secret manager (never chat/Git). Then run exactly one bounded real text call and one bounded STT/TTS round trip, record provider request IDs/status without content or secrets, and keep Production disabled.

# Checkpoint — 2026-10-20 18:32 Asia/Tehran — Arvan text release in progress

**Authorization:** Owner explicitly authorized assistant-only commit/push/PR/merge/Production deployment. DNS changes, destructive data operations, credit purchase and uncapped paid use remain unauthorized.

- **Completed & Tested:** Official Arvan AIaaS documentation confirms `POST [Endpoint]/chat/completions`, `Authorization: apikey …`, OpenAI Chat Completions-shaped messages, stateless requests and endpoint rate limits. Responses API compatibility is not assumed.
- **Account evidence:** authenticated read-only panel inspection shows no existing AI gateway (`اولین درگاه AI خود را بسازید`). No duplicate was created. Marketplace confirms `GPT-5.6-Luna` (Beta), 1M context, input 624,000 IRR/1M tokens and output 3,744,000 IRR/1M tokens. Account balance was observed but is intentionally not copied here.
- **Completed & Tested:** provider implementation now has a distinct `arvan` adapter using the exact endpoint and `apikey` header. Controlled server-side CatalogService grounding remains in place; no SQL/arbitrary HTTP/write tool is exposed. Mock contract tests cover CatalogService facts and the Arvan request/response shape: 2/2 passed. Contracts/API/web typechecks passed.
- **Completed & Tested:** customer microphone, mute and speech controls were removed from the widget for this text-only release. Voice endpoints were removed from the assistant controller/service. Voice is Deferred Later.
- **Implemented Pending Verification:** persisted settings now contain bounded bilingual System Prompt, max output tokens and daily request limit with safe defaults; the public settings projection removes the private AI block. Assistant messages fail closed when the saved assistant switch is off. Admin UI editing controls for the new AI fields and shared/multi-instance cost reservation are not yet complete.
- **Blocked External / owner action required once:** create the first free AI gateway named `source-hedax-assistant` in Arvan, attach exact model `GPT-5.6-Luna`, use the free Arvan domain and set endpoint rate limit; create a least-privilege machine-user/API key for this gateway. Put the key only in the Production server secret environment as `ARVAN_AI_API_KEY`; put the exact non-secret gateway base URL ending in `/v1` as `ARVAN_AI_ENDPOINT`. Do not paste the key in chat. Suggested approval: test cap 50,000 IRR total; public daily cap 300,000 IRR and 100 requests/day initially. No gateway, key, credit purchase or paid request has been made yet.
- **Deployment state:** not committed, pushed, merged or deployed. Production assistant remains unchanged/off. A real Arvan response and post-deploy domain test have not occurred, so release must not be claimed.
- **Exact next step after owner action:** finish admin AI controls and shared budget reservation tests; run one bounded real Arvan call with synthetic/non-sensitive data; run targeted integration/browser/build; review diff; commit/push/PR/CI/merge; verify backup/rollback and deploy via the existing production method; enable via admin and execute post-deploy checks on both locales.

# Checkpoint — 2026-10-20 18:50 Asia/Tehran — hard AI budgets

**Branch / HEAD:** `codex/assistant-phase-one` / `b16770c`; working tree remains uncommitted. No Production, DNS, merge, push or paid provider call occurred.

- **Owner authorization:** hard isolated-test allowance 50,000 IRR; hard public allowance 300,000 IRR per UTC day and 100 requests per UTC day. Assistant-only publication authorization remains active.
- **Completed & Tested:** replaced process-local request/concurrency checks with one atomic Redis reservation before every Arvan call. It gates cost, daily requests and concurrent calls together. Production fails closed when Redis is unavailable. Failed provider calls release concurrency but retain the conservative cost reservation; reported token usage refunds only unused reservation.
- **Evidence:** API typecheck passed. Targeted isolated unit suites passed outside the Windows sandbox after the sandbox-only `spawn EPERM`: 2 files, 5 tests. Tests separately cover cost rejection, request rejection, concurrency rejection, usage settlement, CatalogService grounding and Arvan URL/header contract. No paid request was made.
- **Completed:** public settings integration expectation now verifies that the AI prompt/config block is absent. Provider failure UI now supplies an honest contact path. Secure Arvan server-only setup and current text architecture are documented in `docs/HEDAX_ASSISTANT_PHASE1.md`; `.env.example` contains approved numeric caps and secret placeholders only.
- **Implemented Pending Verification:** run the changed integration and browser suites, lint/typechecks/build, inspect generated changes, then commit/push and obtain green CI.
- **Blocked External:** authenticated Arvan account still had no gateway at last read-only check. Owner must create `source-hedax-assistant`, attach `GPT-5.6-Luna`, create a least-privilege gateway credential, and enter `ARVAN_AI_ENDPOINT` plus `ARVAN_AI_API_KEY` only in the server's mode-600 `.env`. Never send the key in chat. A real test and Production deploy cannot be truthfully completed before that secure setup.

# Checkpoint — 2026-10-21 Asia/Tehran — local release candidate verified

**Branch / HEAD before commit:** `codex/assistant-phase-one` / `b16770c`. No Production, DNS, merge, push or paid provider call occurred in this checkpoint.

- **Completed & Tested:** API integration for persisted settings/public projection passed after rebuilding the compiled API: 1 file, 4 tests. The public endpoint omits the private AI prompt/config block.
- **Completed & Tested:** assistant browser suite completed with 6/7 on the first run; the sole failure was an over-broad test selector that also matched the English fixture word `grounded`. The selector was limited to the exact part number and the failed scenario passed on targeted retry. Effective result: all 7 scenarios passed, including grounded product cards, no voice controls, bilingual flow, admin save behavior and responsive/accessible launcher checks.
- **Completed & Tested:** workspace lint, web typecheck and Next.js production build passed. After removing unused deferred-voice env/schema/client helpers and correcting the admin description, API and web typechecks plus targeted lint passed again. Voice remains Deferred Later and has no customer control or active endpoint/config surface.
- **Completed & Tested:** `git diff --check` passed and no real Arvan key was found. Only empty placeholders and an explicit fake test value exist. Generated `apps/web/next-env.d.ts` is no longer dirty.
- **Implemented Pending Verification:** commit/push this assistant release candidate, create or update its PR, wait for CI, then run exactly one real bounded Arvan call after the secure gateway credential is installed.
- **Blocked External:** Arvan gateway/credential setup is still required. Create `source-hedax-assistant`, attach exact model `GPT-5.6-Luna`, and enter `ARVAN_AI_ENDPOINT` and `ARVAN_AI_API_KEY` only in the server mode-600 `.env`; do not send or print the key. Until then, a real provider response, deployment and live-domain validation cannot be claimed.
- **Commit:** local release candidate committed as `aa74097` (`feat: add grounded Arvan text assistant`) after normalizing the two new contracts files to LF and passing the staged whitespace check. Push/PR/CI remain the next step.
- **Completed & Tested — remote:** checkpoint commit `452108f` and feature commit were pushed to `origin/codex/assistant-phase-one`. Draft PR #29 (`feat: add grounded Arvan text assistant`) was created against `main`; its head matched `452108f`, GitHub reported it mergeable, and CI run `39545727533` / job `119043353089` passed in 2m43s. The PR intentionally remains Draft and unmerged until the real bounded Arvan test succeeds.
