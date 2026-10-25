"""
Builds iran-market.v1.json — the reviewed Iran-market vehicle list for the home-page vehicle finder.

Research checked on 2026-10-25 (1405/08/03). Rules (owner, 2026-10-25):
  * every record cites where it comes from (URL, publisher, market, check date, official/secondary);
  * the original make is never mixed with the group that made or supplied the vehicle in Iran;
  * model years are kept in their own calendar and are imported only from official sources —
    secondary years are listed as candidates in NOTES, never imported;
  * no guesses: a make no cited source states is left empty; a record whose Iran-market presence or
    identity is not confirmed is marked needs_review (reported, not imported).

Run:  python build-iran-market.py      (writes iran-market.v1.json next to this file)
"""
import json
import os

CHECKED = '2026-10-25'
SRC = {}


def source(key, url, title, publisher, kind):
    SRC[key] = {'url': url, 'title': title, 'publisher': publisher, 'kind': kind, 'market': 'IR', 'checkedOn': CHECKED}
    return key


def ref(key, claim, page=None):
    r = {'ref': key, 'claim': claim}
    if page:
        r['page'] = page[:60]
    return r


# ---------------------------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------------------------
IKCO_MENU = source('ikco-products', 'https://www.ikco.ir/fa/ProductList.aspx',
                   'ایران‌خودرو — فهرست محصولات (منوی محصولات به تفکیک ایران‌خودرو، ایکاپ، پژو، رنو، سوزوکی، هایما، DFM و خودروهای برقی)',
                   'ایران‌خودرو (وب‌سایت رسمی)', 'official')


def ikco_product(pid, name):
    return source(f'ikco-product-{pid}', f'https://www.ikco.ir/fa/Product.aspx?ID={pid}&Section=1', f'ایران‌خودرو — صفحهٔ محصول {name}', 'ایران‌خودرو (وب‌سایت رسمی)', 'official')


SAIPA_MANUALS = source('saipayadak-owner-manuals', 'https://www.saipayadak.org/warranty-and-maintenance/customer-guide/',
                       'سایپا یدک — راهنمای مالک خودرو (فهرست دفترچه‌های راهنمای مشتری و ضوابط گارانتی، ۷۵ ردیف)',
                       'سایپا یدک (خدمات پس از فروش گروه سایپا)', 'official')
TOYOTA_IR = source('toyota-iran-products', 'https://www.irtoya.com/',
                   'نمایندگی مرکزی تویوتا — «محصولات تویوتا در ایران»', 'نمایندگی رسمی تویوتا در ایران (irtoya.com → mahansanatpars.com)', 'official')
HYUNDAI_IR = source('hyundai-kerman-models', 'https://ktl-co.com/',
                    'هیوندای کرمان موتور — «مدل‌ها»', 'کرمان موتور (پیوند «Hyundai» در kermanmotor.com)', 'official')
CODAL_IKCO_1396 = source('codal-ikco-monthly-1396-12', 'https://codal.ir/Reports/Decision.aspx?LetterSerial=aUXMYVWwPHoZWb846YmPYw%3d%3d&rt=0&let=58&ct=0',
                         'کدال — ایران خودرو، گزارش فعالیت ماهانه منتهی به ۱۳۹۶/۱۲/۲۹ (تولید و فروش به تفکیک گروه محصول)', 'سامانهٔ کدال (سازمان بورس)', 'official')
WIKI_PARS = source('wiki-fa-pars-khodro', 'https://fa.wikipedia.org/wiki/%D9%BE%D8%A7%D8%B1%D8%B3_%D8%AE%D9%88%D8%AF%D8%B1%D9%88',
                   'ویکی‌پدیا — پارس خودرو (فهرست همهٔ محصولات و خودروهای وارداتی)', 'ویکی‌پدیای فارسی', 'secondary')
WIKI_SAIPA = source('wiki-fa-saipa', 'https://fa.wikipedia.org/wiki/%D8%B3%D8%A7%DB%8C%D9%BE%D8%A7', 'ویکی‌پدیا — سایپا', 'ویکی‌پدیای فارسی', 'secondary')
WIKI_BARDO = source('wiki-fa-bardo', 'https://fa.wikipedia.org/wiki/%D8%A8%D8%A7%D8%B1%D8%AF%D9%88_(%D8%AE%D9%88%D8%AF%D8%B1%D9%88)', 'ویکی‌پدیا — باردو (پیکان وانت)', 'ویکی‌پدیای فارسی', 'secondary')
WIKI_IKCO = source('wiki-en-iran-khodro', 'https://en.wikipedia.org/wiki/Iran_Khodro', 'Wikipedia — Iran Khodro (Products and relationships)', 'English Wikipedia', 'secondary')
WIKI_PAYKAN = source('wiki-en-paykan', 'https://en.wikipedia.org/wiki/Paykan', 'Wikipedia — Paykan', 'English Wikipedia', 'secondary')

IR = {'fa': 'ایران‌خودرو', 'en': 'Iran Khodro'}
PEUGEOT = {'fa': 'پژو', 'en': 'Peugeot'}
RENAULT = {'fa': 'رنو', 'en': 'Renault'}
HAIMA = {'fa': 'هایما', 'en': 'Haima'}
DONGFENG = {'fa': 'دانگ‌فنگ', 'en': 'Dongfeng'}
SAIPA = {'fa': 'سایپا', 'en': 'Saipa'}
NISSAN = {'fa': 'نیسان', 'en': 'Nissan'}
BRILLIANCE = {'fa': 'برلیانس', 'en': 'Brilliance'}
CHANGAN = {'fa': 'چانگان', 'en': 'Changan'}
TOYOTA = {'fa': 'تویوتا', 'en': 'Toyota'}
LEXUS = {'fa': 'لکسوس', 'en': 'Lexus'}
HYUNDAI = {'fa': 'هیوندای', 'en': 'Hyundai'}
SUP_IKCO = {'fa': 'ایران‌خودرو', 'en': 'Iran Khodro'}
SUP_KMC = {'fa': 'کرمان موتور', 'en': 'Kerman Motor'}
SUP_TOYOTA = {'fa': 'نمایندگی رسمی تویوتا در ایران', 'en': 'Toyota’s official representative in Iran'}

VEHICLES = []
NOTES = []


def model(key, fa, en, srcs, status='official', supply=None, supplier=None, years=None, aliases=None, note=None):
    m = {'key': key, 'name': {'fa': fa, 'en': en}, 'aliases': aliases or [], 'supply': supply, 'supplier': supplier, 'years': years, 'status': status, 'sources': srcs}
    if note:
        m['note'] = note
    return m


def vehicle(key, groups, fa, en, make, srcs, models=(), status='official', existing=None, aliases=None, note=None, equivalences=()):
    v = {'key': key, 'groups': groups, 'name': {'fa': fa, 'en': en}, 'aliases': aliases or [], 'make': make, 'status': status, 'sources': srcs, 'models': list(models), 'equivalences': list(equivalences)}
    if existing:
        v['existing'] = {'slug': existing}
    if note:
        v['note'] = note
    VEHICLES.append(v)


