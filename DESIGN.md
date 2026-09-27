---
name: Sismo
description: Live earthquake map for Costa Rica and the world, docked around the map like a field-station console.
colors:
  trace-orange: "#ff6a3d"
  trace-orange-hover: "#ff7d55"
  trace-orange-text: "#ff9a76"
  trace-orange-ink: "#1c0e08"
  station-floor: "#0f0e0d"
  drum-black: "#141311"
  drum-black-raised: "#1c1a18"
  drum-black-selected: "#25231f"
  chart-ink: "#ece7df"
  chart-ink-soft: "#d4cec4"
  graphite: "#a39c91"
  graphite-faint: "#8a8378"
  hairline: "rgba(236, 228, 216, 0.09)"
  hairline-strong: "rgba(236, 228, 216, 0.18)"
  field-green: "#5fd38d"
  amber-replay: "#f2c14e"
  fault-red: "#ff6b6b"
  plate-boundary: "#ff9f43"
  depth-0km: "#ff4d5e"
  depth-10km: "#ff8a3d"
  depth-35km: "#ffd23f"
  depth-70km: "#8ee06b"
  depth-150km: "#35c3e8"
  depth-300km: "#6f7bff"
  depth-700km: "#c77dff"
typography:
  wordmark:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 750
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 118"
  figure-display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "46px"
    fontWeight: 750
    lineHeight: 0.9
    letterSpacing: "-0.03em"
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 76"
  figure-headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 750
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 78"
  figure-list:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 82"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  heading-small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.42
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.42
rounded:
  sm: "4px"
  md: "6px"
  sheet: "12px"
  round: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  pad: "16px"
  pad-mobile: "14px"
  sidebar: "344px"
  timeline: "64px"
  timeline-mobile: "54px"
components:
  button-primary:
    backgroundColor: "{colors.trace-orange}"
    textColor: "{colors.trace-orange-ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-primary-hover:
    backgroundColor: "{colors.trace-orange-hover}"
    textColor: "{colors.trace-orange-ink}"
  button-secondary:
    textColor: "{colors.chart-ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.drum-black-raised}"
  setting-option:
    textColor: "{colors.graphite}"
    padding: "4px 0 3px"
  setting-option-active:
    textColor: "{colors.chart-ink}"
  event-row:
    textColor: "{colors.chart-ink}"
    padding: "8px 16px 8px 10px"
  event-row-hover:
    backgroundColor: "{colors.drum-black-raised}"
  event-row-selected:
    backgroundColor: "{colors.drum-black-selected}"
  play-button:
    backgroundColor: "{colors.trace-orange}"
    textColor: "{colors.trace-orange-ink}"
    rounded: "{rounded.round}"
    size: "36px"
  timeline-pill:
    textColor: "{colors.graphite}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
---

# Design System: Sismo

## Overview

**Creative North Star: "The Field Station"**

Sismo is set up like a seismograph station's console. The map is the instrument, and everything else is docked around it: a full-height sidebar on the left, the timeline along the bottom, and one small tool panel over the map. Surfaces are solid and separated by hairlines, not floating cards. Settings read like labelled controls on a panel. Magnitudes are set as measurements: condensed, tabular, and marked with the same coloured dot the map uses.

It is **warm and local** at rest. The neutrals are warm-tinted near-blacks (Drum Black, not navy), copy is Spanish first, and places are described relative to Costa Rican towns. It becomes **urgent** only when something has actually happened: a quake felt in the last hour, a new event arriving, a recent event pulsing on the map. That urgency is carried by Trace Orange and plain wording. It never borrows the look of an official alert. Sismo is not OVSICORI, RSN-UCR or CNE, and must never look like them (see PRODUCT.md).

This system replaced a floating-glass-card look that read as AI-generated: Inter, frosted panels with soft shadows, pill segments, uppercase eyebrow labels, pulsing status dots and coloured glows. Those are its anti-references.

**Key Characteristics:**
- Docked, full-height surfaces with 1px hairlines; the map fills the rest.
- One accent (Trace Orange) on warm near-black neutrals; colour otherwise belongs to data.
- Archivo throughout, using its width axis: expanded wordmark, condensed figures.
- Magnitude = map-coloured dot + condensed figure, sized like the map symbol.
- Sentence case everywhere; no eyebrows, no status chips.
- Motion only for state: 120–250 ms ease-out, map pulse for recent events.

