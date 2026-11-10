# Trial review and validation

**October 29, 2026 · standalone HTML only · passed**

Three independent agents created the Linear, Cal.com and Dub directions. The parent agent reviewed the rendered layouts, requested refinements and ran the final checks. The [gallery](index.html) is served locally at <http://127.0.0.1:3201/2026-10-29-linear-cal-dub-trials/> while the review server runs.

## Browser evidence

[verify-trials.mjs](verify-trials.mjs) uses the project's existing Playwright and full Chromium installation. The [machine-readable results](trial-checks.json) cover **12 page/viewport combinations**: three trials plus the gallery at **1440 × 1100**, **390 × 844**, and **320 × 900**. All passed:

- No JavaScript errors, external HTTP requests, horizontal document overflow, broken images, duplicate IDs, unnamed visible buttons or unlabeled visible inputs in the initial layouts.
- One page heading and an English document language; a keyboard focus entry point; no active CSS animations under the reduced-motion preference.
- **835 rendered text/background samples** met the automated contrast thresholds. Six samples over non-solid backgrounds were unmeasured. This check covers initial rendered states and solid-background composition, not every overlay, hover state or parent-opacity interaction.

**Six interaction flows**—each trial at desktop and phone widths—checked early source review while further fictional results arrive, source selection, shortlist membership, source notes and their focus/state retention, filters, and display/search preferences. Desktop exports for all three and phone exports for Cal/Dub retained the human note and explicit fictional-data markings. The Linear phone layout hides its desktop export action; that export route was not tested on phones. Narrow 320px coverage is layout-only.

The [previews folder](previews/) contains desktop, phone and narrow screenshots plus reader-state captures. Full-page captures of fixed mobile readers can include the underlying document below the viewport; the interactive reader itself is a viewport surface. These are local mockup checks, not production acceptance, a complete accessibility audit, cross-browser testing, live-provider evaluation or participant research.

## Visual review

The parent agent inspected all three desktop compositions, phone layouts, reader states and narrow layouts, plus the final gallery. Refinements addressed pale metadata, small reading text, focus loss when result lists update, a closed navigation dialog leaking into the page, mobile access to the source reader, and gallery thumbnail proportions.

| Direction | Review character |
| --- | --- |
| Linear | The most compact workspace: quiet lavender accents, structured source scanning and a persistent reader. Phones use a source sheet. |
| Cal.com | More space around the question and source summaries; visible scope controls on desktop and a focused reading dialog. Phones offer a shortcut to the scope controls. |
| Dub.co | Crisp slate controls and a source-index/preview split, with overview, metadata and notes kept together. Phones move the preview below the source list and scroll to it on selection. |

All data and arrival sequences are illustrative. No visual direction is selected. Settings and search controls affect this page session only and do not change the running application or contact any provider.

## Scope preservation

All **40 application/test/dependency source files** listed in the existing [implementation receipt](../../../docs/validation/implementation-receipt.json) remain byte-identical. All **eight earlier HTML files** in the prior exploration folder also remain byte-identical. The [artifact receipt](artifact-receipt.json) records those preservation checks and hashes of the new review artifacts. No production application, dependency, provider, backend or architecture implementation was changed. The UX index and design-research record link this new exploration.

To repeat the mockup checks from the repository root:

```sh
.tools/node/bin/node discovery/ux/2026-10-29-linear-cal-dub-trials/verify-trials.mjs
```

The browser cache and Playwright dependencies must already be present in `frontend/`. No production test suites were rerun for this artifact-only task.
