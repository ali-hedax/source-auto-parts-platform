#!/usr/bin/env bash
# Rebuilds the homepage web variants of the owner-selected continuous v2 hero film
# (docs/media/HERO_FILM_V2_EDL.md) from the original source footage.
# Output is NOT committed: the source still carries the generator watermark and the
# repository is public. LOCAL REVIEW ONLY: /review-media is never used by a published
# page (BuilderService.publish accepts only release-cleared library media). Usage:
#   FFMPEG=/path/to/ffmpeg SRC=/path/to/kling_20261021_VIDEO_Create_a_p_4310_0.mp4 \
#     bash scripts/media/build-hero-v2.sh [out-dir]
set -euo pipefail
: "${FFMPEG:?set FFMPEG to an ffmpeg 7.x binary}"
: "${SRC:?set SRC to the original source footage}"
OUT="${1:-apps/web/public/review-media/source-hero/v2}"
mkdir -p "$OUT"
# Same edit as the accepted review copy, minus its burned-in logo (the site renders
# the official logo itself so the brand reveal never appears twice).
EDIT="trim=start=0:end=6.4,setpts=1.5*(PTS-STARTPTS),fps=24,tpad=stop_mode=clone:stop_duration=2.4,eq=contrast=1.03:saturation=0.95,fade=t=in:st=0:d=0.25"
X264=(-c:v libx264 -preset slow -profile:v high -pix_fmt yuv420p -movflags +faststart -an -threads 4)
"$FFMPEG" -hide_banner -loglevel error -y -i "$SRC" -vf "$EDIT,scale=1280:720:flags=lanczos" -t 12 "${X264[@]}" -crf 23 "$OUT/hero-desktop.mp4"
"$FFMPEG" -hide_banner -loglevel error -y -i "$SRC" -vf "$EDIT,scale=1280:720:flags=lanczos" -t 12 -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 -pix_fmt yuv420p -an -threads 4 "$OUT/hero-desktop.webm"
"$FFMPEG" -hide_banner -loglevel error -y -i "$SRC" -vf "$EDIT,scale=854:480:flags=lanczos" -t 12 "${X264[@]}" -crf 26 "$OUT/hero-mobile.mp4"
# Posters: the opening (parts laid out) for the <video> poster, the held final car for
# the static / reduced-motion / data-saver still.
for size in desktop:1280:720 mobile:854:480; do
  IFS=: read -r name w h <<<"$size"
  "$FFMPEG" -hide_banner -loglevel error -y -ss 0.5 -i "$OUT/hero-$( [ "$name" = desktop ] && echo desktop || echo mobile ).mp4" -frames:v 1 -vf "scale=$w:$h" -q:v 3 "$OUT/poster-$name.jpg"
  # The poster is the hero's LCP image: a light WebP (the JPEG stays as a fallback).
  "$FFMPEG" -hide_banner -loglevel error -y -ss 0.5 -i "$OUT/hero-$( [ "$name" = desktop ] && echo desktop || echo mobile ).mp4" -frames:v 1 -vf "scale=$w:$h" -c:v libwebp -quality 72 "$OUT/poster-$name.webp"
  "$FFMPEG" -hide_banner -loglevel error -y -ss 11.5 -i "$OUT/hero-$( [ "$name" = desktop ] && echo desktop || echo mobile ).mp4" -frames:v 1 -vf "scale=$w:$h" -q:v 3 "$OUT/still-$name.jpg"
  "$FFMPEG" -hide_banner -loglevel error -y -ss 11.5 -i "$OUT/hero-$( [ "$name" = desktop ] && echo desktop || echo mobile ).mp4" -frames:v 1 -vf "scale=$w:$h" -c:v libwebp -quality 80 "$OUT/still-$name.webp"
done
# Full decode check of every movie.
for f in "$OUT"/hero-*.mp4 "$OUT"/hero-*.webm; do "$FFMPEG" -hide_banner -loglevel error -i "$f" -f null - ; done
ls -l "$OUT"