def year(y, srcref):
    return {'from': y, 'to': y, 'calendar': 'gregorian', 'source': srcref}


# ---------------------------------------------------------------------------------------------
# ایران‌خودرو (IKCO) — official product menu; make from the menu section
# ---------------------------------------------------------------------------------------------
listed = 'در فهرست رسمی محصولات ایران‌خودرو، بخش {}'
p = ikco_product
vehicle('ikco.samand', ['IKCO'], 'سمند', 'Samand', IR, [ref(IKCO_MENU, listed.format('ایران‌خودرو'))], existing='samand', models=[
    model('ikco.samand.lx', 'سمند LX', 'Samand LX', [ref(p(130, 'سمند LX'), 'محصول «سمند LX»')], supply='domestic', supplier=SUP_IKCO),
    model('ikco.samand.se', 'سمند SE', 'Samand SE', [ref(p(159, 'سمند SE'), 'محصول «سمند SE»')], supply='domestic', supplier=SUP_IKCO)])
vehicle('ikco.soren', ['IKCO'], 'سورن', 'Soren', IR, [ref(IKCO_MENU, listed.format('ایران‌خودرو'))], models=[
    model('ikco.soren.base', 'سورن', 'Soren', [ref(p(153, 'سورن'), 'محصول «سورن»')], supply='domestic', supplier=SUP_IKCO),
    model('ikco.soren.plus', 'سورن پلاس', 'Soren Plus', [ref(p(332, 'سورن پلاس'), 'محصول «سورن پلاس»')], supply='domestic', supplier=SUP_IKCO)])
vehicle('ikco.dena', ['IKCO'], 'دنا', 'Dena', IR, [ref(p(170, 'دنا'), 'محصول «دنا»'), ref(IKCO_MENU, listed.format('ایران‌خودرو'))], existing='dena')
vehicle('ikco.dena-plus', ['IKCO'], 'دنا پلاس', 'Dena Plus', IR, [ref(p(266, 'دنا پلاس'), 'محصول «دنا پلاس»'), ref(IKCO_MENU, listed.format('ایران‌خودرو'))], existing='dena-plus')
vehicle('ikco.rana', ['IKCO'], 'رانا', 'Runna', IR, [ref(IKCO_MENU, listed.format('ایران‌خودرو'))], existing='rana', aliases=['Rana'], models=[
    model('ikco.rana.base', 'رانا', 'Runna', [ref(p(183, 'رانا'), 'محصول «رانا»')], supply='domestic', supplier=SUP_IKCO),
    model('ikco.rana.plus', 'رانا پلاس', 'Runna Plus', [ref(p(324, 'رانا پلاس'), 'محصول «رانا پلاس»')], supply='domestic', supplier=SUP_IKCO)])
vehicle('ikco.tara', ['IKCO'], 'تارا', 'Tara', IR, [ref(p(321, 'تارا'), 'محصول «تارا»'), ref(IKCO_MENU, listed.format('ایران‌خودرو'))], existing='tara')
vehicle('ikco.rira', ['IKCO'], 'ری‌را', 'Rira', IR, [ref(p(369, 'ری‌را'), 'محصول «ری‌را»'), ref(IKCO_MENU, listed.format('ایران‌خودرو'))], existing='rira')
vehicle('ikco.arisan', ['IKCO'], 'آریسان', 'Arisan', IR, [ref(IKCO_MENU, listed.format('ایران‌خودرو'))], existing='arisan', aliases=['وانت آریسان'], models=[
    model('ikco.arisan.2', 'آریسان ۲', 'Arisan 2', [ref(p(233, 'وانت آریسان 2'), 'محصول «وانت آریسان 2»')], supply='domestic', supplier=SUP_IKCO)])
vehicle('ikco.paykan-pickup', ['IKCO'], 'پیکان وانت', 'Paykan Pickup', IR, [ref(WIKI_BARDO, 'پیکان وانت (باردو) محصول ایران‌خودرو'), ref(WIKI_IKCO, 'Bardo pick-up, pick-up version of Paykan, produced until 2015')],
        status='secondary', existing='paykan-pickup', aliases=['باردو', 'Bardo'])
vehicle('ikco.paykan', ['IKCO'], 'پیکان', 'Paykan', IR, [ref(WIKI_PAYKAN, 'Paykan saloon produced by Iran Khodro'), ref(WIKI_IKCO, 'Paykan saloon production discontinued in 2005')], status='secondary')
NOTES.append('پیکان و پیکان وانت: سال‌های تولید فقط در منبع ثانویه (ویکی‌پدیا: سواری تا ۲۰۰۵، وانت تا ۲۰۱۵ میلادی) آمده است؛ وارد نشد.')

vehicle('ikco.peugeot-206', ['IKCO'], 'پژو ۲۰۶', 'Peugeot 206', PEUGEOT, [ref(IKCO_MENU, listed.format('پژو/ایکاپ'))], aliases=['206'], models=[
    model('ikco.peugeot-206.hatchback', 'پژو ۲۰۶ (هاچ‌بک)', '206 hatchback', [ref(p(4, 'پژو 206'), 'محصول «پژو 206»')], supply='assembled', supplier=SUP_IKCO),
    model('ikco.peugeot-206.sd', 'پژو ۲۰۶ SD (صندوق‌دار)', '206 SD (sedan)', [ref(p(11, 'پژو 206 SD'), 'محصول «پژو 206 SD»')], supply='assembled', supplier=SUP_IKCO, aliases=['206 صندوقدار', '206sd'])],
        note='تیپ‌ها (مثل تیپ ۲، تیپ ۵، V8) در منبع رسمی دیده نشد؛ ثبت نشدند.')
vehicle('ikco.peugeot-207i', ['IKCO'], 'پژو ۲۰۷i', 'Peugeot 207i', PEUGEOT, [ref(IKCO_MENU, listed.format('پژو/ایکاپ'))], aliases=['207'], models=[
    model('ikco.peugeot-207i.hatchback', 'پژو ۲۰۷i (هاچ‌بک)', '207i hatchback', [ref(p(72, 'پژو 207i'), 'محصول «پژو 207i»')], supply='assembled', supplier=SUP_IKCO),
    model('ikco.peugeot-207i.sedan', 'پژو ۲۰۷i صندوق‌دار', '207i sedan', [ref(p(295, 'پژو 207i صندوقدار'), 'محصول «پژو 207i صندوقدار»')], supply='assembled', supplier=SUP_IKCO)])
