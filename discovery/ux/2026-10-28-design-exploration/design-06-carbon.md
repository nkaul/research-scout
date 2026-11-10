# 06 · Signal Board

**Research Scout design study · October 28, 2026 · a standalone HTML concept**

[Open Signal Board](prototype-06.html) · [Compare all concepts](index.html)

Signal Board treats research as a working collection: a compact question above a deliberately asymmetric source grid, with the human shortlist gathered into one graphite tray. Coral supplies identity and selection; typography, alignment and spatial grouping do most of the work. It is a new composition, rather than another palette on the old sidebar-and-cards screen.

The lead tile is the **first available source**, not a recommended source or a quality ranking. The spatial board, its alternative list view and the full-width tray are proposed presentation patterns. They do not claim new backend behavior, source grouping, research conclusions or implemented production functionality. The source set remains OpenAlex-only, with lexical and semantic branches within that provider.

## What the framework research contributed

Primary references were opened and checked on **October 28, 2026**. Dates below are publisher-supplied update dates where present. Retrieval does not establish a publication date. These are current foundations for a possible 2027-facing design, not a prediction of award winners or a claim that a future framework is already available.

| Official reference | What it establishes | Original application in this concept |
| --- | --- | --- |
| [Carbon / IBM 2x Grid](https://www.carbondesignsystem.com/building-blocks/foundations/2x-grid/overview), updated September 25, 2026 | An 8px mini unit establishes visual rhythm. Grid behaviors should respond to the content and how people need to use the available space. Closely related content may use tighter gutters. | A shared alignment runs through question, collection, tile content and tray. Larger desktop padding uses 24/32/40px; the collection uses a 16px gap. One large reading tile plus two compact tiles makes more of the working content visible without three equally emphatic panels. This authored CSS is not Carbon’s grid implementation. |
| [Carbon Tile guidelines](https://www.carbondesignsystem.com/building-blocks/core/components/tile/guidelines), updated September 30, 2026 | Tiles group related content without decorative elevation. Interactive selection needs an operable, visible selection affordance. Tile variants have different jobs; a whole surface is not automatically the right click target. | Flat source tiles have hairline boundaries, an explicit checkbox and distinct title/Inspect actions. A selection stripe reinforces the checked state. There are no floating-card shadows, chart placeholders or pseudo-analytical confidence meters. The original HTML does not install Carbon or claim identical component semantics. |
| [IBM Design Language: type basics](https://www.ibm.com/design/language/typography/type-basics/) | Flush-left alignment, measured line lengths, considered leading and restrained emphasis improve the organization of reading. Headlines can form compact multiline units. | Strong left-aligned titles create the main visual personality. The larger leading title is balanced by quieter bibliography and a readable excerpt. A native sans-serif stack keeps the sample offline; IBM Plex is neither embedded nor imitated. The deliberate tightness of this Arial title treatment is our choice, not IBM’s Plex-specific tracking recommendation. |
| [Fluent 2: color](https://fluent2.microsoft.design/color) | Neutral, brand and semantic palettes have separate jobs. Brand color should be used deliberately; statuses should be accompanied by other cues. Focus needs a distinct stroke. | Graphite/white establish hierarchy; coral marks human selection and important actions. Green and amber are limited to named operation states. A check, clock and text communicate progress; source selection is also a real checkbox. Focus uses a purple outline on light surfaces and peach on graphite surfaces. These are original theme tokens, not Microsoft’s palette. |
| [Fluent 2: layout](https://fluent2.microsoft.design/layout) | Spacing describes relationships. Density needs to be balanced with resting space, and responsive layouts should suit their content. The guidance includes touch-target considerations. | The upper question and activity form one group; the collection and tray form another. Narrow screens stack the source cards and shortlist slots instead of squeezing them into columns. Main controls have at least a 44px target, including the compact view switch. |
| [Fluent 2: iconography](https://fluent2.microsoft.design/iconography) | Icons should carry recognizable meaning. Small informational icons are different from controls that require interaction, and icon color needs restraint. | Original inline SVGs are used for layers/provider scope, documents/content, bookmark/shortlist and download/export. Decorative duplicates are hidden from assistive technology. View and replay controls have action-specific accessible names. No icon package, font or remote asset loads. |

The coral palette is a deliberate Research Scout exploration. IBM’s own brand uses blue centrally; its documented palette is not a requirement to recolor this concept blue. This study borrows structural and interaction principles rather than presenting an IBM or Microsoft product screen.

## Design decisions worth reviewing

- **Composition:** one strong source-reading region and two compact discovery observations, followed by a continuous selected-source tray. This tests whether a spatial collection feels more engaging than a uniform vertical feed.
- **Hierarchy:** question at 30px on the standard desktop; leading source title at 37px; compact source titles at 23px; bibliography at 12–13px; excerpts at 14–15px. The type scales at smaller widths. Secondary operational labels remain 11–12px. There is no marketing masthead or empty hero region.
- **Selection:** the checkbox is the act of inclusion. Opening an inspector does not silently include a source. The tray makes the three-source limit and the human’s decisions visible.
- **Density:** the optional list view keeps the same source IDs and arrival order. It removes the large excerpt from the collection while retaining source titles, bibliography and inspection. Both views open the same inspector.
- **Reading:** the inspector is a native modal dialog attached to the right edge. It separates provider provenance, available content, a human reason and an explicit registry simulation. A record with no abstract remains metadata only.
- **Restraint:** no invented KPI, citation count, confidence percentage, evidence-quality grade, chart or implied full-paper summary is used as decoration.

## Color and contrast

The following values are calculated from the actual opaque CSS token pairs with the WCAG relative-luminance formula. They are rounded for reporting, not used to round a failed threshold into a pass. [W3C’s contrast explanation](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) describes a 4.5:1 minimum for ordinary text and 3:1 for qualifying large text. [W3C’s use-of-color explanation](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) explains why color also needs another visible indication.

| Pair | Foreground / background | Ratio |
| --- | --- | ---: |
| Main text / canvas | `#222322` / `#f1f1ed` | 13.93:1 |
| Metadata / canvas | `#60625d` / `#f1f1ed` | 5.45:1 |
| Metadata / white tile | `#60625d` / `#ffffff` | 6.17:1 |
| Metadata / peach tile | `#60625d` / `#fcf0ea` | 5.52:1 |
| White label / coral button | `#ffffff` / `#b7372b` | 5.84:1 |
| Tray text / graphite | `#ffffff` / `#252724` | 15.06:1 |
| Tray metadata / graphite | `#bfc6b7` / `#252724` | 8.59:1 |
| Export label / peach button | `#34110d` / `#ffad9c` | 9.50:1 |
| Pending status / canvas | `#78520b` / `#f1f1ed` | 6.16:1 |
| Completed status / canvas | `#326441` / `#f1f1ed` | 6.11:1 |
| Checkbox border / white | `#7c8077` / `#ffffff` | 4.03:1 |
| Light-surface focus / canvas | `#6637b8` / `#f1f1ed` | 6.61:1 |

This pair check is useful evidence, not a full accessibility conformance audit. It does not test every browser, hover/focus combination, zoom level, input method, assistive technology or personalized setting. The HTML includes reduced-motion and forced-colors accommodations; these still need broader review before a production adoption.

## What works in the HTML

The file has inline styles, script and original SVG icons. It requires no build, model, provider API, remote font, CDN or installed UI library. It can be opened directly or served by the gallery.

1. Switch board/list and all/included views.
2. Inspect any available source in a native dialog; Escape closes it and returns focus to the initiating control.
3. Explicitly include or remove a source, edit a human reason, and see the decision in the shortlist tray.
4. Simulate a separate DOI registry observation after inclusion. The demo invents a Crossref route and title agreement only; this is visibly labeled. Original discovery fields remain unchanged. No registry or scientific-quality claim is made.
5. Export a Markdown shortlist with an explicit fictional-content header, source provenance and the human’s reasons.
6. Replay staged source arrivals. One source is initially usable, the second arrives at 1 second, and the third at 3 seconds. These timings are authored. Source nodes and keyboard focus are preserved as later sources arrive. The first source shows only its currently demonstrated lexical branch during the replay, then its combined branch label at completion.

The visible question is editable for evaluating the composition, but replay always uses the same fictional set. It does not retrieve results or run real filters. The three original samples are retained for comparison with the prior round. Selections, reasons and registry simulations are page-session state; a reload resets the demo. Replaying arrivals does not clear existing human decisions, so the tray may hold a previously included source before that source reappears in the collection.

## Author verification

On October 28, 2026, an actual local full Chromium browser passed one scripted interaction journey covering board/list switching, inclusion, inspection, human-note retention, separate registry simulation, Escape focus restoration, included filtering, fictional export, progressive early access, stable source DOM/focus, and registry gating. The test found no horizontal overflow at **1440, 1024, 768, 390 or 320px**, no JavaScript page errors, and no HTTP(S) requests from the standalone page. Desktop and 390px full-page screenshots were inspected visually. The parent reviewer performs the combined gallery review separately.

These checks establish that this concept’s basic demonstration is usable; they are not participant research, provider integration tests, accessibility certification, or proof that this design is preferred. The largest questions for a review are whether emphasis on the first source risks being read as endorsement, whether the tray remains visible enough during longer collections, and whether a spatial board helps this user’s scanning better than a clear list.

## Candidate production components, if selected

Map the visual tokens and spacing into the existing Next.js theme first. A React implementation would need an accessible command bar/navigation, controlled checkbox, switchable source collection, dialog/overlay, labeled textarea, status region and deterministic export action. Carbon or Fluent can inform component behavior, but a library migration is not authorized or required by this concept. The existing progressive delivery, provider isolation and human-authority contracts should remain authoritative.
