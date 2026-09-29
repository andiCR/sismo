# Sismo: notes for AI assistants

Read `PRODUCT.md` (who it's for, principles, what the brand must never do) and `DESIGN.md` (the visual system and component specs) before changing anything people see.

## Don't clutter the views

The quake detail once said the same thing three ways (ShakeMap maximum, strongest "Did You Feel It?" report, a model peak) and put UTC, coordinates and energy in front of the quick answer. It was cut back on purpose. Before adding anything to a view, check:

- **Is it already said?** A fact appears once per view. Merge it into the existing line or block instead of adding a new one.
- **Does a measurement replace an estimate?** Then show the measurement and drop the estimate.
- **Who is it for?** If it isn't for someone on a phone who just felt shaking, it goes under "Más datos", or into "Informes y cobertura" as a link.
- **What does it replace?** A new block above "Más datos" must replace or fold into one that's there (DESIGN.md, "The Detail Budget Rule"). On a 375×812 phone, the open sheet shows the magnitude through the shaking figure without scrolling.
- **Is it a link or a card?** Secondary sources are one line of links, not a card each.

The same goes for the list, the timeline and share cards: prefer one clear figure over several partial ones.

## Practicalities

- Static site, no build step for the app: `index.html`, `css/style.css`, `js/*.js`. Share pages are built in CI by `scripts/build-site.mjs` (see README).
- All UI copy is in `js/i18n.js` in Spanish and English. Spanish comes first and is longer, so check layouts with it.
- This machine has Windows PowerShell 5.1 and Node 24 (no Python). Serve locally with `serve.ps1`; Windows reserves port 5173 here, so use another (for example 8123). In PowerShell, call `npx.cmd`/`npm.cmd`: script execution is disabled for `npx.ps1`.
- `worker/` is a Cloudflare Worker: the build trigger and push notifications (`src/push.js`). `npm run dev` there runs it locally with a local D1 database.