vehicle('ikco.peugeot-pars', ['IKCO'], 'پژو پارس', 'Peugeot Pars', PEUGEOT, [ref(p(22, 'پژو پارس'), 'محصول «پژو پارس»'), ref(IKCO_MENU, listed.format('پژو/ایکاپ'))], aliases=['پارس'])
vehicle('ikco.peugeot-405', ['IKCO'], 'پژو ۴۰۵', 'Peugeot 405', PEUGEOT, [ref(p(18, 'پژو 405'), 'محصول «پژو 405»'), ref(IKCO_MENU, listed.format('پژو/ایکاپ'))], aliases=['405'])
vehicle('ikco.peugeot-2008', ['IKCO'], 'پژو ۲۰۰۸', 'Peugeot 2008', PEUGEOT,
        [ref(p(276, 'پژو 2008'), 'محصول «پژو 2008»'), ref(IKCO_MENU, listed.format('پژو/ایکاپ')), ref(CODAL_IKCO_1396, 'ردیف «پژو 2008» با تعداد تولید در سال ۱۳۹۶')], aliases=['2008'],
        equivalences=[{'key': 'eq.peugeot-2008', 'model': None, 'legacy': {'vehicleSlug': 'peugeot', 'modelSlug': '2008'}, 'status': 'confirmed',
                       'note': 'ردیف قدیمی «پژو» با مدل «2008» همان پژو ۲۰۰۸ است؛ پیوند قطعات قبلی حفظ می‌شود.'}])
vehicle('ikco.peugeot-508', ['IKCO'], 'پژو ۵۰۸', 'Peugeot 508', PEUGEOT, [ref(p(279, 'پژو 508'), 'محصول «پژو 508»'), ref(IKCO_MENU, listed.format('پژو/ایکاپ'))], aliases=['508'])
vehicle('ikco.peugeot-301', ['IKCO'], 'پژو ۳۰۱', 'Peugeot 301', PEUGEOT, [ref(IKCO_MENU, listed.format('پژو/ایکاپ'))], aliases=['301'], models=[
    model('ikco.peugeot-301.imported', 'پژو ۳۰۱ وارداتی', '301 (imported)', [ref(p(281, 'پژو 301 وارداتی'), 'محصول «پژو 301 وارداتی»')], supply='imported', supplier=SUP_IKCO)])
vehicle('ikco.renault-tondar-90', ['IKCO', 'SAIPA'], 'رنو تندر ۹۰', 'Renault Tondar 90', RENAULT,
        [ref(p(144, 'تندر 90'), 'محصول «تندر 90» در بخش رنو'), ref(SAIPA_MANUALS, 'دفترچهٔ «تندر 90» در فهرست سایپا یدک', 'راهنمای مشتری و ضوابط گارانتی خودروی تندر 90'), ref(WIKI_PARS, 'رنو تندر ۹۰ در محصولات پارس خودرو')],
        aliases=['تندر 90', 'L90', 'ال ۹۰', 'لوگان', 'Logan', 'پارس تندر'])
vehicle('ikco.renault-tondar-pickup', ['IKCO'], 'رنو تندر پیکاپ', 'Renault Tondar Pickup', RENAULT, [ref(p(242, 'تندر پیکاپ'), 'محصول «تندر پيكاپ» در بخش رنو')], aliases=['تندر پیکاپ'])
vehicle('ikco.renault-captur', ['IKCO'], 'رنو کپچر', 'Renault Captur', RENAULT, [ref(p(239, 'کپچر'), 'محصول «کپچر» در بخش رنو')], aliases=['کپچر', 'Captur'])
vehicle('ikco.suzuki-grand-vitara', ['IKCO'], 'سوزوکی گرند ویتارا', 'Suzuki Grand Vitara', {'fa': 'سوزوکی', 'en': 'Suzuki'},
        [ref(p(165, 'سوزوکی گرندویتارا'), 'محصول «سوزوکی گرندویتارا» در بخش سوزوکی'), ref(CODAL_IKCO_1396, 'ردیف «سوزوکی» با تعداد تولید در سال ۱۳۹۶')], aliases=['گرندویتارا', 'ویتارا'],
        equivalences=[{'key': 'eq.suzuki-vitara', 'model': None, 'legacy': {'vehicleSlug': 'suzuki', 'modelSlug': 'model-mv95iiyj'}, 'status': 'uncertain',
                       'note': 'ردیف قدیمی «سوزوکی / ویتارا کلیه مدل ها» شاید همهٔ نسل‌های ویتارا باشد، نه فقط گرند ویتارای ایران‌خودرو؛ نیازمند تأیید.'}])
vehicle('ikco.haima-s7', ['IKCO'], 'هایما S7', 'Haima S7', HAIMA, [ref(IKCO_MENU, listed.format('هایما'))], models=[
    model('ikco.haima-s7.base', 'هایما S7', 'S7', [ref(p(246, 'هايما S7'), 'محصول «هايما S7»')]),
    model('ikco.haima-s7.plus', 'هایما S7 پلاس', 'S7 Plus', [ref(p(335, 'هايما S7 پلاس'), 'محصول «هايما S7 پلاس»')]),
    model('ikco.haima-s7.pro', 'هایما S7 پرو', 'S7 Pro', [ref(p(373, 'هايما S7 پرو'), 'محصول «هايما S7 پرو»')])])
vehicle('ikco.haima-s5', ['IKCO'], 'هایما S5', 'Haima S5', HAIMA, [ref(IKCO_MENU, listed.format('هایما'))], models=[
    model('ikco.haima-s5.base', 'هایما S5', 'S5', [ref(p(283, 'هایما S5'), 'محصول «هایما S5»')]),
    model('ikco.haima-s5.pro', 'هایما S5 پرو', 'S5 Pro', [ref(p(377, 'هايما S5 pro'), 'محصول «هايما S5 pro»')])])
vehicle('ikco.haima-8s', ['IKCO'], 'هایما 8S', 'Haima 8S', HAIMA, [ref(p(347, 'هايما 8S'), 'محصول «هايما 8S»')])
vehicle('ikco.haima-7x', ['IKCO'], 'هایما 7X', 'Haima 7X', HAIMA, [ref(p(354, 'هايما 7X'), 'محصول «هايما 7X»')])
vehicle('ikco.dongfeng-h30-cross', ['IKCO'], 'دانگ‌فنگ H30 کراس', 'Dongfeng H30 Cross', DONGFENG, [ref(p(252, 'H30 Cross'), 'محصول «H30 Cross» در بخش DFM')], aliases=['H30 Cross', 'اچ ۳۰ کراس'])
vehicle('ikco.dongfeng-s30', ['IKCO'], 'دانگ‌فنگ S30', 'Dongfeng S30', DONGFENG, [ref(p(311, 'S30'), 'محصول «S30» در بخش DFM')], aliases=['S30'])
vehicle('ikco.dongfeng-shine-max', ['IKCO'], 'دانگ‌فنگ شاین مکس', 'Dongfeng Shine Max', DONGFENG, [ref(p(358, 'شاین مکس'), 'محصول «شاين مكس» در بخش DFM')], aliases=['شاین مکس', 'Shine Max'])
vehicle('ikco.dongfeng-e70', ['IKCO'], 'دانگ‌فنگ E70', 'Dongfeng E70', DONGFENG, [ref(p(379, 'دانگ‌فنگ E70'), 'محصول «دانگ‌فنگ E70»')], aliases=['E70'])
vehicle('ikco.bestune-nat', ['IKCO'], 'بستیون NAT', 'Bestune NAT', {'fa': 'بستیون', 'en': 'Bestune'}, [ref(p(371, 'بستیون NAT'), 'محصول «بستيون NAT» در بخش خودروهای برقی')])
vehicle('ikco.luna-gre', ['IKCO'], 'لونا GRE', 'Luna GRE', None, [ref(p(367, 'لونا GRE'), 'محصول «لونا GRE» در بخش خودروهای برقی')], aliases=['لونا'],
        note='برند سازندهٔ لونا در منبع رسمی نیامده است.')

