# Round 2 prototype validation

**October 28, 2026 · three additional HTML concepts plus the six-concept gallery**

The final [browser receipt](round-2-checks.json) passes. Root independently rendered and reviewed the three concepts produced by separate designer subagents. The [reproducible script](verify-round-2.mjs) tests these independently authored layouts with concept-specific interaction journeys rather than requiring them to share a template.

| Check | Result |
| --- | --- |
| Responsive capture | **12/12 passed**: Lumen, Forma, Signal Board and the updated gallery at 1440px desktop, 390px mobile and 320px narrow width. |
| Demo journeys | **6/6 passed**: each new concept at desktop and mobile widths. |
| Text contrast sampling | **817 rendered text instances passed** the applicable normal/large-text contrast thresholds across the repeated responsive views. Decorative elements marked `aria-hidden` and disabled controls are excluded. These are instances, not 817 unique tokens or a complete audit. |
| Layout/semantics | No page-level horizontal overflow, duplicate IDs, unnamed visible buttons, unlabeled visible inputs or broken images in the checked views. Forma's explicitly indicated mobile source strip scrolls within its own region. |
| Offline/error checks | Zero JavaScript page errors and zero HTTP(S) requests when the pages are opened as local files. |
| Reduced motion | Captures used reduced-motion preference; no active CSS animations were observed in the checked views. |
| Visual review | Actual desktop and mobile screenshots reviewed for each concept; gallery reviewed with all six present. |
| Preservation | The original three HTML files remain byte-identical. The original gallery is preserved as [index-round-1.html](index-round-1.html); [preservation hashes](round-1-preservation.json) record the original files. |
| Production isolation | All 40 application/test/dependency files in the existing Increment 1 source receipt remain byte-identical. No application UI/backend modification, dependency installation or live-provider trial. |

## Interaction evidence

**Lumen:** select a source into the persistent reader; write and retain a personal note; explicitly include it; replay staged arrivals; keep note focus and value while another source arrives; reopen the source details; download the labeled fictional shortlist with the exact note. The mobile flow uses the visible Explore action when the separate desktop replay button is hidden.

**Forma:** start the two-to-four-record progressive replay; use the reader's note view; include a source; retain source-row keyboard focus as later rows arrive; revisit a note; show the metadata-only gap for the fourth record; download the labeled fictional shortlist with the note. Duplicate SVG/control IDs found during early review were corrected before the final checks. The displayed question wraps fully on narrow screens, and the source strip has a swipe affordance.

**Signal Board:** replay one-to-three arrivals; keep a checkbox focused as another tile appears; open the native inspector; require human inclusion before a separately labeled registry simulation; retain the reason; close with Escape and restore the opener; switch board/list views; download a fictional shortlist containing the exact reason. The emphasized tile is explicitly the first available source, not a quality ranking.

## Actual previews

| Concept | Desktop | Mobile | 320px |
| --- | --- | --- | --- |
| [04 · Lumen](prototype-04.html) | [Image](previews/prototype-04-desktop.png) | [Image](previews/prototype-04-mobile.png) | [Image](previews/prototype-04-narrow.png) |
| [05 · Forma](prototype-05.html) | [Image](previews/prototype-05-desktop.png) | [Image](previews/prototype-05-mobile.png) | [Image](previews/prototype-05-narrow.png) |
| [06 · Signal Board](prototype-06.html) | [Image](previews/prototype-06-desktop.png) | [Image](previews/prototype-06-mobile.png) | [Image](previews/prototype-06-narrow.png) |
| [All six concepts](index.html) | [Image](previews/index-round-2-desktop.png) | [Image](previews/index-round-2-mobile.png) | [Image](previews/index-round-2-narrow.png) |

## Interpretation and limits

These checks establish the basic behavior and appearance of authored mockups. They do not establish that the user prefers a direction, that a framework is selected, or that a polished screen demonstrates retrieval quality. Each designer's primary-source research and design interpretation is recorded separately: [Lumen](design-04-radix.md), [Forma](design-05-apple.md), [Signal Board](design-06-carbon.md).

The text sampler checks tested visible text on computable solid backgrounds with alpha compositing. It does not exhaust every hover/focus/error state, inspector state, graphic, control boundary or parent-opacity effect. Safari/Firefox, screen readers, forced-colors behavior, 400% zoom and participant usability were not part of the combined root checks. No complete WCAG conformance claim is made.

All records, authors and example prose are illustrative; replay uses fixed samples and authored delays. The concepts have different topics and record counts, so this is a visual exploration rather than a controlled usability experiment. Notes/selections are in-memory. Forma's displayed query is read-only; editable queries in Lumen/Signal Board do not perform real retrieval. No provider/model/registry call occurs. Serving the gallery over local HTTP naturally loads local HTML/images; the concept scripts still perform no research or analytics requests.

Round 1 receipts remain historical generation-time evidence. Their original `index.html` hash is preserved by `index-round-1.html`; the root `index.html` intentionally changed to include all six concepts. The [round 2 artifact receipt](round-2-artifact-receipt.json) binds the current files and checked evidence. The backend/production browser suite was not rerun because its source files were unchanged.
