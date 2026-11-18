# Variant C — Reading studio

[Open the interactive mockup](variant-c-studio.html) · [Desktop preview](previews/variant-c-desktop.png) · [Mobile preview](previews/variant-c-mobile.png) · [Mobile reader](previews/variant-c-mobile-reader.png)

This is a standalone design proposal, created November 13, 2026. It does not change the Next.js application or connect to providers. All records, reading points, source availability, projects, video playback and transcripts are illustrative. Paper titles and identifiers provide realistic layout material; this is not a retrieval-quality evaluation or a verified bibliography.

The direction retains the light sidebar, material blue actions, Papers/Videos separation, compact controls and nonmodal reader of the existing Dub-inspired product. Georgia paper titles give the results an editorial reading character; the rest of the interface uses system sans-serif. Color is concentrated in selection, navigation and the search/save actions. Outlined cards, quieter dividers and shared baselines separate information without making every item compete for attention.

Changes proposed for review:

- One search field and one control strip hold source scope, publication-year slider/custom range and visible video count. The question stays mounted while reading.
- Source names/year share a compact line above each title. One aligned action row holds preview, save, original source, PDF/video and download/transcript controls, with access and provider-record counts at the other end.
- The reader shows a compact title/publication, sample reading points, then authors. Original source observations sit behind an explanatory disclosure. DOI grouping is distinct from the number of provider observations.
- Row pointer intent updates the reader after a short delay; keyboard focus does the same without moving focus. Note editing pauses passive updates.
- On narrow screens, the sidebar becomes a menu and the reader opens inline above results. Search and filters remain present.
- A simulated search shows an atom and skeleton rows; playback and sample captions require explicit actions. Saving produces clear, local-only feedback.

## Guidance used

[WCAG 2.2 contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) informed darker text and the restrained blue palette. The guideline requires 4.5:1 for ordinary text and 3:1 for qualifying large text. Functional secondary labels are generally at least 12px, reader body text is 14px and paper titles are 20px on desktop. This is not a complete accessibility audit.

[WCAG 2.2 target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) informed 32px icon action targets and a visible focus outline. The Level AA minimum is 24×24 CSS pixels, subject to the criterion's exceptions; compact text actions have at least 24px height.

[Nielsen Norman Group's progressive disclosure guidance](https://www.nngroup.com/articles/progressive-disclosure/) informed the separation between frequent search controls and secondary provider observations. Sources, dates, tabs and count remain visible; identifiers, record detail and original text are available on request. This application of the guidance is a design judgment, not a tested improvement claim.

## Mockup validation

Rendered and inspected with the repository's existing full Chromium/Playwright on November 13, 2026, using a `file://` URL. No framework installation, API calls or application edits were required.

Fourteen interaction checks passed: initial paper cards; abstract expansion with focus retained; keyboard row intent; delayed mouse row intent; pause during note editing; separate Videos tab and explicit simulated playback; explicit sample-caption loading; project-save feedback; bounded visible video count; year slider filtering; custom-range filtering; source filtering; atom/skeleton loading; and the mobile inline reader. There were zero browser JavaScript errors and zero HTTP requests. Desktop 1440×1000 and mobile 390×1000 rendering had no horizontal overflow. Screenshots are full-page captures.

Some controls intentionally explain their destination instead of opening another page: project/history navigation, original source links, PDF/download actions and settings. Notes and saves last only until the page is refreshed. The sample search uses a fixed small dataset; it does not interpret the query or call an LLM. This keeps the artifact suitable for visual refinement without suggesting new backend behavior has been implemented.
