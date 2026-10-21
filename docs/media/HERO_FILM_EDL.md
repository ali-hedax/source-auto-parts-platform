# SOURCE by HEDAX — Hero film: media inventory and edit decision list

Date: 2026-10-21 (Asia/Tehran). Branch: `feature/source-premium-experience`.
Source files stay outside Git in the owner's folder `Desktop/hero-videos/`; they
were only read. Outputs are in `Desktop/hero-videos/source-hero-edit/`.

## 1. Inventory (inspected with ffmpeg 7.1 and per-second / 4 fps contact sheets)

All sources: H.264 High, yuv420p, 24 fps, AAC stereo audio, Kling AI 4.0 output.
**Every clip carries a visible "KlingAI 4.0" watermark (bottom right).**

| ID | File | Dur. | Res. | Content | Usable ranges | Problems |
|----|------|------|------|---------|---------------|----------|
| v1 | `kling_20261021_VIDEO_Create_a_c_4329_0.mp4` | 10.04 s | 1280×720 | Chassis/suspension assembles in dark tunnel → silver crossover, front view | 0.0–4.0 chassis | Car model differs from v2/v5/v6; AI "SOURCE by HEDAX" text from ~7.8 s |
| v2 | `kling_20261021_VIDEO_Create_a_p_4310_0.mp4` | 10.04 s | 1280×720 | Parts converge on chassis → doors close → dark-blue SUV front-3/4 | 0.0–7.08 | AI text from ~7.25 s (wrong typography) |
| v3 | `kling_20261021_VIDEO_Create_a_p_4572_0.mp4` | 12.04 s | 1280×720 | Gear tunnel → mechanic standing → close-up holding piston → SUV + logo | 0.0–1.9 (dup. of v7 tunnel at lower res) | Human-dominated; malformed "S" logo; not used |
| v4 | `kling_20261021_VIDEO_Project_Na_4282_0 (1).mp4` | 10.04 s | 1280×720 | Exploded crossover assembles with floor reflection | 0.0–7.6 | Different car model; AI text from ~7.9 s |
| v5 | `kling_20261021_VIDEO_SOURCE_by__5244_0.mp4` | 9.04 s | 1280×720 | Blue-lit floating parts → mechanic with piston → same assembly as v2 | 0.0–1.75, 3.75–7.1 | Mechanic 1.9–3.6 s; AI text ~7.25 s |
| v6 | `kling_20261021_VIDEO_SOURCE_by__5244_1 (1).mp4` | 9.04 s | 1280×720 | Radial burst of parts with car at centre → mechanic silhouette → same assembly | 0.0–1.7, 3.8–7.1 | Mechanic 1.8–3.7 s; AI text ~7.25 s |
| v7 | `kling_20261021_VIDEO_VIDEO_03___4380_0.mp4` | 10.04 s | **1920×1080** | Gear tunnel → particle burst → assembly → grey crossover | 0.0–4.6 tunnel/burst | Car changes model at ~7 s; AI text ~9 s |
| v8 | `Downloads/kling_20261020_VIDEO_A_single_c_6009_0.mp4` | 6.04 s | 1280×720 | Exotic supercar assembles | — | Supercar aesthetic, excluded by brief |

Duplicates (identical MD5): `Downloads/...4310_0.mp4` = `...4310_0 (1).mp4` = v2;
`...4282_0.mp4` = `...4282_0 (1).mp4` = v4; `...5244_1.mp4` = `...5244_1 (1).mp4` = v6;
the remaining Downloads files equal their `hero-videos` copies.
v2, v5 and v6 show the same SUV and the same assembly path, which is what makes
a continuous edit possible.

## 2. Edit decision list (24 fps, 1920×1080 output)

| # | Scene | Source | In → Out | Dur. | Transition in |
|---|-------|--------|----------|------|---------------|
| 1 | A — Mechanical universe | v7 | 0.00 → 3.50 | 3.50 | fade from black 0.5 s |
| 2 | B — Precision engineering (radial parts, car at centre) | v6 | 0.00 → 1.60 | 1.60 | dissolve 0.33 s (only dissolve) |
| 3 | B — Floating components | v5 | 0.10 → 1.75 | 1.65 | hard cut |
| 4 | C — Assembly → D vehicle completion | v2 | 0.00 → 5.50 | 5.50 | hard cut (motion-matched) |
| 5 | D — Settle + hold | v2 | 5.50 → 7.04, then last clean frame held 3.2 s | 4.74 | continuous; slow 4.5 % push-in |
| 6 | E — Brand reveal (master only) | official `logo-dark.png` | over shot 5, t+3.0 s | — | car dims to ~38 % over 1.3 s; logo fades in 1.1 s |

Total: 16.75 s. The founder/mechanic shots are excluded entirely. Every cut
ends before any AI-generated lettering appears; the logo is the official file.
Grade on all shots: contrast 1.06, saturation 0.90, gamma 0.97, slight cool shadows.
720p sources are upscaled with Lanczos — **this is not native 1080p**; only shot 1 is native 1080p.
Audio is removed (hero video autoplays muted).

## 3. Deliverables (measured sizes)

| File | Spec | Size |
|------|------|------|
| `source-hero-master-1080p.mp4` | 1920×1080, H.264 CRF 15, with logo end card | 24.68 MB |
| `source-hero-desktop-1600.mp4` | 1600×900, H.264 CRF 25, ≤3 Mbps, loop fades, no logo | 4.73 MB |
| `source-hero-desktop-1600.webm` | 1600×900, VP9 CRF 36 | 4.29 MB |
| `source-hero-mobile-480.mp4` | 854×480, H.264 Main, ≤1.1 Mbps | 1.49 MB |
| `source-hero-poster-desktop.{webp,jpg}` | 1600×900, final car frame | 41 KB / 77 KB |
| `source-hero-poster-mobile.{webp,jpg}` | 854×480 | 20 KB / 33 KB |

Web versions carry no burned-in logo: the site renders the logo and text as HTML.
Reproducible script: kept with the session scratchpad (`edit/build.sh`); the ffmpeg
binary is the static build from the `imageio-ffmpeg` package (not installed system-wide).

## 4. Blocker for public release

**Blocked External:** the watermark is part of all sources. It was not cropped,
blurred or removed. Before Production, the owner should re-download the same
generations without the watermark from the Kling account (paid plan) and the
same EDL will be re-rendered from those files.