# ---------------------------------------------------------------------------------------------
# گروه سایپا (سایپا، پارس خودرو، زامیاد) — official after-sales owner-manual list
# ---------------------------------------------------------------------------------------------
def m(title):
    return ref(SAIPA_MANUALS, f'دفترچهٔ «{title}» در فهرست رسمی سایپا یدک', title)


def pars(claim):
    return ref(WIKI_PARS, claim)


vehicle('saipa.pride', ['SAIPA'], 'پراید', 'Pride', None, [m('خودروی پراید')], aliases=['Pride', 'صبا', 'نسیم'],
        note='سازندهٔ اصلی (کیا) در منبع‌های بررسی‌شده برای پراید ذکر نشد؛ برند خالی ماند.')
vehicle('saipa.151', ['SAIPA'], 'سایپا ۱۵۱', 'Saipa 151', SAIPA, [m('سایپا 151')], aliases=['وانت ۱۵۱', '151'], models=[
    model('saipa.151.euro4', 'سایپا ۱۵۱ (یورو ۴)', '151 (Euro 4)', [m('سایپا 151 نسخه کامل (یورو4)')]),
    model('saipa.151.euro5', 'سایپا ۱۵۱ (یورو ۵)', '151 (Euro 5)', [m('سایپا 151 نسخه کامل (یورو5)')]),
    model('saipa.151.upgraded', 'سایپا ۱۵۱ ارتقایافته', '151 (upgraded)', [m('سایپا 151 ارتقاء یافته')])])
vehicle('saipa.tiba', ['SAIPA'], 'تیبا', 'Tiba', SAIPA, [ref(WIKI_SAIPA, 'تیبا از خودروهای بومی سایپا')], models=[
    model('saipa.tiba.sedan', 'تیبا', 'Tiba', [m('خودروی تیبا (نسخه کامل)')]),
    model('saipa.tiba.2', 'تیبا ۲ (هاچ‌بک)', 'Tiba 2 (hatchback)', [m('خودروی تیبا 2 (نسخه کامل)')])])
vehicle('saipa.saina', ['SAIPA'], 'ساینا', 'Saina', SAIPA, [m('خودروی ساینا (کلیه مدل ها)'), ref(WIKI_SAIPA, 'ساینا از خودروهای بومی سایپا')], models=[
    model('saipa.saina.gx-cng', 'ساینا GX و GXL دوگانه‌سوز', 'Saina GX/GXL CNG', [m('خودروی ساینا GX و GXL CNG')])])
vehicle('saipa.quick', ['SAIPA'], 'کوییک', 'Quick', SAIPA, [m('خودروی کوئیک (212)'), ref(WIKI_SAIPA, 'کوئیک از خودروهای بومی سایپا')], aliases=['کوئیک', 'Quik'])
vehicle('saipa.shahin', ['SAIPA'], 'شاهین', 'Shahin', None, [m('خودروی شاهین دستی و CVT')], models=[
    model('saipa.shahin.manual', 'شاهین دنده‌ای', 'Shahin manual', [m('خودروی شاهین دستی و CVT')]),
    model('saipa.shahin.cvt', 'شاهین CVT', 'Shahin CVT', [m('خودروی شاهین دستی و CVT')]),
    model('saipa.shahin.plus', 'شاهین پلاس', 'Shahin Plus', [m('خودروی شاهین پلاس')])])
vehicle('saipa.atlas', ['SAIPA'], 'اطلس', 'Atlas', None, [m('خودروی اطلس')], models=[
    model('saipa.atlas.base', 'اطلس', 'Atlas', [m('خودروی اطلس')]),
    model('saipa.atlas.plus', 'اطلس پلاس (اتوماتیک)', 'Atlas Plus (automatic)', [m('خودروی اطلس پلاس (اتوماتیک)')])])
vehicle('saipa.sahand', ['SAIPA'], 'سهند', 'Sahand', SAIPA, [m('خودروی سهند بنزینی-اتوماتیک - CNG'), pars('سایپا سهند در محصولات پارس خودرو')])
vehicle('saipa.aria', ['SAIPA'], 'آریا', 'Aria', None, [m('خودروی آریا')])
vehicle('saipa.pars-nova', ['SAIPA'], 'پارس نوا', 'Pars Nova', None, [m('خودروی پارس نوا'), pars('پارس نوآ در محصولات پارس خودرو')], aliases=['پارس نوآ'])
vehicle('saipa.rio', ['SAIPA'], 'کیا ریو', 'Kia Rio', {'fa': 'کیا', 'en': 'Kia'}, [m('خودروی ریو'), ref(WIKI_SAIPA, 'ریو محصولی از کیا موتورز، تولید سایپا')], aliases=['ریو'])
vehicle('saipa.cerato', ['SAIPA'], 'سراتو', 'Cerato', None, [m('خودرو سراتو')])
vehicle('saipa.xantia', ['SAIPA'], 'زانتیا', 'Xantia', None, [m('خودروی زانتیا')])
vehicle('saipa.c5', ['SAIPA'], 'C5', 'C5', None, [m('خودروی C5')], models=[
    model('saipa.c5.first', 'C5', 'C5', [m('خودروی C5')]),
    model('saipa.c5.new', 'C5 جدید', 'New C5', [m('خودروی new c5')])])
vehicle('saipa.c3-xr', ['SAIPA'], 'C3 XR', 'C3 XR', None, [m('خودروی C3_XR')], aliases=['C3-XR'])
vehicle('saipa.renault-megane', ['SAIPA'], 'رنو مگان', 'Renault Megane', RENAULT, [m('خودروی مگان'), pars('رنو مگان در محصولات پارس خودرو')], aliases=['مگان'])
vehicle('saipa.renault-sandero', ['SAIPA'], 'رنو ساندرو', 'Renault Sandero', RENAULT, [m('خودرو ساندرو'), pars('رنو ساندرو و ساندرو استپ‌وی در محصولات پارس خودرو')], aliases=['ساندرو', 'استپ وی'])
vehicle('saipa.renault-koleos', ['SAIPA'], 'رنو کولئوس', 'Renault Koleos', RENAULT, [m('خودروی کلیوس'), pars('رنو کولئوس در خودروهای وارداتی پارس خودرو')], aliases=['کلیوس', 'کولئوس'])
vehicle('saipa.nissan-maxima', ['SAIPA'], 'نیسان ماکسیما', 'Nissan Maxima', NISSAN, [m('خودروی ماکسیما'), pars('نیسان ماکسیما در محصولات پارس خودرو')], aliases=['ماکسیما'])
vehicle('saipa.nissan-murano', ['SAIPA'], 'نیسان مورانو', 'Nissan Murano', NISSAN, [m('خودروی مورانو'), pars('نیسان مورانو در خودروهای وارداتی پارس خودرو')], aliases=['مورانو'], models=[
    model('saipa.nissan-murano.z51', 'مورانو Z51', 'Murano Z51', [m('خودروی مورانو z51')], supply='imported')])