## Colors

Warm, low-chroma near-blacks with one orange signal colour; every other hue is data.

### Primary
- **Trace Orange** (#ff6a3d): the seismogram line in the logo, the primary action (Share, Play), the active setting underline, the ¿Tembló? "now" state and the focus ring. Its hover is #ff7d55. Text placed on it uses **Trace Ink** (#1c0e08), never white, because white on this orange fails contrast.
- **Trace Orange Text** (#ff9a76): the lighter orange for orange text on dark surfaces (the "28 km al SO de Jacó" line, links, the CR tag).

### Neutral
- **Station Floor** (#0f0e0d): page background behind the map.
- **Drum Black** (#141311): every docked surface (sidebar, timeline, header and sheet on phones) and the floating tools.
- **Drum Black Raised** (#1c1a18): hover on rows and buttons.
- **Drum Black Selected** (#25231f): the selected event row and open menu buttons.
- **Chart Ink** (#ece7df): primary text and figures. **Chart Ink Soft** (#d4cec4): long-form text (effects, about).
- **Graphite** (#a39c91): secondary text and metadata. **Graphite Faint** (#8a8378): row labels ("Fuente", "Período"), detail labels and tertiary text; this is the lowest-contrast text colour (4.9:1 on Drum Black). Never use it on Drum Black Selected, where it drops to 4.2:1, below AA; use Graphite (6.8:1 on Drum Black) there.
- **Hairline** (rgba(236, 228, 216, 0.09)) and **Hairline Strong** (rgba(236, 228, 216, 0.18)): all separation and outlined buttons.

### Status
- **Field Green** (#5fd38d): live connection dot, active Live button, calm ¿Tembló? state.
- **Amber Replay** (#f2c14e): replay/scrubbing state and the timeline cursor while replaying.
- **Fault Red** (#ff6b6b): offline status and error toasts. Tsunami and PAGER alerts use a Fault Red tint (rgba(255, 107, 107, 0.12)) with #ffc0b8 text.

### Data scales
- **Depth** (0 → 700 km): #ff4d5e, #ff8a3d, #ffd23f, #8ee06b, #35c3e8, #6f7bff, #c77dff, interpolated. Shared by the map, list dots, timeline markers, legend and share cards.
- **Age**: #ffffff → #ff4d5e (1 h) → #ff9a3d (24 h) → #ffd23f (7 d) → #5d7390 (30 d).
- **Plate boundaries**: #ff9f43 at 40% opacity.

### Named Rules
**The One Trace Rule.** Trace Orange is the only accent. It marks the primary action, the current selection and real urgency, and nothing decorative. Never add a second accent hue.

**The Data Owns Colour Rule.** The rainbow depth scale is a data encoding and stays inside data (map, dots, legend, timeline). Never reuse data hues for UI chrome, and never tint the chrome to match them.

**The Warm Neutral Rule.** Neutrals are warm-tinted near-blacks. Never use cool navy or blue-grey (#0a0e15, #8f9bb1 and the like), pure black, or neutral grey.

## Typography

**Font:** Archivo (Google Fonts variable, `wdth` 62–125, `wght` 400–800), with system-ui as fallback.
**Share images:** static Archivo cuts from the Omnibus-Type foundry (Regular, Medium, Bold, Condensed Bold, Expanded ExtraBold), because the image renderer can't use variable axes.

**Character:** one grotesque family doing every job through its width axis, the way labels and dials on a single instrument share one face. Expanded for the name, normal for reading, condensed for measurements.

### Hierarchy
- **Wordmark** (750, 19px, `wdth` 118, -0.015em): "Sismo" only.
- **Figure Display** (750, 46px, `wdth` 76, line-height 0.9, tabular): the magnitude in the quake detail.
- **Figure Headline** (750, 26px, `wdth` 78, tabular): the magnitude in ¿Tembló?. On phones, when collapsed, it's 22px.
- **Figure List** (700, 16px, `wdth` 82, tabular): magnitudes in the event list and toasts.
- **Title** (650, 18px, 1.25, -0.01em, balanced wrap): the place name in the detail.
- **Heading Small** (700, 15px): "¿Tembló?".
- **Body** (400–500, 13px, 1.42): list rows, controls and detail values. Long text is capped at 60–62ch.
- **Label** (400, 12px): row labels, detail labels, metadata, the timeline Live and 1× pills. Legend text is 10.5–11px.

### Named Rules
**The Figure Rule.** Every magnitude is a condensed, tabular figure next to a dot in the event's map colour, sized like the map symbol (5–16px). Never put a magnitude inside a coloured tile, badge or chip.

**The No Eyebrow Rule.** No uppercase, letter-spaced micro-labels anywhere. Labels are sentence case at 12px in Graphite Faint, and headings carry their own weight.

**The One Family Rule.** Archivo only. Hierarchy comes from width, weight and size, not a second typeface. Don't add a monospace for a "technical" look.

## Layout

The map is full-bleed. On desktop, the **sidebar** (344px) is docked full height on the left. It holds the brand row, the settings rows (Source, Period, Go to), ¿Tembló?, the summary and filters, then the event list or detail. The **timeline** (64px) is docked along the bottom of the map area, beside the sidebar. The **layer tools** float 12px from the top-right corner. Camera moves and fitted regions account for the docked chrome, so the selected quake centres in the visible map, not the viewport.

At 760px and below, the layout is map first:
- The header is docked across the top as one row, and settings drop down from a filters button.
- The layer tools collapse to one button.
- The timeline is docked to the bottom, with safe-area padding.
- The list and detail become a bottom sheet attached to the top of the timeline. Collapsed, the sheet is one row: ¿Tembló? plus a count button. When a quake is open, the sheet drops to the bottom edge and the timeline and layer tools hide.

Spacing uses a 16px side pad (14px on phones), 8–12px rows, and 12px from floating tools to the edges. Groups are tight and sections are separated by hairlines rather than extra boxes.

### Named Rules
**The Docked, Not Floating Rule.** Primary surfaces attach to a viewport edge and separate with a 1px hairline. Only small map tools (the layer menu, toasts, hover popups, the loading pill) float. Never float the sidebar, list or timeline as cards with gaps around them.

**The Map Echo Rule.** Anything that stands for a quake outside the map (list rows, detail, toasts, timeline markers, share cards) uses the map's colour for that quake and a proportional size.

## Elevation & Depth

Flat by default. Docked surfaces have no shadow and no blur; depth comes from tonal steps (Station Floor → Drum Black → Raised → Selected) and hairlines. Floating map tools get one small, offset, neutral shadow. The phone bottom sheet gets an upward shadow so it reads as sitting on the map.

### Shadow Vocabulary
- **Map tool** (`box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35)`): layer menu, toasts, hover popups, loading pill.
- **Sheet** (`box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.35)`): the phone bottom sheet only.

### Named Rules
**The No Glass Rule.** No backdrop blur, no frosted panels, no coloured glows (a zero-offset coloured halo or a coloured blurred shadow). Selection on the map is a white ring, not a glow.

## Shapes

Crisp and slightly softened. Buttons, floating tools and alerts use 6px corners. Small controls (layer items, timeline pills) use 4px. Only the phone bottom sheet's top corners are 12px, where it meets the map. Circles are reserved for things that are round in the world: quake dots, the play button and the location marker. Docked surfaces have square corners. The legend bar is 1px-rounded.

## Components

### Buttons
- **Shape:** gently softened (6px).
- **Primary:** Trace Orange with Trace Ink text, weight 600, 8px × 12px padding. Hover lightens to #ff7d55. Use it for one action per view (Share).
- **Secondary:** transparent with a Hairline Strong outline and Chart Ink text. Hover fills Drum Black Raised. Used for Zoom to epicenter and Official report.
- **WhatsApp:** the secondary shape with a green outline (rgba(95, 211, 141, 0.35)) and #7fe0a6 text.
- **Focus:** a 2px Trace Orange outline, 2px offset, on every interactive element.

### Settings rows (source, period, region)
- **Style:** a 52px label column (12px, Graphite Faint), then options as plain text (13px, 500, Graphite).
- **Active:** Chart Ink text with a 2px Trace Orange underline. The ES/EN toggle uses a 1px Chart Ink underline.
- **Actions** (region jumps, Near me): plain text, and hover shows an underline. They have no active state.

### Event list row
- Full-width rows (8px vertical padding), separated by a very faint 1px line. Hover is Drum Black Raised and selected is Drum Black Selected.
- Contents: a magnitude mark (a dot in a fixed 16px slot plus the figure), then the place (500) and a metadata line (12px, Graphite). "CR" is plain Trace Orange Text for Costa Rican agencies, with no chip.

### ¿Tembló? (signature)
- The first thing under the settings: a heading-sized question, not a banner card. It shows the magnitude figure (26px), "¿Tembló?" at 15px/700 with the region in Graphite, the answer line and a sub line.
- **Now state** (a felt quake in the last hour): an Accent Soft fill (rgba(255, 106, 61, 0.14)), with the answer line in Trace Orange Text. **Calm state:** a Field Green dot with no figure.

### Quake detail
- A back button and agency, then the Figure Display magnitude with its dot and magnitude type. After that: the Title place, the "near" line in Trace Orange Text, and the time ago.
- Actions (Share, WhatsApp), then a two-column label/value grid under a hairline, then the effects paragraph under a hairline, then the secondary actions.

### Timeline
- A docked bar with a round 36px Trace Orange play button, a speed pill and a canvas histogram. Played bins are orange (rgba(255, 150, 105, 0.8)) and unplayed ones translucent. Magnitude markers use depth colours. The cursor is Field Green when live and Amber while replaying.
- Then a Live pill and the legend (size key, a 6px depth gradient bar and labels), separated by a hairline.

### Layer tools
- A floating menu (176px, 4px padding) of icon-and-label rows. Active rows show Chart Ink text and a Trace Orange icon; inactive icons are at 70% opacity. On phones it collapses to a single layers button.

### Share cards (1200×630)
- The same system as an image. A solid Drum Black panel (560px) on the left with a hairline edge holds the wordmark, a dot plus "Magnitud" label, the condensed magnitude figure (138px), the place (42px/700), the "near" line in Trace Orange Text and the time and depth. The footer is the site and "Datos: <agency short name>".
- The map is on the right, with the epicenter drawn like the app's selected quake: filled dot, white ring and two faint wave rings. No glow and no gradient fade.

## Do's and Don'ts

### Do:
- **Do** dock primary surfaces to the viewport edges and separate regions with 1px hairlines (rgba(236, 228, 216, 0.09)).
- **Do** set every magnitude as a condensed tabular Archivo figure with a map-coloured dot.
- **Do** keep Trace Orange for the primary action, active selection and real recent events. Use Trace Ink (#1c0e08) for text on it.
- **Do** write sentence-case labels in Spanish first, and check every layout with the longer Spanish strings.
- **Do** make urgency proportional and factual: "Sí · hace 5 min" in Trace Orange Text beats any alarm styling.
- **Do** keep transitions at 120–250 ms with ease-out (cubic-bezier(0.25, 1, 0.5, 1)), and respect prefers-reduced-motion.
- **Do** theme the browser surfaces too: text selection (Trace Orange at 35%), thin warm scrollbars, the Trace Orange caret and focus ring.

### Don't:
- **Don't** use frosted glass, backdrop blur, coloured glows, gradient text or gradient banners.
- **Don't** float the sidebar, list or timeline as rounded cards with gaps and soft shadows.
- **Don't** put magnitudes, statuses or tags inside coloured tiles, chips or pills.
- **Don't** use uppercase letter-spaced eyebrow labels, or pulsing "live" dots and badges.
- **Don't** use Inter, Roboto, Geist, Space Grotesk or any second typeface. Archivo carries everything.
- **Don't** use cool navy or blue-grey neutrals.
- **Don't** imitate official alerts: no siren-red full-width banners, no warning iconography beyond the tsunami and PAGER notes, and no OVSICORI, RSN-UCR or CNE colours or logos. Sismo is not an alert service.
- **Don't** use bounce or elastic easing, or animate anything that isn't a state change.
