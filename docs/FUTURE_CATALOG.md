# طرح توسعهٔ بعدی: کاتالوگ فنی، سازگاری و اتصال‌ها

> **وضعیت:** فقط طراحی و آمادگی معماری (بند ۱۹ پرامپت). هیچ‌کدام از این موارد در نسخهٔ اول پیاده‌سازی نشده و در رابط هیچ دکمه، دادهٔ فنی ساختگی یا اتصال نمایشی برایشان وجود ندارد.

## ۱. وضع فعلی (نسخهٔ اول)

- محصول به **برند خودرو** متصل است (`ProductVehicleBrand`) و `ProductFitment` یادداشت سازگاری متنی دارد (`modelText`، `yearFrom`، `yearTo`).
- کدهای OEM در `Product.oemCodes` ذخیره می‌شوند و در جست‌وجوی متنی شرکت دارند.
- VIN فقط برای بررسی کارشناس ثبت می‌شود و **هیچ استنتاج خودکاری از آن انجام نمی‌شود.**

این ساختار برای فروش موجودی و تأمین سفارشی کافی است و تا وقتی دادهٔ فنی معتبر با مجوز استفاده در دسترس نباشد، تغییر نمی‌کند.

## ۲. پیش‌شرط

1. **منبع داده با مجوز:** کاتالوگ فنی (مدل، نسخه، موتور، شمارهٔ قطعه، جایگزینی) از تأمین‌کنندهٔ داده با قرارداد و مجوز استفاده. دادهٔ استخراج‌شده از سایت‌های دیگر یا ساختگی وارد نمی‌شود.
2. **مالکیت و منشأ هر رکورد:** هر رابطهٔ سازگاری منبع، تاریخ و سطح اطمینان دارد تا رابط بتواند «تأییدشده» را از «محتمل» جدا کند (هم‌راستا با وضعیت سازگاری در پیش‌فاکتور).

## ۳. مدل دادهٔ پیشنهادی

```prisma
/// مدل خودرو در یک برند (مثلاً «۲۰۶»، «تیگو ۷»).
model VehicleModel {
  id             String   @id @default(uuid(7)) @db.Uuid
  vehicleBrandId String   @db.Uuid
  code           String   @db.VarChar(40)          // کد پایدار داخلی
  nameFa         String   @db.VarChar(120)
  nameEn         String?  @db.VarChar(120)
  sourceId       String   @db.Uuid                 // DataSource
  @@unique([vehicleBrandId, code])
}

/// نسخهٔ مشخص: سال تولید، موتور، گیربکس، بدنه و بازار.
model VehicleVariant {
  id            String  @id @default(uuid(7)) @db.Uuid
  vehicleModelId String @db.Uuid
  yearFrom      Int
  yearTo        Int?
  engineCode    String? @db.VarChar(40)
  fuel          String? @db.VarChar(20)
  transmission  String? @db.VarChar(20)
  body          String? @db.VarChar(30)
  market        String? @db.VarChar(10)            // مثلاً IR، GCC
  sourceId      String  @db.Uuid
  @@index([vehicleModelId, yearFrom])
}

/// شمارهٔ قطعهٔ مرجع (OEM یا سازنده) و جایگزینی‌ها.
model PartReference {
  id                 String  @id @default(uuid(7)) @db.Uuid
  number             String  @db.VarChar(64)       // به‌صورت نرمال‌شده ذخیره می‌شود
  numberDisplay      String  @db.VarChar(64)
  manufacturerBrandId String? @db.Uuid
  kind               String  @db.VarChar(20)       // OEM | AFTERMARKET | SUPERSEDED
  supersededById     String? @db.Uuid              // زنجیرهٔ جایگزینی
  sourceId           String  @db.Uuid
  @@unique([manufacturerBrandId, number])
}

/// سازگاری قطعهٔ مرجع با نسخهٔ خودرو.
model Fitment {
  id              String  @id @default(uuid(7)) @db.Uuid
  partReferenceId String  @db.Uuid
  vehicleVariantId String @db.Uuid
  position        String? @db.VarChar(40)         // جلو/عقب، چپ/راست
  confidence      String  @db.VarChar(20)          // CONFIRMED | LIKELY
  note            String? @db.VarChar(300)
  sourceId        String  @db.Uuid
  verifiedAt      DateTime?
  @@unique([partReferenceId, vehicleVariantId, position])
}

/// ارتباط محصول فروشگاه با شماره‌های مرجع (یک محصول ← چند شماره).
model ProductPartReference {
  productId       String @db.Uuid
  partReferenceId String @db.Uuid
  @@id([productId, partReferenceId])
}

/// منبع و مجوز داده.
model DataSource {
  id        String   @id @default(uuid(7)) @db.Uuid
  name      String   @db.VarChar(120)
  license   String   @db.VarChar(300)
  importedAt DateTime
}
```

