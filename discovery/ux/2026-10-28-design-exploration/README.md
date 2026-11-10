# Research Scout: six design directions

**October 28, 2026 · standalone HTML proposals for review**

Open [the gallery](index.html), then compare:

**Round 2 — three additional concepts, created after the first round was not accepted:**

4. [Lumen](prototype-04.html): a Radix/shadcn-informed two-column reading desk with a persistent reader and quiet violet accents.
5. [Forma](prototype-05.html): an Apple HIG/Spectrum/React Aria-informed three-pane library, using warm stone and forest selection.
6. [Signal Board](prototype-06.html): a Carbon/Fluent-informed spatial source collection, graphite/coral identity and a continuous shortlist tray.

Three independent designer subagents researched and authored these additional concepts. [Round 2 review](round-2-design-review.md) records the new references and design changes; [round 2 validation](round-2-validation.md) records the actual checks. No concept or component library has been selected.

**Round 1 — retained byte-for-byte for comparison:**

1. [Cobalt Studio](prototype-01.html): expressive Material-inspired blue, tonal grouping and a practical everyday workspace.
2. [Fieldnotes](prototype-02.html): warm editorial paper/ink, a reading-led composition and serif heading voice.
3. [Midnight Observatory](prototype-03.html): a compact dark research console with pale blue actions and readable state colors.

The user asked a **UX Design Researcher** to research attractive frontend practices and build three variants. A second **UX Inspiration Researcher** supplied first-party examples, accessibility guidance and component mapping. Root integrated the comparison gallery and independent browser/visual review.

Those first three were not accepted by the user. Their earlier recommendation is historical, not a selected direction. The [original gallery](index-round-1.html), research and receipts remain available; [preservation hashes](round-1-preservation.json) record the unchanged HTML files.

These concepts use current guidance to propose a 2027 direction; no source can establish next year's “best” designs in advance. [Research and design rationale](research-and-design-rationale.md) and [inspiration/accessibility notes](inspiration-and-accessibility.md) distinguish sourced observations from design judgments. They include Material Design, Material UI, Linear, Geist and W3C references.

## Review locally

Each prototype is standalone HTML with embedded styles, scripts and SVG. Double-click it to open locally. The gallery and its screenshots use relative local files. No installation or provider connection is required.

For an optional browser URL, run from the repository root using a free port:

```bash
.venv/bin/python -m http.server 3200 --bind 127.0.0.1 --directory discovery/ux/2026-10-28-design-exploration
```

Then open `http://127.0.0.1:3200/`. This serves only the design exploration folder. It is separate from the Research Scout application on port 3100. If the port is already occupied, choose another free port.

The review tasks are: read the question/provider scope; inspect an available source; include it; and replay the simulated progressive search. Compare the information hierarchy, color intensity, reading comfort, icon clarity, inspector and mobile layout. The prototypes do not call providers, run agents or persist application state. Their records and interactions are fictional demos. This exploration does not change production frontend code or select a component library.

## Validation

[Round 2 validation](round-2-validation.md) and its [browser receipt](round-2-checks.json) cover the new three plus the six-concept gallery. [Round 1 notes](validation.md) and [receipt](prototype-checks.json) preserve the earlier checks. The [screenshots](previews/) are local prototype evidence, not a complete WCAG audit or participant usability study.

To reproduce the capture/contrast/layout check with the existing project toolchain:

```bash
.tools/node/bin/node discovery/ux/2026-10-28-design-exploration/verify-prototypes.mjs
.tools/node/bin/node discovery/ux/2026-10-28-design-exploration/verify-round-2.mjs
```

The script uses the existing Playwright installation and local full Chromium browser. It opens `file:` pages, checks that they make no HTTP requests, inspects sampled rendered text on solid backgrounds, tests basic semantics and renders desktop/mobile/narrow screenshots. Manual interaction and visual review are reported separately.
