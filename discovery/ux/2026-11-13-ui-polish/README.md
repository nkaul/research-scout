# Research Scout UI refinement — three standalone directions

Created November 13, 2026 for design review. **These are mockups, not an application redesign.** The currently implemented Dub-inspired UI remains the product baseline. The user can refine or combine these directions before implementation.

**Updated hybrid:** the user prefers Refined with Workbench's retrieval focus/query transparency and requests a performance bar plus Material color chips. [Review the updated four-state mockup](hybrid-review.html), [open it full width](hybrid-refined-v2.html), or read the [design notes and retained functions](hybrid-design-notes.md). These are four states of one coherent design, not four new visual directions. The earlier three concepts below remain preserved.

[Open the comparison gallery](index.html). When the local preview server is running, use **http://127.0.0.1:3133/**. Each HTML file also opens directly in a browser without installation or network access.

| Direction | Intended improvement | Review |
| --- | --- | --- |
| A — Refined Workspace | Closest to the current UI; clearer typography, consolidated controls, consistent source cards and a concise reader. Suggested starting point. | [Interactive](variant-a-refined.html) · [Desktop](previews/variant-a-desktop.png) · [Mobile](previews/variant-a-mobile.png) · [Notes/sources](variant-a-notes.md) |
| B — Precision Workbench | Fast evidence scanning, aligned actions, explicit query intent and compact provider/access context. | [Interactive](variant-b-workbench.html) · [Desktop](previews/variant-b-desktop.png) · [Mobile](previews/variant-b-mobile.png) · [Notes/sources](variant-b-notes.md) |
| C — Reading Studio | Editorial paper titles, calmer surfaces, readable source points and a deliberately separated reading column. | [Interactive](variant-c-studio.html) · [Desktop](previews/variant-c-desktop.png) · [Mobile](previews/variant-c-mobile.png) · [Notes/sources](variant-c-notes.md) |

## Confirmed frontend stack

The working frontend is **Next.js 16.4.3, React 19.3.1 and TypeScript**, using the App Router. [package.json](../../../frontend/package.json) pins the versions. [src/app/page.tsx](../../../frontend/src/app/page.tsx) renders the [ResearchWorkspace component](../../../frontend/src/components/research-workspace.tsx), while [src/app/layout.tsx](../../../frontend/src/app/layout.tsx) defines the root layout. The current app uses custom CSS and its existing icon components; no Material UI, Ant Design or other new component library is selected by this review. The standalone prototypes use plain HTML/CSS/JavaScript for quick comparison, not a replacement technology stack.

## Shared design judgments

The current screenshots show several stacked search/settings/status surfaces before results, many small secondary labels and competing borders. The proposals address those specific problems:

- Consolidate query, source/date/count settings and result display controls into a small number of predictable areas.
- Use clearer title/body/secondary-text hierarchy, darker functional text and blue primarily for selection and primary actions.
- Align per-resource icons into one row with accessible names, visible focus and tooltips. Keep source, provider observations and open-access status distinct.
- Make the right-hand reader add useful source text, authors and provenance with only a compact repeated title/publication.
- Retain Papers/Videos tabs, visible video count, date presets/custom range, source selection and explicit caption/playback actions.
- Show atom/skeleton feedback during simulated retrieval and preserve the research question while inspecting results.
- Support keyboard use, reduced motion and narrow screens without compressing the desktop interface into unreadable text.

These are design hypotheses informed by the primary design/accessibility guidance linked in each agent's notes. Browser checks establish that the mockups render and their local interactions work; they do not establish usability gains or a complete WCAG conformance result.

The recommended first refinement is A's familiar layout, with B's visible query intent/provenance where useful. C is an alternative for evaluating a more editorial reading experience. No choice or hybrid has been adopted into the application.

## Preview behavior and limits

Try Papers/Videos, pointer/keyboard source selection, source/date settings, abstract expansion, notes and project-save feedback. Playback, transcripts, PDFs and Search are clearly labeled simulations. Records, counts, timing, access badges and research summaries are illustrative. No provider/model calls, real saves or credential access occur. The prototypes do not validate research findings, identifiers or actual access locations.

The existing repository Playwright/Chromium toolchain renders the mockups directly from `file://` URLs. Per-variant notes report interaction and desktop/mobile checks. The comparison gallery has its own browser check and screenshot. This review adds no dependency or app UI implementation.

To serve only this design directory, from the repository root:

```sh
.tools/node/bin/node discovery/ux/2026-11-13-ui-polish/serve-preview.mjs
```

The preview server listens on loopback port 3133, permits read-only HTML/PNG/Markdown requests within this directory, and has no application/API proxy. `SCOUT_PREVIEW_PORT` can select another unused port.
