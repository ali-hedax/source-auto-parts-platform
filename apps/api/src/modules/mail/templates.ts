/**
 * E-mail bodies (Persian, right-to-left). Table layout with inline styles so common mail
 * clients (Gmail, Outlook, phone apps) render it; readable with images blocked.
 * Every value that comes from a person is HTML-escaped. Nothing secret is ever included:
 * no password, no authenticator code, key or QR, no recovery codes.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const faDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] as string);

/** "۲۴ مهر ۱۴۰۵، ساعت ۱۴:۳۰ (به وقت تهران)" */
export function formatTehranDateFa(date: Date): string {
  const day = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tehran' }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Tehran' }).format(date);
  return `${day}، ساعت ${faDigits(time)} (به وقت تهران)`;
}

/** Real panel features a role can use, in plain words (only features that exist and are active). */
const FEATURES: ReadonlyArray<readonly [permission: string, text: string]> = [
  ['products.write', 'ثبت و ویرایش کالا، عکس و دسته‌بندی'],
  ['imports.run', 'ورود فهرست کالا، قیمت و موجودی با فایل Excel'],
  ['prices.write', 'تعیین و تغییر قیمت کالاها'],
  ['inventory.adjust', 'ثبت و اصلاح موجودی انبار'],
  ['quotes.write', 'بررسی درخواست‌های تأمین و صدور پیش‌فاکتور'],
  ['conversations.write', 'گفت‌وگو با مشتری'],
  ['orders.fulfil', 'پیگیری و ارسال سفارش‌ها'],
  ['reports.read', 'دیدن گزارش‌ها'],
  ['users.manage', 'دعوت و مدیریت کارکنان'],
];

export function featuresFor(permissions: readonly string[]): string[] {
  const has = new Set(permissions);
  return FEATURES.filter(([p]) => has.has(p)).map(([, text]) => text);
}

export interface InvitationMailInput {
  baseUrl: string;
  fullName: string;
  roleNames: string[];
  requiresMfa: boolean;
  features: string[];
  acceptUrl: string;
  expiresAt: Date;
}

const BRAND = { carbon: '#1A202C', action: '#2467A9', steel: '#4A5568', line: '#E2E8F0', surface: '#F7FAFC' };
const FONT = "Tahoma, 'Segoe UI', Arial, sans-serif";