vehicle('saipa.nissan-qashqai', ['SAIPA'], 'نیسان قشقایی', 'Nissan Qashqai', NISSAN, [m('خودروی قشقایی'), pars('نیسان قشقایی در محصولات پارس خودرو')], aliases=['قشقایی'])
vehicle('saipa.nissan-teana', ['SAIPA'], 'نیسان تیانا', 'Nissan Teana', NISSAN, [m('خودروی تیانا'), pars('نیسان تیانا در محصولات پارس خودرو')], aliases=['تیانا', 'تینا'])
vehicle('saipa.nissan-roniz', ['SAIPA'], 'نیسان رونیز', 'Nissan Roniz', NISSAN, [m('خودروی رونیز'), pars('نیسان رونیز در محصولات پارس خودرو')], aliases=['رونیز'])
vehicle('saipa.nissan-seranza', ['SAIPA'], 'نیسان سرانزا', 'Nissan Seranza', NISSAN, [m('خودروی سرانزا'), pars('نیسان سرانزا در محصولات پارس خودرو')], aliases=['سرانزا'])
vehicle('saipa.nissan-pickup', ['SAIPA'], 'نیسان پیکاپ', 'Nissan Pickup', NISSAN, [m('خودروی پیکاپ'), pars('نیسان پیکاپ در محصولات پارس خودرو')], aliases=['پیکاپ'])
vehicle('saipa.brilliance-h220-h230', ['SAIPA'], 'برلیانس H220 و H230', 'Brilliance H220/H230', BRILLIANCE, [m('خودروهای H220 ; H230'), pars('برلیانس اچ۲۲۰ و اچ۲۳۰ در محصولات پارس خودرو')], models=[
    model('saipa.brilliance-h220-h230.h220', 'H220', 'H220', [m('خودروهای H220 ; H230')]),
    model('saipa.brilliance-h220-h230.h230', 'H230', 'H230', [m('خودروهای H220 ; H230')])])
vehicle('saipa.brilliance-h320', ['SAIPA'], 'برلیانس H320', 'Brilliance H320', BRILLIANCE, [m('خودروهای H320'), pars('برلیانس اچ۳۲۰ در محصولات پارس خودرو')])
vehicle('saipa.brilliance-h330', ['SAIPA'], 'برلیانس H330', 'Brilliance H330', BRILLIANCE, [m('خودروی H330'), pars('برلیانس اچ۳۳۰ در محصولات پارس خودرو')])
vehicle('saipa.brilliance-cross', ['SAIPA'], 'برلیانس کراس', 'Brilliance Cross', BRILLIANCE, [m('خودروهای cross'), pars('برلیانس کراس در محصولات پارس خودرو')], aliases=['H320 کراس'])
vehicle('saipa.changan-cs35-plus', ['SAIPA'], 'چانگان CS35 پلاس', 'Changan CS35 Plus', CHANGAN, [m('خودروی چانگان CS35PLUS'), pars('چانگان سی‌اس۳۵ پلاس در محصولات پارس خودرو')], aliases=['CS35 پلاس', 'CS35PLUS'])
vehicle('saipa.changan-uni-k', ['SAIPA'], 'چانگان UNI-K', 'Changan UNI-K', CHANGAN, [m('خودرو چانگان UNI-K')], aliases=['یونی کی', 'UNI-K'])
vehicle('saipa.cs35', ['SAIPA'], 'CS35', 'CS35', None, [m('خودروی CS35')], note='برند در عنوان دفترچه نیامده است؛ نسبت با چانگان CS35 پلاس بررسی شود.')
vehicle('saipa.cs55-plus', ['SAIPA'], 'CS55 پلاس', 'CS55 Plus', None, [m('خودروی CS55PLUS')], aliases=['CS55PLUS'])
vehicle('saipa.eado', ['SAIPA'], 'ایدو', 'EADO', None, [m('خودروی EADO')], aliases=['EADO'], models=[
    model('saipa.eado.ev460', 'ایدو EV460', 'EADO EV460', [m('خودروی EADO EV460')])])
vehicle('saipa.hunter-plus', ['SAIPA'], 'هانتر پلاس', 'Hunter Plus', None, [m('خودرو هانتر پلاس')])
vehicle('saipa.roewe-erx5', ['SAIPA'], 'رووه eRX5', 'Roewe eRX5', {'fa': 'رووه', 'en': 'Roewe'}, [m('خودروی ROEWE eRX5'), pars('رووی ئی‌آرایکس۵ در خودروهای وارداتی پارس خودرو')], aliases=['ROEWE eRX5'])
vehicle('saipa.zotye-dl5', ['SAIPA'], 'زوتی DL5', 'Zotye DL5', {'fa': 'زوتی', 'en': 'Zotye'}, [m('خودروی DL5'), pars('زوتی دی‌ال۵ در خودروهای وارداتی پارس خودرو')], aliases=['DL5'])
vehicle('saipa.ario', ['SAIPA'], 'آریو', 'Ario', None, [m('خودروی آریو ( s300 )')], aliases=['S300'])
vehicle('saipa.korando', ['SAIPA'], 'کوراندو', 'Korando', None, [m('خودروی کوراندو')])
vehicle('saipa.cherman', ['SAIPA'], 'چیرمن', 'Cherman', None, [m('خودروی چیرمن')])
vehicle('saipa.ciena', ['SAIPA'], 'سی‌ینا', 'Ciena', None, [m('خودروی سی ینا')], aliases=['سی ینا'])
vehicle('saipa.v5', ['SAIPA'], 'V5', 'V5', None, [m('خودروی V5')])
vehicle('saipa.karvan', ['SAIPA'], 'کاروان', 'Karvan', None, [m('خودروی کاروان')])
vehicle('saipa.441p', ['SAIPA'], '441P', '441P', None, [m('خودروی 441P')], note='نام فایل دفترچه به CS55PLUS اشاره دارد؛ هم‌ارزی تأیید نشد.')
vehicle('saipa.421p', ['SAIPA'], '421P', '421P', None, [m('خودروی 421P')], note='نام فایل دفترچه به CS35PLUS اشاره دارد؛ هم‌ارزی تأیید نشد.')
vehicle('saipa.haise-h2l', ['SAIPA'], 'ون هایس H2L', 'Haise H2L van', None, [m('خودرو ون H2L HAISE'), pars('واردات هایس H2L از جینبی چین توسط پارس خودرو')], aliases=['H2L'])
vehicle('saipa.zamyad-pickup', ['SAIPA'], 'وانت زامیاد', 'Zamyad pickup', None, [m('وانت زامیاد')], aliases=['زامیاد', 'نیسان آبی', 'Z24'], models=[
    model('saipa.zamyad-pickup.diesel-euro3', 'دیزل یورو ۳', 'Diesel Euro 3', [m('وانت زامیاد دیزل EURO3')]),
    model('saipa.zamyad-pickup.diesel-euro5', 'دیزل یورو ۵', 'Diesel Euro 5', [m('زامیاد - وانت دیزل EUOR5')]),
    model('saipa.zamyad-pickup.euro5', 'یورو ۵ (تک‌سوز و دوگانه‌سوز)', 'Euro 5 (petrol and CNG)', [m('وانت زامیاد یورو 5 (تک سوز و دوگانه سوز)')]),
    model('saipa.zamyad-pickup.shooka', 'شوکا (لوکس)', 'Shooka', [m('وانت لوکس زامیاد شوکا')]),
    model('saipa.zamyad-pickup.dump', 'کمپرسی', 'Dump body', [m('کمپرسی وانت زامیاد')])])