- **مهاجرت از نسخهٔ اول:** `ProductFitment` متنی می‌ماند و به‌عنوان «یادداشت کارشناس» نمایش داده می‌شود. تبدیل خودکار متن آزاد به `Fitment` انجام نمی‌شود. فقط تطبیق دستی و تأییدشده یا دادهٔ منبع معتبر وارد جدول جدید می‌شود.
- **جست‌وجو:** شمارهٔ مرجع نرمال‌شده (حذف فاصله، خط تیره و صفرهای بی‌معنا طبق قاعدهٔ سازنده) در ایندکس جداگانه. جست‌وجوی کد قطعه، محصول‌های متصل و جایگزین‌ها را هم برمی‌گرداند. نیاز به موتور جست‌وجوی مستقل فقط وقتی بررسی می‌شود که حجم داده واقعاً آن را لازم کند.
- **رابط:** انتخابگر برند ← مدل ← سال/موتور، فقط وقتی دادهٔ واقعی وجود دارد. در غیر این صورت همان فیلتر برند و مسیر «درخواست تأمین» می‌ماند.

## ۴. VIN

- interface پیشنهادی (پورت):

```ts
export interface VinDecoder {
  readonly code: string;
  /** Returns only what the licensed source states; never guesses compatibility. */
  decode(vin: string): Promise<{ status: 'DECODED' | 'UNKNOWN'; make?: string; model?: string; year?: number; engineCode?: string; raw: unknown }>;
}
```

- نتیجهٔ رمزگشایی فقط **پیشنهاد** نسخهٔ خودرو برای کارشناس است. سازگاری قطعه از VIN استنتاج نمی‌شود، مگر اینکه منبع معتبر صریحاً آن را بگوید.

## ۵. اتصال‌های بعدی و interfaceهای آماده

| قابلیت | interface فعلی یا پیشنهادی | نکته |
| --- | --- | --- |
| درگاه پرداخت واقعی | `PaymentProvider` در `packages/domain` (create، verify، inquire، refund) | adapter جدید در `apps/api/src/modules/payments`. شبیه‌ساز نمونهٔ کامل قرارداد است و تأیید سرور به سرور اجباری است |
| پیامک | `SmsProvider` در `apps/api/src/integrations/sms` | خطای ارسال ثبت و تلاش دوباره می‌شود، بدون rollback سفارش |
| شرکت حمل | `CarrierAdapter` (پیشنهادی): `quote(destination, parcel)`، `createShipment`، `track(code)` | تا آن زمان هزینهٔ ارسال از «روش‌های ارسال» و رهگیری با الگوی لینک |
| نرخ ارز خودکار | `ExchangeRateSource` (پیشنهادی): `latest(): { irrPerAed, at, source }` | نرخ همچنان append-only و با تأیید انسانی منتشر می‌شود |
| چند انبار | `Warehouse` و `InventoryBalance` از ابتدا بر اساس انبار هستند | منطق انتخاب انبار و انتقال بین انبارها لازم است |
| ارسال چندمرحله‌ای | `Shipment` چندتایی برای هر سفارش در مدل وجود دارد | قواعد تقسیم و اعلان |
| حسابداری | خروجی دوره‌ای (پیشنهادی) از پرداخت، استرداد و فاکتور | بدون ثبت دستی در DB |
| بیعانه/چند پرداخت | جدول `PaymentAttempt` و `PaymentSettlement` پایه است | نیازمند تصمیم مالک، قرارداد درگاه و قواعد مالیات |
| دریافت واقعی درهم | — | فقط با سرویس مناسب و تأیید مالک؛ فعلاً پرداخت فقط ریالی است |

## ۶. اصول

- هیچ قابلیت این فهرست پیش از داشتن دادهٔ واقعی، قرارداد و آزمون، در رابط فعال نمی‌شود.
- هر اتصال جدید adapter آزمایشی و قرارداد مستند دارد، در production جایگزین آزمایشی رد می‌شود، و پیش از فعال‌سازی آزمون پذیرش خودش را می‌گیرد.
