# Direction A — Refined Workspace

November 13, 2026. **Standalone interactive design mockup; no application implementation.** All result text, counts, timing values, provider records, authors, video art and transcript text in this preview are illustrative. It makes no API/model calls. PDF/source/playback actions explicitly report their mockup status.

[Open HTML](variant-a-refined.html) · [Desktop preview](previews/variant-a-desktop.png) · [Mobile preview](previews/variant-a-mobile.png) · [Videos preview](previews/variant-a-videos.png)

## Design intent

This is the closest of the three directions to the working Dub-inspired light workspace. It keeps the left navigation, familiar Papers/Videos tabs and nonmodal source reader, then tightens the hierarchy rather than replacing the product's interaction model.

The current screenshot has several stacked header, scope, filter and report areas competing with the research. Here the question and next-search controls share one compact surface. Results get one tab row, one quiet status line and a local result filter. The blue accent is reserved mainly for Search, active navigation, the selected paper and Save. Green means access availability rather than relevance or quality.

Paper titles use 16px, abstracts/key points 14px with generous line height, and secondary reader/byline text 12px. Icon actions have 32px desktop/mobile targets; standard inputs/buttons are generally 34–39px. A single icon row keeps Preview, Save, Original source, PDF preview and Download together. The provider-record count is a separate provenance disclosure rather than another repeated content block. Default preview is selection-driven; a focused note field pauses hover changes.

The reader keeps a small title/publication, switches between key points and original abstract, and places authors/affiliation below the source text. Metadata and Notes are separate accessible tabs. Videos retain compact thumbnails plus descriptions, with explicit playback and transcript actions. Atom and skeleton states are available through the mock Search button. Source choice, date slider/custom years and video count remain visible next-search controls.

On narrow screens the sidebar collapses and the reader becomes an inline section below results. Explicit Preview scrolls to it; content remains available without a modal. This mobile arrangement should be evaluated against the other directions before implementation.

## Verified guidance and its application

These are primary documentation sources checked November 13. The layout decisions above are design recommendations for Research Scout, not claims that a particular visual arrangement has been proven by user testing.

- [Fluent 2 layout](https://fluent2.microsoft.design/layout): proximity, consistent spacing, alignment and responsive reflow establish relationships. Applied through one grouped search surface, aligned icon rows and a results/reader grid that collapses at narrower widths. No Fluent package is added.
- [Fluent 2 typography](https://fluent2.microsoft.design/typography): uses a type ramp with a 14px web body and 12px caption level, native system fonts and left-aligned longer copy. Applied to abstracts, reader text and bylines; the mockup needs no font downloads.
- [WCAG 2.2 contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): normal text requires at least 4.5:1 contrast under SC 1.4.3. The principal authored pairs were calculated from CSS colors: abstract `#4e5f75` on white **6.53:1**, secondary `#536176` on white **6.29:1**, white on action blue `#1565c0` **5.75:1**, blue `#1455a0` on selected tint `#edf4ff` **6.69:1**, access green `#166c4d` on `#eef8f3` **5.89:1**. Muted text was darkened after checking the surface pair. This is targeted color checking, not a full WCAG conformance audit.
- [WCAG 2.2 minimum target guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): SC 2.5.8 specifies a 24×24 CSSpx minimum with defined exceptions. The primary icon row exceeds that at 32px; larger touch targets remain a useful refinement for mobile.
- [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): active tabs expose selection, relationships and a roving tab stop. Papers/Videos and Overview/Metadata/Notes support Left/Right/Home/End; native buttons also support Enter/Space. Reduced-motion preferences stop decorative animation.

## Mockup interactions checked

Local Chromium rendered the file directly, separate from Research Scout services. Checks passed for: abstract expansion; original-abstract switch; local Save feedback; local note save; keyboard resource tabs; explicit transcript; source-count updates; custom dates; text filtering; Search skeleton then completion; mobile navigation/Escape; and no horizontal overflow at 1440px or 390px. No page JavaScript errors were observed.

Desktop, Videos and 390px mobile screenshots were inspected. This validates the prototype's interactions/layout only; it does not validate live providers, ranking, PDF delivery, captions or production persistence.

## Refinements to review

1. Is this amount of card density comfortable, or should more abstracts be visible by default?
2. Should the mobile reader stay inline or become a dedicated, reversible detail view?
3. Should “Coverage” remain in the toolbar or become a status-line disclosure?
4. Which paper actions deserve visible text rather than icon tooltips?

No component-library or framework change is proposed. A selected direction can be implemented with the existing Next.js/React/TypeScript/CSS setup after review.
