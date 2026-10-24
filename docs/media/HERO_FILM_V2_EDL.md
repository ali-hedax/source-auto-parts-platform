# SOURCE by HEDAX — Hero film v2 (selected): EDL and web variants

Date: 2026-10-22 (Asia/Tehran). Branch: `feature/source-premium-experience`.
Owner decision 2026-10-22: the continuous v2 edit is the selected homepage film
(«آره بهتر شد»). It supersedes the rejected 16.75 s multi-clip montage described in
`HERO_FILM_EDL.md` (kept for history only; do not reuse its encodes or posters).
Film selection is not approval of the homepage design or of any release.

## Source and accepted review copy

| Item | Value |
|---|---|
| Source (outside Git) | `Desktop/hero-videos/kling_20261021_VIDEO_Create_a_p_4310_0.mp4` — 1280×720, 24 fps, H.264, 10.04 s, has AAC audio; SHA-256 `1d36735a…bcfb7` |
| Accepted review copy (outside Git) | `source-continuous-v2.mp4` — 12.00 s, 288 frames, 1280×720, 24 fps, silent, burned-in logo, 4,522,009 bytes, SHA-256 `ff813139…59b2` |
| Official logo | `apps/web/public/brand/source/logo-dark.png` — byte-identical to the logo in the review edit (SHA-256 `42f47e33…94e9`) |

## Edit (identical for the review copy and the web variants)

| Operation | Setting |
|---|---|
| Trim | `trim=start=0:end=6.4` — one uninterrupted assembly shot; ends before the generator's own lettering |
| Speed | `setpts=1.5*(PTS-STARTPTS)` (2/3 speed), `fps=24` (duplicated frames, no interpolation) |
| Hold | `tpad=stop_mode=clone:stop_duration=2.4`; output capped at 12 s |
| Grade | `eq=contrast=1.03:saturation=0.95`; fade in from black 0–0.25 s |
| Audio | removed |
| Watermark | the source "KlingAI 4.0" mark is preserved (not removed, cropped or covered). Public release needs an authorized watermark-free source. |

**Difference from the review copy:** the web variants do not burn in the logo. The
site renders the official logo itself at **9.8 s** (block setting `film.logoAt`), at
the same place (centre, ~9 % from the top, 28 % of the film width), with a 0.9 s fade.
So the brand reveal appears exactly once. A 12-frame sheet of the desktop variant was
compared with the review copy: same frames at every second; only the logo differs.

## Web variants (generated, not committed)

Rebuild: `FFMPEG=… SRC=… bash scripts/media/build-hero-v2.sh` → `apps/web/public/review-media/source-hero/v2/`
(git-ignored: the repository is public and the source carries the watermark).
Encoder: ffmpeg 7.1 static build (`imageio-ffmpeg` wheel). Native 1280×720 — no upscale.

| File | Use | Encode | Bytes |
|---|---|---|---|
| `hero-desktop.mp4` | desktop film | x264 high, CRF 23, preset slow, faststart, 1280×720 | 2,603,378 |
| `hero-desktop.webm` | desktop film where VP9 plays (preferred, lighter) | VP9 CRF 36, 1280×720 | 1,459,230 |
| `hero-mobile.mp4` | ≤639 px viewports (only this file is fetched there) | x264 high, CRF 26, 854×480 | 911,136 |
| `poster-desktop.jpg` / `poster-mobile.jpg` | `<video>` poster: the parts laid out (t = 0.5 s) | JPEG q3 | 87,733 / 48,015 |
| `still-desktop.webp|jpg` / `still-mobile.webp|jpg` | the held complete car (t = 11.5 s): reduced motion, data saver, failed playback, `static` mode | WebP q80 / JPEG q3 | 37,324 · 63,247 / 22,312 · 35,569 |

Verification 2026-10-22: every movie fully decoded to null with exit 0; all three are
288 frames / 12.00 s. This is media verification only — not browser, CMS or
performance acceptance.
