-- Editable site content (panel → «محتوای سایت»): FAQ items and text pages, plus the site's
-- current texts as initial values so the site looks exactly the same after the change.
-- Initial rows are inserted only when missing; nothing that exists is changed.

-- CreateTable
CREATE TABLE "faq_item" (
    "id" UUID NOT NULL,
    "question_fa" VARCHAR(200) NOT NULL,
    "question_en" VARCHAR(200) NOT NULL DEFAULT '',
    "answer_fa" TEXT NOT NULL,
    "answer_en" TEXT NOT NULL DEFAULT '',
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "faq_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_page" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "title_fa" VARCHAR(120) NOT NULL,
    "title_en" VARCHAR(120) NOT NULL DEFAULT '',
    "body_fa" TEXT NOT NULL DEFAULT '',
    "body_en" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "show_in_footer" BOOLEAN NOT NULL DEFAULT false,
    "seo_title_fa" VARCHAR(70) NOT NULL DEFAULT '',
    "seo_title_en" VARCHAR(70) NOT NULL DEFAULT '',
    "seo_description_fa" VARCHAR(170) NOT NULL DEFAULT '',
    "seo_description_en" VARCHAR(170) NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "content_page_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "faq_item_sort_order_idx" ON "faq_item"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "content_page_slug_key" ON "content_page"("slug");

-- Sections saved as a whole: general, contact, social, home page, notice bar, SEO.
INSERT INTO "site_setting" ("key", "value", "version", "updated_at") VALUES ('content.brand', $c${"siteName":{"fa":"سورس","en":"Source"},"siteTitle":{"fa":"سورس | قطعات خودرو و تأمین سفارشی","en":"Source | Auto parts & custom sourcing"},"tagline":{"fa":"پیشرو در هوش و تجارت.","en":"Pioneering Intelligence & Trade."},"footerAbout":{"fa":"سورس؛ تأمین دقیق، سریع و هوشمند قطعات خودرو.","en":"Source — precise, fast and smart auto-parts sourcing."},"copyright":{"fa":"© {year} هداکس","en":"© {year} HEDAX"},"logoUrl":"/brand/source/logo-dark.png","logoAlt":{"fa":"سورس — محصولی از هداکس","en":"Source by HEDAX"},"faviconUrl":""}$c$::jsonb, 0, CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;
INSERT INTO "site_setting" ("key", "value", "version", "updated_at") VALUES ('content.contact', $c${"displayName":"Source by HEDAX","phones":[{"label":{"fa":"تلفن","en":"Phone"},"number":"+98 25 3666 6669","numberFa":"۰۲۵-۳۶۶۶۶۶۶۹","extension":"119","whatsapp":false},{"label":{"fa":"موبایل و واتس‌اپ (امارات)","en":"Mobile & WhatsApp (UAE)"},"number":"+971 50 144 1797","numberFa":"+۹۷۱۵۰۱۴۴۱۷۹۷","extension":"","whatsapp":true}],"email":"info@sourcebyhedax.ir","address":{"fa":"","en":""},"mapUrl":"","mapLat":null,"mapLng":null,"hours":{"fa":"پشتیبانی ۲۴ ساعته، ۷ روز هفته","en":"Customer support 24/7"},"supportChat":false}$c$::jsonb, 0, CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;
INSERT INTO "site_setting" ("key", "value", "version", "updated_at") VALUES ('content.social', $c${"links":[{"network":"instagram","label":{"fa":"","en":""},"url":"","visible":true},{"network":"linkedin","label":{"fa":"","en":""},"url":"","visible":true},{"network":"telegram","label":{"fa":"","en":""},"url":"","visible":true},{"network":"x","label":{"fa":"","en":""},"url":"","visible":true}]}$c$::jsonb, 0, CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;
INSERT INTO "site_setting" ("key", "value", "version", "updated_at") VALUES ('content.home', $c${"sections":[{"id":"hero","type":"hero","visible":true,"title":{"fa":"قطعهٔ مورد نیازت را پیدا کن؛ برای تأمینش هم کنار تو هستیم.","en":"Find the part you need — and we'll source it when it isn't on the shelf."},"text":{"fa":"قطعات موجود را با عکس، مشخصات و قیمت ببینید و بخرید. اگر پیدا نکردید، درخواست تأمین برای هر برندی ثبت کنید؛ قیمت و زمان پیش از پرداخت اعلام می‌شود.","en":"Browse in-stock parts with photos, specs and prices. Can't find it? Request sourcing for any brand; price and lead time are confirmed before you pay."},"searchButton":{"fa":"جست‌وجوی قطعات موجود","en":"Search in-stock parts"},"imageUrl":"","showCategories":true,"categoriesTitle":{"fa":"دسته‌بندی‌ها","en":"Categories"},"showProcess":true,"processTitle":{"fa":"فرایند تأمین سفارشی","en":"How custom sourcing works"},"steps":[{"title":{"fa":"ثبت درخواست","en":"Submit a request"},"text":{"fa":"نام قطعه، خودرو و در صورت امکان عکس یا فایل را بفرستید.","en":"Send the part name, vehicle and, if you can, a photo or file."}},{"title":{"fa":"بررسی و اعلام قیمت و زمان","en":"Review, price & lead time"},"text":{"fa":"کارشناس بررسی می‌کند و پیش‌فاکتور با قیمت و زمان تأمین صادر می‌شود.","en":"An expert reviews it and issues a quote with price and lead time."}},{"title":{"fa":"تأیید و پرداخت","en":"Accept & pay"},"text":{"fa":"پس از پذیرش پیش‌فاکتور و تأیید پرداخت، تأمین آغاز می‌شود.","en":"Sourcing starts only after you accept the quote and the payment is verified."}},{"title":{"fa":"تأمین و ارسال","en":"Sourcing & delivery"},"text":{"fa":"پیشرفت را در حساب کاربری و گفت‌وگو دنبال کنید.","en":"Follow progress in your account and the conversation."}}],"processButton":{"label":{"fa":"درخواست تأمین قطعه","en":"Request a part"},"href":"/request-part"}},{"id":"brands","type":"brands","visible":true,"title":{"fa":"برندهای دارای موجودی","en":"Brands in stock"},"otherTitle":{"fa":"سایر برندها","en":"Other brands"},"otherText":{"fa":"برای هر برند دیگری درخواست تأمین ثبت کنید","en":"Request sourcing for any other brand"},"otherHref":"/request-part"},{"id":"featured","type":"featured","visible":true,"title":{"fa":"قطعات موجود","en":"In-stock parts"},"emptyText":{"fa":"هنوز قطعه‌ای منتشر نشده است.","en":"No parts have been published yet."},"emptyButton":{"label":{"fa":"درخواست تأمین قطعه","en":"Request a part"},"href":"/request-part"}},{"id":"faq","type":"faq","visible":true,"title":{"fa":"پرسش‌های متداول","en":"Frequently asked questions"}}]}$c$::jsonb, 0, CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;
INSERT INTO "site_setting" ("key", "value", "version", "updated_at") VALUES ('content.announcement', $c${"enabled":false,"text":{"fa":"","en":""},"linkLabel":{"fa":"","en":""},"href":"","tone":"brand"}$c$::jsonb, 0, CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;
INSERT INTO "site_setting" ("key", "value", "version", "updated_at") VALUES ('content.seo', $c${"defaultDescription":{"fa":"خرید قطعات خودروی موجود و ثبت درخواست تأمین قطعه برای هر برند؛ با اعلام قیمت و زمان پیش از پرداخت.","en":"Buy in-stock auto parts or request sourcing for any brand, with price and lead time confirmed before you pay."},"defaultImageUrl":"","pages":{"home":{"title":{"fa":"","en":""},"description":{"fa":"","en":""},"imageUrl":""},"parts":{"title":{"fa":"","en":""},"description":{"fa":"","en":""},"imageUrl":""},"brands":{"title":{"fa":"","en":""},"description":{"fa":"","en":""},"imageUrl":""},"imported":{"title":{"fa":"","en":""},"description":{"fa":"","en":""},"imageUrl":""},"requestPart":{"title":{"fa":"","en":""},"description":{"fa":"","en":""},"imageUrl":""},"contact":{"title":{"fa":"","en":""},"description":{"fa":"","en":""},"imageUrl":""}}}$c$::jsonb, 0, CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;

-- FAQ (the three questions on the home page today).
INSERT INTO "faq_item" ("id", "question_fa", "question_en", "answer_fa", "answer_en", "visible", "sort_order", "updated_at") VALUES (gen_random_uuid(), $c$قیمت‌ها با چه واحدی نمایش داده می‌شوند؟$c$, $c$Which currency are prices shown in?$c$, $c$قیمت‌ها به ریال یا درهم نمایش داده می‌شوند. پرداخت آنلاین با مبلغ نهایی ریالی انجام می‌شود و پیش از پرداخت مبلغ قطعی ریالی را می‌بینید.$c$, $c$Prices are shown in Iranian rial (IRR) or UAE dirham (AED). Online payment settles the final amount in IRR, which you always see before paying.$c$, true, 1, CURRENT_TIMESTAMP);
INSERT INTO "faq_item" ("id", "question_fa", "question_en", "answer_fa", "answer_en", "visible", "sort_order", "updated_at") VALUES (gen_random_uuid(), $c$اگر قطعه‌ام موجود نباشد چه کنم؟$c$, $c$What if my part is not in stock?$c$, $c$درخواست تأمین ثبت کنید. قیمت و زمان پس از بررسی در قالب پیش‌فاکتور اعلام می‌شود و تا پرداخت نکنید تأمین شروع نمی‌شود.$c$, $c$Submit a sourcing request. You'll receive a quote with price and lead time; nothing is sourced until you pay.$c$, true, 2, CURRENT_TIMESTAMP);
INSERT INTO "faq_item" ("id", "question_fa", "question_en", "answer_fa", "answer_en", "visible", "sort_order", "updated_at") VALUES (gen_random_uuid(), $c$آیا برای ثبت درخواست باید VIN داشته باشم؟$c$, $c$Do I need a VIN to submit a request?$c$, $c$خیر. VIN و کد قطعه اختیاری‌اند و فقط به کارشناس برای بررسی کمک می‌کنند.$c$, $c$No. VIN and part code are optional and only help our experts review the request.$c$, true, 3, CURRENT_TIMESTAMP);

-- Built-in text pages: "about" and the introductions of the four help topics.
INSERT INTO "content_page" ("id", "slug", "is_system", "title_fa", "title_en", "body_fa", "body_en", "published", "show_in_footer", "sort_order", "updated_at") VALUES (gen_random_uuid(), 'about', true, $c$دربارهٔ سورس$c$, $c$About Source$c$, $c$سورس با مأموریت «تأمین دقیق، سریع و هوشمند» قطعات خودرو فعالیت می‌کند: فروش قطعات موجود با مشخصات شفاف، و تأمین سفارشی قطعه برای هر برند با اعلام قیمت و زمان پیش از پرداخت.$c$, $c$Source works with a mission of “precise, fast and smart sourcing” of auto parts: selling in-stock parts with transparent specifications, and sourcing parts for any brand with price and lead time confirmed before payment.$c$, true, false, 1, CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "content_page" ("id", "slug", "is_system", "title_fa", "title_en", "body_fa", "body_en", "published", "show_in_footer", "sort_order", "updated_at") VALUES (gen_random_uuid(), 'help-buying', true, $c$راهنمای خرید$c$, $c$Buying guide$c$, $c$قطعهٔ موجود را جست‌وجو کنید، مشخصات، نوع و وضعیت آن را بررسی و به سبد اضافه کنید. پس از ورود با موبایل، نشانی و روش ارسال را انتخاب کنید و مبلغ نهایی ریالی را پیش از پرداخت ببینید. موجودی از لحظهٔ شروع پرداخت برای مدت محدودی برای شما رزرو می‌شود.$c$, $c$Search for an in-stock part, check its specs, type and condition, and add it to your cart. After signing in with your mobile, choose an address and shipping method and see the final IRR amount before paying. Stock is reserved for you for a limited time once payment starts.$c$, true, false, 2, CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "content_page" ("id", "slug", "is_system", "title_fa", "title_en", "body_fa", "body_en", "published", "show_in_footer", "sort_order", "updated_at") VALUES (gen_random_uuid(), 'help-sourcing', true, $c$فرایند تأمین سفارشی$c$, $c$Custom sourcing process$c$, $c$درخواست را با نام قطعه، خودرو و در صورت امکان عکس یا فایل ثبت کنید. کارشناس در گفت‌وگو سؤال می‌پرسد و پیش‌فاکتور رسمی با اقلام، قیمت و زمان صادر می‌کند. هر تغییر در پیش‌فاکتور نسخهٔ جدیدی می‌سازد. پس از پذیرش و تأیید پرداخت، تأمین آغاز می‌شود و پیشرفت در حساب شما دیده می‌شود.$c$, $c$Submit a request with the part name, vehicle and, if possible, a photo or file. An expert asks questions in the conversation and issues an official quote with items, price and lead time. Every change creates a new quote version. After you accept and the payment is verified, sourcing starts and progress shows in your account.$c$, true, false, 3, CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "content_page" ("id", "slug", "is_system", "title_fa", "title_en", "body_fa", "body_en", "published", "show_in_footer", "sort_order", "updated_at") VALUES (gen_random_uuid(), 'help-shipping', true, $c$ارسال$c$, $c$Shipping$c$, $c$$c$, $c$$c$, true, false, 4, CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "content_page" ("id", "slug", "is_system", "title_fa", "title_en", "body_fa", "body_en", "published", "show_in_footer", "sort_order", "updated_at") VALUES (gen_random_uuid(), 'help-returns', true, $c$مرجوعی و لغو$c$, $c$Returns & cancellations$c$, $c$$c$, $c$$c$, true, false, 5, CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING;
