# Hero review revision — 2026-10-25

Owner-approved scope: display-only first viewport; remove the small SOURCE label,
Hero search and vehicle CTA. Keep two editable slogans and the chosen film/still.
Move shopping paths and category chips to a separate section before new products.
The owner explicitly requests one orange card, superseding the older master
palette restriction for this component. Production publication requires the
owner's review of this Preview; do not reuse the earlier release authorization.

Palette: stage #05080D, paper #F6F8FC, secondary text #BFCDDB, orange #FF8A00,
shopping ground #F2F5F8, ink #15243A. Typography: self-hosted Lalezar display
lettering in Arabic/Persian and Latin; existing Vazirmatn/Montserrat for the UI.
Lalezar comes from Google Fonts, with its OFL included next to the font files.

Latest owner revision: full-width 16:9 film first, centered full-width slogan
block below, in both languages and on every device. No side-by-side columns.
Keep the entire uncropped film; the vertical banner can extend below the first
viewport on wide screens rather than shrinking/cropping the footage. Below
the banner: `[ orange vehicle card | catalogue card | sourcing card ]`, then
category chips. On phones the three cards stack with adequate touch targets.

Keep the accepted footage, media library, no-watermark gate, reduced-motion and
data-saving fallback. Preserve whole image/film framing and stop/replay controls.
No added decorative labels, fake vehicle logos or regenerated brand marks.

Owner-requested slogan motion: one typewriter sequence on page entry, primary
phrase then secondary, finishing in about 3.3 seconds after local fonts settle.
When the tall film puts the copy below the fold, start on its first entry into
view so the visitor actually sees the typing; it does not replay on scrolling.
Whole graphemes form the visible prefix so Persian joining stays natural. The
complete accessible source reserves final line height; the visual overlay does
not move the media/cards. No loop or deletion. Reduced motion and no JavaScript
show both complete slogans immediately. Existing Appearance text edits feed it.

Four input logos are JPG 800×500 (0.4MP), under 5MB. Source provenance:
- Iran Khodro: https://www.ikco.ir/fa/Images/logo-fa.jpg (official header artwork).
- SAIPA: https://commons.wikimedia.org/wiki/File:SAIPA-wiki.png (public-domain dedication by Javad rahmani 1980; format conversion/white padding only).
- Toyota: https://global.toyota/en/download/8404971 (official download).
- Hyundai: https://www.hyundai.com/etc/designs/hyundai/ww/en/images/common/logo.png (official site wordmark).

These are uploaded into Preview's normal content pipeline and associated with
the corresponding vehicle-brand records. The pipeline may optimize JPG uploads
to WebP; the owner's downloadable source files remain JPG. No image file is
silently hardcoded into the brand component or uploaded into Production.
