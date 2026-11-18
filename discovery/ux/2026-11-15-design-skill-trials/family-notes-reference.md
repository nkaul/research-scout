# DataPulse Research Workspace

November 15, 2026. One reference adaptation within the seven local design trials. This is a review artifact, not an adopted Research Scout interface.

## Source and inspection

- Supplied reference: [DataPulse SaaS analytics demo](https://www.uupm.cc/demo/saas-analytics-dashboard#features).
- The hero, features section and full page were rendered in an isolated Chromium session and visually inspected. The page is a marketing landing page containing an analytics preview, pricing and promotional sections. Product interactions were not verified.
- Computed reference styles include Poppins headings, Open Sans demo content, 16px feature-card corners, 24px feature-card padding, pale blue borders and restrained blue-tinted shadows. These observations informed this trial; they are not dependencies imported into it.

## Adaptation

The reference's white cards, cool canvas, navy hierarchy, colored line icons and soft depth become a compact research workspace. A slightly wider reader, rounded geometric heading treatment and more generous source-card interiors distinguish this direction from the tighter workbench variants. The resource tabs use a quiet segmented rail; selection, source actions and automatic AI focus remain easy to find.

The primary action remains Material blue. Violet is reserved for the AI focus treatment. Existing semantic chips keep their meaning. Counts remain in the four resource-tab badges, rather than adding another metric row. The sidebar, original question, compact settings and information icons, visible timing, four resource types, saved-only reader affordances, Notes and local preview loading are preserved through the common renderer.

The stylesheet uses local font stacks: Avenir Next/Trebuchet MS for the interface and headings, and Open Sans/Segoe UI/Arial for reading. No font binaries, images, scripts, copy, marketing claims or analytics graphics are copied from the reference. All line icons and example data come from the locally authored shared renderer; this variant has no external asset dependency.

## Review tradeoff

The card padding and reading rhythm are more relaxed than today's dense results. That can show fewer source rows at once, so selection and the right reader carry more weight. The trial deliberately keeps the search and toolbar compact; the reference's large landing-page hero spacing is not carried into the research workflow. Compare long titles, reader scrolling and phone-width controls before selecting this direction.

## Files and behavior

- Entry: `datapulse-workspace.html`.
- Theme: `styles/datapulse-workspace.css`, layered after `shared/base.css`.
- Example content and interactions: the same `shared/mockup.js` used by all seven trials.

The preview uses authored example content and local state. It makes no research/provider/model requests and does not modify the application, credentials, saved research or model ledger. Its local tab, reader, expansion, Notes and loading controls demonstrate the proposed presentation only.

## Visual review

The rendered desktop/mobile variant and seven-direction gallery were inspected. Theme-only corrections make the complete example question visible on phones, keep the toolbar and resource tabs within a 320px viewport, and fit the wordmark into the narrower tablet sidebar. Subsequent local Chromium checks at 320, 390, 768 and 1440px found no horizontal page overflow, clipped example question or clipped visible sidebar wordmark. These checks establish layout behavior for the authored examples, not live research functionality.