vehicle('saipa.zamyad-ex', ['SAIPA'], 'کامیونت زامیاد EX', 'Zamyad EX light truck', None, [m('کامیونت زامیاد EX')])
vehicle('saipa.padra', ['SAIPA'], 'پادرا', 'Padra', None, [m('خودروی پادرا')], models=[
    model('saipa.padra.base', 'پادرا', 'Padra', [m('خودروی پادرا')]),
    model('saipa.padra.plus', 'پادرا پلاس', 'Padra Plus', [m('پادرا پلاس تک سوز و دوگانه سوز (یورو5)')])])
vehicle('saipa.karun', ['SAIPA'], 'وانت کارون', 'Karun pickup', None, [m('خودروی وانت کارون')], aliases=['کارون'])
vehicle('saipa.rich', ['SAIPA'], 'وانت ریچ', 'Rich pickup', None, [m('خودروی ریچ'), pars('تولید وانت ریچ در پارس خودرو (۱۳۹۲)')], aliases=['ریچ'])
NOTES.append('ویکی‌پدیای فارسی (پارس خودرو) سال‌های تولید را برای بسیاری از خودروهای پارس خودرو آورده است (مثلاً رنو تندر ۹۰ از ۱۳۸۶ تا ۱۳۹۷، نیسان ماکسیما از ۱۳۸۱ تا ۱۳۹۱)؛ چون ثانویه است، وارد نشد.')
NOTES.append('دفترچه‌های «کلاچ برقی هوشمند»، «گروه خودروی x100»، «سیستم صوتی مگان/کلیوس» و «برلیانس h200-h300» راهنمای عمومی یا سامانه‌اند و خودروی جدا ثبت نشدند.')

# ---------------------------------------------------------------------------------------------
# تویوتا — official representative's «محصولات تویوتا در ایران»
# ---------------------------------------------------------------------------------------------
MSP = 'https://mahansanatpars.com/product/'


def toyota_page(slug, label):
    return source(f'toyota-iran-{slug.strip("/").replace("%", "")[:40]}', MSP + slug, f'محصولات تویوتا در ایران — {label}', 'نمایندگی رسمی تویوتا در ایران', 'official')


def t(slug, label):
    return ref(toyota_page(slug, label), f'«{label}» در فهرست محصولات تویوتا در ایران')


imp = dict(supply='imported', supplier=SUP_TOYOTA)
vehicle('toyota.corolla', ['TOYOTA'], 'تویوتا کرولا', 'Toyota Corolla', TOYOTA, [ref(TOYOTA_IR, 'کرولا در فهرست محصولات تویوتا در ایران')], aliases=['کرولا'], models=[
    model('toyota.corolla.1-8', 'کرولا ۱٫۸', 'Corolla 1.8', [t('corolla1-8/', '1.8 کرولا')], **imp),
    model('toyota.corolla.2-0', 'کرولا ۲٫۰', 'Corolla 2.0', [t('corolla1-2-t/', '2.0 L کرولا')], **imp),
    model('toyota.corolla.hybrid-2025', 'کرولا هیبرید ۲۰۲۵', 'Corolla Hybrid 2025', [t('toyotacorollahybrid/', 'Corolla Hybrid 2025')], years=year(2025, t('toyotacorollahybrid/', 'Corolla Hybrid 2025')), **imp)])
vehicle('toyota.corolla-cross', ['TOYOTA'], 'تویوتا کرولا کراس', 'Toyota Corolla Cross', TOYOTA, [t('corollacross/', 'COROLLA CROSS 2.0')], aliases=['کرولا کراس'])
vehicle('toyota.levin', ['TOYOTA'], 'تویوتا لوین', 'Toyota Levin', TOYOTA, [ref(TOYOTA_IR, 'لوین در فهرست محصولات تویوتا در ایران')], aliases=['لوین'], models=[
    model('toyota.levin.1-8', 'لوین ۱٫۸', 'Levin 1.8', [t('%d8%aa%d9%88%db%8c%d9%88%d8%aa%d8%a7-%d9%84%d9%88%db%8c%d9%86-2/', 'لوین 1.8')], **imp),
    model('toyota.levin.1-2t', 'لوین ۱٫۲ توربو', 'Levin 1.2T', [t('%d8%aa%d9%88%db%8c%d9%88%d8%aa%d8%a7-%d9%84%d9%88%db%8c%d9%86/', '1.2 T لوین')], **imp)])
vehicle('toyota.camry', ['TOYOTA'], 'تویوتا کمری', 'Toyota Camry', TOYOTA, [ref(TOYOTA_IR, 'کمری در فهرست محصولات تویوتا در ایران')], aliases=['کمری'], models=[
    model('toyota.camry.2-0', 'کمری ۲٫۰', 'Camry 2.0', [t('%da%a9%d9%85%d8%b1%db%8c-2-0/', 'کمری 2.0')], **imp),
    model('toyota.camry.2-5', 'کمری ۲٫۵', 'Camry 2.5', [t('%da%a9%d9%85%d8%b1%db%8c-2-5/', 'کمری 2.5')], **imp),
    model('toyota.camry.2023', 'کمری ۲۰۲۳', 'Camry 2023', [t('camry-2023/', 'کمری 2023')], years=year(2023, t('camry-2023/', 'کمری 2023')), **imp)])
vehicle('toyota.avalon', ['TOYOTA'], 'تویوتا اوالون', 'Toyota Avalon', TOYOTA, [t('avalon-2-5l/', 'Avalon 2.5L')], aliases=['اوالون', 'آوالون'])
vehicle('toyota.aurion', ['TOYOTA'], 'تویوتا آریون', 'Toyota Aurion', TOYOTA, [t('aurion/', 'آریون')], aliases=['آریون', 'اوریون'])
vehicle('toyota.yaris', ['TOYOTA'], 'تویوتا یاریس', 'Toyota Yaris', TOYOTA, [t('yaris/', 'یاریس')], aliases=['یاریس'])
vehicle('toyota.prius', ['TOYOTA'], 'تویوتا پریوس', 'Toyota Prius', TOYOTA, [ref(TOYOTA_IR, 'پریوس در فهرست محصولات تویوتا در ایران')], aliases=['پریوس'], models=[
    model('toyota.prius.2018', 'پریوس ۲۰۱۸', 'Prius 2018', [t('2018-prius/', 'پریوس 2018')], years=year(2018, t('2018-prius/', 'پریوس 2018')), **imp)])