function layout(baseUrl: string, title: string, bodyHtml: string): string {
  const logo = `${baseUrl}/brand/source/logo-dark.png`;
  return `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.surface};" dir="rtl">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.surface};" dir="rtl">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid ${BRAND.line};border-radius:8px;" dir="rtl">
<tr><td style="background:${BRAND.carbon};padding:18px 24px;border-radius:8px 8px 0 0;" align="right">
<img src="${esc(logo)}" width="150" alt="Source by HEDAX" style="display:block;border:0;height:auto;max-width:150px;color:#ffffff;font-family:${FONT};font-size:18px;font-weight:bold;">
</td></tr>
<tr><td style="padding:24px;font-family:${FONT};font-size:15px;line-height:1.9;color:${BRAND.carbon};text-align:right;" dir="rtl">
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${BRAND.line};font-family:${FONT};font-size:12px;line-height:1.8;color:${BRAND.steel};text-align:right;" dir="rtl">
Source by HEDAX — <a href="${esc(baseUrl)}/fa" style="color:${BRAND.steel};">${esc(baseUrl.replace(/^https?:\/\//, ''))}</a><br>
این پیام خودکار است. Source هرگز گذرواژه، کد ورود یا کد برنامهٔ احراز هویت شما را با ایمیل نمی‌خواهد.
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export function invitationMail(input: InvitationMailInput): { subject: string; html: string; text: string } {
  const subject = 'دعوت به پنل مدیریت Source by HEDAX';
  const loginUrl = `${input.baseUrl}/fa/staff/login`;
  const roles = input.roleNames.join('، ');
  const expires = formatTehranDateFa(input.expiresAt);
  const steps = [
    'روی دکمهٔ «فعال‌سازی حساب» بزنید، نام خود را بنویسید و یک گذرواژهٔ تازه (دست‌کم ۱۲ نویسه) انتخاب کنید.',
    `از صفحهٔ ورود کارکنان، با همین ایمیل و گذرواژه وارد پنل شوید.`,
    ...(input.requiresMfa
      ? ['نقش شما تأیید دومرحله‌ای دارد: پیش از ورود اول، برنامهٔ Google Authenticator یا Microsoft Authenticator را روی گوشی نصب کنید. در اولین ورود، پنل یک «کلید» نشان می‌دهد؛ آن را در برنامه وارد کنید و کد ۶ رقمی برنامه را در پنل بنویسید. کدهای بازیابی را که پنل نشان می‌دهد جای امنی یادداشت کنید.']
      : []),
  ];
  const html = layout(input.baseUrl, subject, `
<p style="margin:0 0 12px;font-size:18px;font-weight:bold;">سلام ${esc(input.fullName)}،</p>
<p style="margin:0 0 12px;">شما به پنل مدیریت <strong>Source by HEDAX</strong> (فروش و تأمین قطعات خودرو) دعوت شده‌اید.</p>
<p style="margin:0 0 16px;">نقش شما: <strong>${esc(roles)}</strong></p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr><td style="background:${BRAND.action};border-radius:6px;" align="center">
<a href="${esc(input.acceptUrl)}" style="display:inline-block;padding:12px 28px;font-family:${FONT};font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">فعال‌سازی حساب</a>
</td></tr></table>
<p style="margin:0 0 16px;font-size:13px;color:${BRAND.steel};">این لینک فقط برای همین ایمیل، فقط یک‌بار و تا ${esc(expires)} معتبر است. اگر دکمه کار نکرد، این نشانی را در مرورگر باز کنید:<br><span dir="ltr" style="word-break:break-all;"><a href="${esc(input.acceptUrl)}" style="color:${BRAND.action};">${esc(input.acceptUrl)}</a></span></p>
<p style="margin:0 0 8px;font-weight:bold;">راهنمای شروع</p>
<ol style="margin:0 0 16px;padding:0 20px 0 0;">${steps.map((s) => `<li style="margin:0 0 6px;">${esc(s)}</li>`).join('')}</ol>
<p style="margin:0 0 16px;">ورود کارکنان: <span dir="ltr"><a href="${esc(loginUrl)}" style="color:${BRAND.action};">${esc(loginUrl)}</a></span></p>
${input.features.length ? `<p style="margin:0 0 8px;font-weight:bold;">کارهایی که با این نقش در پنل انجام می‌دهید</p>
<ul style="margin:0 0 16px;padding:0 20px 0 0;">${input.features.map((f) => `<li style="margin:0 0 4px;">${esc(f)}</li>`).join('')}</ul>` : ''}
<p style="margin:0;font-size:13px;color:${BRAND.steel};">اگر انتظار این دعوت را نداشتید، این ایمیل را نادیده بگیرید؛ بدون فعال‌سازی هیچ حسابی ساخته نمی‌شود.</p>`);
  const text = [
    `سلام ${input.fullName}،`,
    '',
    'شما به پنل مدیریت Source by HEDAX (فروش و تأمین قطعات خودرو) دعوت شده‌اید.',
    `نقش شما: ${roles}`,
    '',
    'فعال‌سازی حساب:',
    input.acceptUrl,
    `این لینک فقط برای همین ایمیل، فقط یک‌بار و تا ${expires} معتبر است.`,
    '',
    'راهنمای شروع:',
    ...steps.map((s, i) => `${faDigits(String(i + 1))}. ${s}`),
    '',
    `ورود کارکنان: ${loginUrl}`,
    ...(input.features.length ? ['', 'کارهایی که با این نقش در پنل انجام می‌دهید:', ...input.features.map((f) => `- ${f}`)] : []),
    '',
    'اگر انتظار این دعوت را نداشتید، این ایمیل را نادیده بگیرید؛ بدون فعال‌سازی هیچ حسابی ساخته نمی‌شود.',
    'Source هرگز گذرواژه، کد ورود یا کد برنامهٔ احراز هویت شما را با ایمیل نمی‌خواهد.',
  ].join('\n');
  return { subject, html, text };
}

export function testMail(baseUrl: string, sentAt: Date): { subject: string; html: string; text: string } {
  const subject = 'ایمیل آزمایشی Source by HEDAX';
  const when = formatTehranDateFa(sentAt);
  const html = layout(baseUrl, subject, `
<p style="margin:0 0 12px;font-size:18px;font-weight:bold;">ایمیل آزمایشی</p>
<p style="margin:0 0 12px;">این پیام برای بررسی اتصال ارسال ایمیل سایت Source by HEDAX فرستاده شده است.</p>
<p style="margin:0;color:${BRAND.steel};font-size:13px;">زمان ثبت ارسال: ${esc(when)}</p>`);
  const text = ['ایمیل آزمایشی', '', 'این پیام برای بررسی اتصال ارسال ایمیل سایت Source by HEDAX فرستاده شده است.', `زمان ثبت ارسال: ${when}`].join('\n');
  return { subject, html, text };
}
