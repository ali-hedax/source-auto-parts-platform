# Product card reference — 2026-10-25

The owner supplied a white AUTODOC product-card screenshot and requested its
color/layout and full-width red cart button for home-page products. Apply one
shared card to home collections and catalogue listings so purchase behavior is
consistent. This explicit request supersedes the master palette's restriction
on red for this card only; the Hero and site navigation keep their current style.

Palette: white #FFFFFF, hairline #EDF0F3, primary text #172831, muted #5C6B76,
details blue #0069DF, purchase red #D92916 (hover #BA2111). White/red contrast
exceeds4.5:1. Existing Vazirmatn/Montserrat UI fonts, 19px title, 28px price,
15px metadata. Near-square uncropped image above details; price and72px purchase
bar align at the bottom;3px corners, no decorative shadow. RTL mirrors metadata
with explicit units and isolated technical codes retained.

Keep real names, images, price/currency/unit, stock, fitment and maker. Do not
invent discount, RRP, ratings/review count, hazard marks, tax/shipping claims or
a seller from the screenshot. Do not add a nonfunctional heart. Quick add uses
the existing CSRF-protected cart API and first valid sales-unit amount. Loading
prevents repeat submission; success updates the header cart and announces the
result; failures stay readable with retry. Unpurchasable/no-price cards route to
a prefilled sourcing request. Controls are sibling to the product link, with
accessible labels and keyboard focus, no nested buttons.

Preview review only; do not merge/publish to Production before owner approval.

Preview catalogue is otherwise empty. Four clearly marked synthetic items
(PREVIEW-CARD-01..04) exercise available/long-price/inquiry/out-of-stock cards;
none are copied from Production or approved for Production. The first two use
an unmodified image downloaded from the official LIQUI MOLY Injection Cleaner
page https://www.liqui-moly.com/en/in/injection-cleaner-p000052.html, image
1971_Injectionreiniger_300ml_089d.png (650×640). Test prices/stock are synthetic.
Normal Preview product/media/inventory/publication APIs are used. The Preview
new-products block uses editable4/2/1 desktop/tablet/phone columns.