vehicle('toyota.rav4', ['TOYOTA'], 'تویوتا راوفور', 'Toyota RAV4', TOYOTA, [ref(TOYOTA_IR, 'راوفور در فهرست محصولات تویوتا در ایران')], aliases=['راو۴', 'RAV4', 'راوفور'], models=[
    model('toyota.rav4.base', 'راوفور', 'RAV4', [t('rav4/', 'راوفور')], **imp),
    model('toyota.rav4.2-5', 'راوفور ۲٫۵', 'RAV4 2.5', [t('rav4hib/', 'راوفور 2.5')], **imp)])
vehicle('toyota.c-hr', ['TOYOTA'], 'تویوتا سی‌اچ‌آر', 'Toyota C-HR', TOYOTA, [t('chr/', 'سی اچ آر')], aliases=['سی اچ آر', 'CHR'])
vehicle('toyota.highlander', ['TOYOTA'], 'تویوتا هایلندر', 'Toyota Highlander', TOYOTA, [t('highlander/', 'هایلندر')], aliases=['هایلندر'])
vehicle('toyota.fortuner', ['TOYOTA'], 'تویوتا فورچونر', 'Toyota Fortuner', TOYOTA, [t('fortuner/', 'فورچونر')], aliases=['فورچونر'])
vehicle('toyota.prado', ['TOYOTA'], 'تویوتا پرادو', 'Toyota Prado', TOYOTA, [ref(TOYOTA_IR, 'پرادو در فهرست محصولات تویوتا در ایران')], aliases=['پرادو', 'لندکروزر پرادو'], models=[
    model('toyota.prado.4door', 'پرادو', 'Prado', [t('prado/', 'پرادو')], **imp),
    model('toyota.prado.2door', 'پرادو دو در', 'Prado two-door', [t('prado2door/', 'پرادو دو درب')], **imp)])
vehicle('toyota.land-cruiser', ['TOYOTA'], 'تویوتا لندکروزر', 'Toyota Land Cruiser', TOYOTA, [ref(TOYOTA_IR, 'لندکروزر در فهرست محصولات تویوتا در ایران')], aliases=['لندکروزر', 'لند کروزر'], models=[
    model('toyota.land-cruiser.base', 'لندکروزر', 'Land Cruiser', [t('landcruiser/', 'لندکروزر')], **imp),
    model('toyota.land-cruiser.vxr', 'لندکروزر VXR', 'Land Cruiser VXR', [t('landcruiservxr/', 'Land Cruiser VXR')], **imp)])
vehicle('toyota.fj-cruiser', ['TOYOTA'], 'تویوتا اف‌جی کروزر', 'Toyota FJ Cruiser', TOYOTA, [t('fj-cruiser/', 'اف جی کروزر')], aliases=['اف جی کروزر', 'FJ'])
vehicle('toyota.hilux', ['TOYOTA'], 'تویوتا هایلوکس', 'Toyota Hilux', TOYOTA, [t('hilux/', 'هایلوکس')], aliases=['هایلوکس'])
vehicle('toyota.hiace', ['TOYOTA'], 'تویوتا هایس', 'Toyota Hiace', TOYOTA, [t('hiace/', 'هایس')], aliases=['هایس'])
vehicle('toyota.previa', ['TOYOTA'], 'تویوتا پریویا', 'Toyota Previa', TOYOTA, [t('previa/', 'پریویا')], aliases=['پریویا'])
vehicle('toyota.86', ['TOYOTA'], 'تویوتا ۸۶', 'Toyota 86', TOYOTA, [t('86/', 'تویوتا 86')], aliases=['GT86'])
vehicle('toyota.wildlander', ['TOYOTA'], 'تویوتا وایلدلندر', 'Toyota Wildlander', TOYOTA, [t('wildlanderhev/', 'وایلدلندر')], aliases=['وایلدلندر'])
vehicle('toyota.frontlander', ['TOYOTA'], 'تویوتا فرانت‌لندر', 'Toyota Frontlander', TOYOTA, [t('frontlander/', 'Frontlander 2.0')], aliases=['فرانتلندر'])
vehicle('toyota.bz4x', ['TOYOTA'], 'تویوتا bZ4X', 'Toyota bZ4X', TOYOTA, [t('bz4x/', 'BZ4X')], aliases=['BZ4X'])
vehicle('toyota.lexus-es', ['TOYOTA'], 'لکسوس ES', 'Lexus ES', LEXUS, [t('%d9%84%da%a9%d8%b3%d9%88%d8%b3-es/', 'لکسوس آی اس')], note='عنوان فارسی صفحه «لکسوس آی اس» است؛ نشانی صفحه ES را نشان می‌دهد.')
vehicle('toyota.lexus-is', ['TOYOTA'], 'لکسوس IS', 'Lexus IS', LEXUS, [t('%d9%84%da%a9%d8%b3%d9%88%d8%b3is/', 'لکسوس آی اس')])
vehicle('toyota.lexus-gs', ['TOYOTA'], 'لکسوس GS', 'Lexus GS', LEXUS, [ref(TOYOTA_IR, 'لکسوس GS در فهرست محصولات تویوتا در ایران')], models=[
    model('toyota.lexus-gs.250', 'GS 250', 'GS 250', [t('%d9%84%da%a9%d8%b3%d9%88%d8%b3gs250/', 'لکسوس جی اس 250')], **imp)])
vehicle('toyota.lexus-ct', ['TOYOTA'], 'لکسوس CT', 'Lexus CT', LEXUS, [ref(TOYOTA_IR, 'لکسوس CT در فهرست محصولات تویوتا در ایران')], models=[
    model('toyota.lexus-ct.200', 'CT 200', 'CT 200', [t('%d9%84%da%a9%d8%b3%d9%88%d8%b3-ct200/', 'لکسوس سی تی 200')], **imp)])
vehicle('toyota.lexus-nx', ['TOYOTA'], 'لکسوس NX', 'Lexus NX', LEXUS, [ref(TOYOTA_IR, 'لکسوس NX در فهرست محصولات تویوتا در ایران')], models=[
    model('toyota.lexus-nx.200', 'NX 200', 'NX 200', [t('%d9%84%da%a9%d8%b3%d9%88%d8%b3-nx200/', 'لکسوس ان ایکس 200')], **imp),
    model('toyota.lexus-nx.300', 'NX 300', 'NX 300', [t('%d9%84%da%a9%d8%b3%d9%88%d8%b3-nx300/', 'لکسوس ان ایکس 300')], **imp)])

# ---------------------------------------------------------------------------------------------
# هیوندای — Kerman Motor's Hyundai models (generation codes)
# ---------------------------------------------------------------------------------------------
def hy(path, label):
    k = source(f'hyundai-kerman-{path.strip("/").replace("/", "-")}', f'https://ktl-co.com/cars/{path}', f'هیوندای کرمان موتور — {label}', 'کرمان موتور (هیوندای)', 'official')
    return ref(k, f'«{label}» در فهرست مدل‌های هیوندای کرمان موتور')


