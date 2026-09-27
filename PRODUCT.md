# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary audiences, weighted equally:

- **People in Costa Rica who just felt shaking.** Usually on a phone, right after the event, wanting a fast answer to "¿Tembló?" (where, how strong, how deep, likely felt or not) and something to share with family or WhatsApp groups.
- **People who follow seismic activity.** They explore the map, replay the timeline, compare sources, and look at activity in Central America and worldwide.

Design decisions must serve both: the quick answer can't be buried under exploration tools, and the exploration tools can't be dumbed down for the quick answer.

## Product Purpose

A live earthquake map focused on Costa Rica that also works worldwide. It shows events as they arrive, including the small local quakes reported by OVSICORI-UNA and RSN-UCR, and makes any event easy to share as a link with a preview card.

## Positioning

It puts Costa Rica's own agencies (OVSICORI-UNA and RSN-UCR, via EMSC) next to USGS in one live map. It answers "¿Tembló?" first, gives Spanish-language place descriptions relative to Costa Rican towns ("23 km al SO de Jacó"), and makes shareable links with preview cards meant for WhatsApp.

## Operating Context

- Checked on phones in the minutes after a quake. Links spread through WhatsApp groups, so the share card is often the first thing people see, before they open the site.
- Also used on desktop for longer exploration sessions.
- Data comes straight from public feeds in the browser: EMSC (WebSocket, live) and USGS (polled every 60 s). Plate boundaries come from Bird (2003).
- Hosted on GitHub Pages at sismo.cr. A scheduled build makes share pages and preview images for recent quakes.

## Capabilities and Constraints

- Map with magnitude-sized circles coloured by depth or age, a density heatmap, plate boundaries, Costa Rican volcanoes, labels, and a globe view.
- Timeline histogram with scrubbing and replay. Event list with a minimum-magnitude filter, a map-view filter and sorting.
- Event detail: local and Costa Rica time, depth class, energy, nearby activity, and a link to the official report.
- "¿Tembló?" banner: the latest likely-felt quake in Costa Rica or near the user. "Likely felt" is an estimate from magnitude and depth, not an official intensity.
- Per-event share pages (`/e/<id>/`) with 1200×630 preview cards, a Share button and a WhatsApp button.
- Spanish and English. Place names from EMSC and USGS are translated.
- Current implementation: a static site (HTML, CSS, JS) with no backend. Only the share-page build uses Node (in CI). This describes the code today; it wasn't set as a binding constraint.
- Magnitudes and locations are preliminary and can be revised by the agencies.

## Brand Commitments

- **Never look official.** Sismo is not an alert or warning service and is not OVSICORI, RSN-UCR, CNE or any government body. Design and copy must not imply official status, give warnings or instructions beyond pointing to CNE and local authorities, or borrow those organisations' identities.
- **Spanish first.** Spanish is the primary language (share cards are rendered in Spanish), and English is secondary. All copy must work in both, and layouts must survive Spanish's longer strings.
- Name: **Sismo**, at sismo.cr.

## Evidence on Hand

- Live data from EMSC/OVSICORI/RSN-UCR and USGS; attribution text is in `js/i18n.js` (`about.*`).
- No testimonials, usage figures, press or endorsements exist. Don't invent them.

## Product Principles

1. **Answer first.** "Did it shake, where, how strong?" is readable within seconds on a phone. Everything else comes after.
2. **Trust through accuracy, not authority.** Show sources, preliminary status and estimates honestly instead of borrowing an official look.
3. **Local by default, global when asked.** Costa Rica and Costa Rican references come first; the world is one tap away.
4. **Built to be shared.** A shared link and its card must stand alone for someone who has never seen the site.

## Accessibility & Inclusion

WCAG 2.2 AA baseline: text contrast, visible keyboard focus, adequate touch targets and reduced-motion support, in both languages.
