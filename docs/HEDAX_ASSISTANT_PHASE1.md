# HEDAX Assistant — Phase 1 (website guide)

## Scope

- Bilingual Persian/English floating widget on public storefront pages (not admin/staff).
- Small local SVG mechanic mascot with subtle idle animation; reduced-motion settings respected.
- Four guided actions: parts search, price/availability explanation, ordering, and contact.
- Short text input routes to safe, deterministic replies and existing public pages.
- No AI provider, no secrets, no new database table, no customer data sent or stored by the widget.
- **No claims of live stock, price, vehicle fitment, human availability, or completed orders.**
- Does not replace the authenticated human conversation system.

## Architecture / safe upgrades

The UI lives in `apps/web/src/components/chat/hedax-assistant-widget.tsx`. The `respond()` and `replyFor()` functions are the phase-1 local response adapter. A later phase can introduce a server endpoint for grounded RAG replies while keeping the widget and interaction history UI. Future server endpoints must enforce rate limits, input validation, privacy controls, approved catalog sources, citations, and no unverified fitment/price claims.

The asset `apps/web/public/hedax-ai-mascot.svg` is a lightweight placeholder illustration. Replace it with an optimized licensed 3D render, sprite, or Lottie/Rive animation after asset review. The current animation is CSS motion of a static illustration, **not a true animated 3D model**.

## Verification before production

1. CI: web TypeScript, lint and builds must pass.
2. Manually test /fa and /en on desktop and mobile, keyboard focus, Escape close, link destinations and reduced motion.
3. Verify widget does not cover important checkout or consent controls on mobile; if needed hide or reposition on checkout.
4. Confirm the mascot artwork is approved before release.
5. Deploy web image to Arvan only after backups, production readiness checks, and post-deploy smoke tests.

## Later phases

1. Admin-managed greeting, FAQs, appearance, enable/disable, and handoff destinations.
2. Catalog/product retrieval with citations and strict source approval, then read-only price/stock APIs.
3. Secure conversation handoff to staff, analytics with consent, optional Telegram/Bale reuse.
4. Lottie/Rive or optimized 3D mascot expressions and voice only if performance/privacy budgets allow.