hyk = dict(supplier=SUP_KMC)
vehicle('hyundai.kona', ['HYUNDAI'], 'هیوندای کونا', 'Hyundai Kona', HYUNDAI, [ref(HYUNDAI_IR, 'کونا در فهرست مدل‌ها')], aliases=['کونا', 'Kona'], models=[
    model('hyundai.kona.sx2', 'کونا SX2', 'Kona SX2', [hy('2024/kona', 'Kona SX2')], **hyk),
    model('hyundai.kona.sx2-2025', 'کونا SX2 (۲۰۲۵)', 'Kona SX2 (2025)', [hy('2025/kona', 'Kona SX2 (2025)')], years=year(2025, hy('2025/kona', 'Kona SX2 (2025)')), **hyk)])
vehicle('hyundai.azera', ['HYUNDAI'], 'هیوندای آزرا', 'Hyundai Azera', HYUNDAI, [ref(HYUNDAI_IR, 'آزرا در فهرست مدل‌ها')], aliases=['آزرا', 'گرنجور', 'Grandeur'], models=[
    model('hyundai.azera.ig', 'آزرا IG', 'Azera IG', [hy('azera', 'Azera IG')], **hyk)])
vehicle('hyundai.sonata', ['HYUNDAI'], 'هیوندای سوناتا', 'Hyundai Sonata', HYUNDAI, [ref(HYUNDAI_IR, 'سوناتا در فهرست مدل‌ها')], aliases=['سوناتا'], models=[
    model('hyundai.sonata.lf', 'سوناتا LF', 'Sonata LF', [hy('sonata', 'Sonata LF')], **hyk)])
vehicle('hyundai.tucson', ['HYUNDAI'], 'هیوندای توسان', 'Hyundai Tucson', HYUNDAI, [ref(HYUNDAI_IR, 'توسان در فهرست مدل‌ها')], aliases=['توسان', 'ix35'], models=[
    model('hyundai.tucson.tl', 'توسان TL', 'Tucson TL', [hy('tucson', 'Tucson TL')], **hyk),
    model('hyundai.tucson.nx4e', 'توسان NX4E', 'Tucson NX4E', [hy('2023/tucson', 'Tucson NX4E')], **hyk),
    model('hyundai.tucson.2026', 'توسان ۲۰۲۶', 'Tucson 2026', [hy('2026/tucson', 'Tucson 2026')], years=year(2026, hy('2026/tucson', 'Tucson 2026')), **hyk)])
vehicle('hyundai.santa-fe', ['HYUNDAI'], 'هیوندای سانتافه', 'Hyundai Santa Fe', HYUNDAI, [ref(HYUNDAI_IR, 'سانتافه در فهرست مدل‌ها')], aliases=['سانتافه', 'Santafe'], models=[
    model('hyundai.santa-fe.dm', 'سانتافه DM', 'Santa Fe DM', [hy('santafe', 'SantaFe DM')], **hyk)])
vehicle('hyundai.elantra', ['HYUNDAI'], 'هیوندای النترا', 'Hyundai Elantra', HYUNDAI, [ref(HYUNDAI_IR, 'النترا در فهرست مدل‌ها')], aliases=['النترا', 'آوانته'], models=[
    model('hyundai.elantra.ad', 'النترا AD', 'Elantra AD', [hy('elantra', 'Elantra AD')], **hyk),
    model('hyundai.elantra.cn7', 'النترا CN7', 'Elantra CN7', [hy('2023/elantra', 'Elantra CN7')], **hyk),
    model('hyundai.elantra.2025', 'النترا ۲۰۲۵', 'Elantra 2025', [hy('2025/elantra', 'Elantra 2025')], years=year(2025, hy('2025/elantra', 'Elantra 2025')), **hyk)])
vehicle('hyundai.accent', ['HYUNDAI'], 'هیوندای اکسنت', 'Hyundai Accent', HYUNDAI, [ref(HYUNDAI_IR, 'اکسنت در فهرست مدل‌ها')], aliases=['اکسنت', 'ورنا'], models=[
    model('hyundai.accent.rb', 'اکسنت RB', 'Accent RB', [hy('accent', 'Accent RB')], **hyk),
    model('hyundai.accent.hci', 'اکسنت HCI', 'Accent HCI', [hy('2023/accent', 'Accent HCI')], **hyk)])
vehicle('hyundai.i20', ['HYUNDAI'], 'هیوندای i20', 'Hyundai i20', HYUNDAI, [ref(HYUNDAI_IR, '«آی 20 GB» در فهرست مدل‌ها (فقط کاتالوگ)')], aliases=['آی ۲۰', 'i20'], models=[
    model('hyundai.i20.gb', 'i20 GB', 'i20 GB', [ref(HYUNDAI_IR, '«آی 20 GB» در فهرست مدل‌ها')], **hyk)])
vehicle('hyundai.i10', ['HYUNDAI'], 'هیوندای i10', 'Hyundai i10', HYUNDAI, [ref(HYUNDAI_IR, '«آی 10 IA» در فهرست مدل‌ها (فقط کاتالوگ)')], aliases=['آی ۱۰', 'i10'], models=[
    model('hyundai.i10.ia', 'i10 IA', 'i10 IA', [ref(HYUNDAI_IR, '«آی 10 IA» در فهرست مدل‌ها')], **hyk)])
vehicle('hyundai.creta', ['HYUNDAI'], 'هیوندای کرتا', 'Hyundai Creta', HYUNDAI, [ref(HYUNDAI_IR, 'کرتا در فهرست مدل‌ها')], aliases=['کرتا', 'Creta'], models=[
    model('hyundai.creta.su2id', 'کرتا SU2ID', 'Creta SU2ID', [hy('2023/creta', 'Creta Su2ID')], **hyk)])
NOTES.append('BYD Sealion 06 در همان فهرست کرمان موتور آمده اما برند هیوندای نیست؛ در گروه هیوندای وارد نشد.')
NOTES.append('مدل‌های قدیمی‌تر هیوندای و تویوتا که در فهرست‌های رسمی فعلی نیستند (مثلاً ورنا، سانتافه نسل‌های قبلی، کمری‌های قدیمی) منبع رسمی ایرانی نداشتند و وارد نشدند.')

# ---------------------------------------------------------------------------------------------
# Not imported (needs review)
# ---------------------------------------------------------------------------------------------
vehicle('ikco.rd', ['IKCO'], 'آردی', 'RD', IR, [ref(IKCO_MENU, 'در فهرست فعلی نیست')], status='needs_review', existing='rd',
        note='ردیف موجود «آردی» حفظ شد؛ منبع معتبر برای عرضه و سال‌ها پیدا نشد (صفحهٔ ویکی‌پدیا در دسترس نبود).')

dataset = {'version': 1, 'market': 'IR', 'generatedOn': CHECKED, 'sources': SRC, 'vehicles': VEHICLES, 'notes': NOTES}
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'iran-market.v1.json')
with open(out, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(dataset, f, ensure_ascii=False, indent=1)
    f.write('\n')
print(f'{len(VEHICLES)} vehicles, {sum(len(v["models"]) for v in VEHICLES)} models, {len(SRC)} sources -> {out}')
