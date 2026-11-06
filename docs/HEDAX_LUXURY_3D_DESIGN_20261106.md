# SOURCE by HEDAX — Cinematic 3D Commerce
Status: design specification only, 2026-11-06. No production change. **Do not merge/deploy without owner approval.**

## North star
An immersive, premium auto-parts ecommerce product with a *site-wide spatial design language* and **real interactive 3D parts**, not a conventional storefront with a single 3D hero. Preserve all search, catalog, purchasing, sourcing, staff and admin workflows. User-approved aesthetic: black mineral stone, premium metallic components, dramatic but controlled studio lighting, refined typography and physically plausible depth. Avoid generic AI dashboard cards, repetitive gradients, excessive gold, fake 3D or game-like scenes.

## Site-wide design
- Layered stone and metal surfaces, selective high-contrast illumination, precision edges, visual asymmetry and strong typographic hierarchy; custom iconography and tactile controls.
- Header, search, category navigation, vehicle/VIN/part number entry, filters, product cards, comparison, PDP, cart, sourcing request, account, admin all share the spatial system.
- Interaction: meaningful hover/focus/press depth and carefully timed transitions; no permanent animation that competes with finding parts. Maintain fast touch and keyboard access.
- Cinematic hero featuring **parts**, not a hero car. Prominent centered SOURCE/by HEDAX mark and editable Persian slogan «دنیای قطعات خودرو، هوشمندتر از همیشه»; full hero frame visible on desktop first fold; editable imagery/video through existing admin appearance capabilities where supported.

## Genuine 3D product system
- Pilot on one properly licensed/owned GLB/GLTF assembly with PBR materials, environment lights, orbit controls, exploded view, part hotspots and accessible part-list fallback.
- Hotspots resolve to canonical part IDs and verified catalog fields (OEM/part number/name/image/availability); stock independent of catalog; no invented fitment or VIN mapping. Connect to existing search and order workflows through current APIs only after inspecting contracts.
- Three.js + React Three Fiber + Drei only where WebGL is justified; lazy-load viewers, image poster and no-WebGL fallback; capped pixel ratio, compressed textures, LOD and measured mobile GPU use. No high-poly viewer in every product card.
- Progressive enhancement: products without 3D assets remain beautiful and fully purchasable. Licensing, model provenance and per-part mapping are explicit admin tasks.

## Surfaces / rollout
1. Design tokens, art direction, custom icon set and 3 representative real route screenshots: home, search/results, PDP.
2. Spatial shell and homepage; preserve Hexi assistant placement, sticky cart controls, current responsive fixes and existing hero CMS hooks.
3. Search/filters/catalog cards; measurable speed and accessibility.
4. Interactive 3D viewer pilot and exploded part mapping; image and no-WebGL fallback.
5. Cart, request sourcing, account and admin visual parity; consistent responsive and reduced-motion behavior.
6. Complete route/role audit and polish, without touching API, database or production data.

## Delivery / acceptance
- Work on isolated branch; coordinate with the existing feature/source-premium-experience branch, do not overwrite it. Inspect AGENTS.md, PROGRESS.md and actual current main before code.
- Visual proof in actual browser at 360/390/768/1440; touch, focus, screen reader, RTL/LTR, contrast, reduced motion, loading/error, no horizontal overflow.
- Baseline and after Web Vitals, WebGL memory and FPS; no performance regression in search and cart; no overlap with Hexi or purchase controls.
- Existing lint, typecheck, tests, build and relevant e2e must run; record real results, not assumed success.
- Do not merge/deploy, alter .env, storage, DNS, customer data or release workflow without explicit approval.
- This is **a design/implementation plan, not a claim that the full 3D interface has been coded or tested**.

## Dependency / next action
After Saturday functional release, refresh base, inspect real components, establish screenshot baselines and implement design tokens + homepage vertical slice. Then PR for owner visual review before extending across routes.
