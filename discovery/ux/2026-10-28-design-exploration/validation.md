# HTML design exploration: validation and review

**October 28, 2026 · standalone prototypes, not production acceptance**

All three concepts and the gallery were rendered in the project's existing full Chromium browser. The final [machine-readable receipt](prototype-checks.json) passes. The [capture/check script](verify-prototypes.mjs) is reproducible with the local Node/Playwright toolchain; it made no application/provider/model requests.

## Checks completed

| Check | Result and scope |
| --- | --- |
| Responsive renders | **12/12 passed**: three concepts plus the gallery, each at 1440px desktop, 390px mobile and 320px narrow width. No horizontal page overflow. |
| Rendered text contrast | **909 sampled text instances passed** the applicable normal/large-text thresholds across those repeated responsive views. These are rendered instances, not 909 unique colors or a complete audit. |
| Basic semantics | One page heading and declared English language per page; no unnamed visible buttons or unlabeled visible form controls in these checks. No broken images. |
| JavaScript / offline behavior | Zero page JavaScript errors and zero HTTP(S) requests while opening the concepts as local files. All icons/styles/scripts are local or embedded. |
| Reduced motion | Reduced-motion preference enabled during captures; no active CSS animations observed in the tested views. |
| Demo interactions | **6/6 passed**: every concept at desktop and mobile widths. Early source use, stable keyboard focus as a new row arrives, inspection, human selection/reason, simulated registry gating, Escape/focus return and synthetic Markdown download. |
| Human note/export | The exact typed reason survives new arrivals, reopening the inspector and the downloaded, explicitly fictional demo shortlist. |
| Visual review | Root and the supporting researcher reviewed actual desktop/mobile images, including the narrow layout. The final corrected concepts were visually inspected again. |
| Application isolation | All 40 application/test/dependency files covered by the existing Increment 1 source receipt remained byte-identical. No production frontend/backend changes, library installation or live-provider trial occurred. |

The file-mode network check distinguishes prototype behavior from the optional local preview server. Opening the gallery at `http://127.0.0.1:3200/` naturally loads its HTML/images from that local server; the concept scripts still make no research, analytics, font or model calls.

## Refinements made during review

- Increased critical bibliography/metadata to 12px, source excerpts to 14px and primary action labels to 12px. Decorative eyebrows remain smaller.
- Corrected variant theme inheritance so Fieldnotes actually uses its warm paper surface and Midnight's headings, counters and controls use the appropriate light foregrounds. Corrected a low-contrast dark-theme breadcrumb token.
- Replaced clipped one-line questions with wrapping, auto-sized textareas. The whole central question is visible on narrow screens.
- Kept Midnight's plain-language partial/semantic-running status beside the feed when the full activity panel stacks below it on mobile.
- Kept source row identity and focused controls stable as new demo rows arrive. The modal inspector restores its opener after its native close event.

## Visual comparison and recommendation

| Concept | Desktop | Mobile | Main judgment |
| --- | --- | --- | --- |
| Cobalt Studio | [Preview](previews/prototype-01-desktop.png) | [Preview](previews/prototype-01-mobile.png) | The clearest evolution of the recorded blue identity, with a confident composer and an immediately understandable research workspace. |
| Fieldnotes | [Preview](previews/prototype-02-desktop.png) | [Preview](previews/prototype-02-mobile.png) | The strongest editorial alternative: warmer atmosphere, distinctive serif titles and less card framing around sustained reading. |
| Midnight Observatory | [Preview](previews/prototype-03-desktop.png) | [Preview](previews/prototype-03-mobile.png) | A distinct focused/dark preference, with useful operational status. It should remain a considered preference rather than an assumed universal improvement. |

**Suggested starting direction: Cobalt Studio**, borrowing Fieldnotes' reading hierarchy and Midnight's clear branch status as desired. This recommendation is a design judgment from the two reviewers; it is not a participant preference result or a selected production direction.

## Limits

These are authored HTML mockups with three fictional records, simulated 1→2→3 arrivals and in-memory human notes. The question/year controls do not retrieve or genuinely filter data. The DOI action simulates one separate registry observation; it does not implement actual agency resolution. No scientific-validity, full-text or search-quality claim follows from a polished screen.

Contrast sampling covers the tested visible text on computable solid backgrounds, with alpha compositing. It is not exhaustive across hover/focus/error states, modal content, every control boundary or parent-opacity effect. Native focus/dialog behavior and representative interactions were checked in Chromium; Safari/Firefox, screen readers, forced colors, 400% zoom and participant usability remain untested here. This report does not claim complete WCAG conformance.

The existing Increment 1 Python/browser suite was not rerun for this isolated HTML exploration, because application/test code was unchanged. The tests above validate these prototypes specifically. See [research rationale](research-and-design-rationale.md) and [sources/accessibility guidance](inspiration-and-accessibility.md) for the evidence behind the design proposals.
