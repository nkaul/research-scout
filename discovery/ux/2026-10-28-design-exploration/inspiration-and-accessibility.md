# Research Scout — design inspiration and accessibility

**UX inspiration research · October 28, 2026 · proposal for three HTML concepts**

This research supports **Cobalt Studio**, **Fieldnotes** and **Midnight Observatory**. It does not select a new product direction, install a component library or establish participant-tested usability. The user asked about next year: **2027 directions below are design hypotheses based on sources available today, not a ranking of future products**. The recorded Material blue direction in [existing UX research](../../../system-design/ux-research.md) remains the baseline until a concept is selected.

## What the strongest examples contribute

| First-party source, checked October 28, 2026 | Useful finding | Research Scout application — our inference |
| --- | --- | --- |
| [Google Design: expressive design research](https://design.google/library/expressive-material-design-google-research) | Material 3 Expressive uses color, shape, scale, motion and containment to emphasize important actions and group related information. Google describes research across many designs and contexts. | Give the question composer and primary Search action more character. Group scope controls on a tonal surface. Keep bibliography and provenance visually calm. Google's reported outcomes are not evidence that our mockup is faster. |
| [Linear: A calmer interface for a product in motion, March 12, 2026](https://linear.app/now/behind-the-latest-design-refresh) | Its refresh reduces the prominence of secondary chrome, unnecessary icons and separators, while making action placement more consistent. | Use one predictable header/action zone, aligned reading columns and a receding sidebar. Spend emphasis on the active question, selected source and human decision. Avoid copying tiny icon-only controls into our touch layout. |
| [Vercel Geist: colors](https://vercel.com/geist/colors) | Separate scales/roles for backgrounds, component states, borders and text/icons; restrained secondary backgrounds. | Define semantic tokens before styling components. A selected row, interactive outline and muted metadata need different roles. A decorative divider is not the token for an essential control boundary. |
| [Vercel Geist: typography](https://vercel.com/geist/typography) | Distinguishes headings, single-line labels and multiline copy, including tabular number styles. | Use a compact UI type scale with comfortable reading copy and tabular counts. A paper title deserves more hierarchy than transport details or timestamps. |
| [Google: NotebookLM Discover Sources, April 2, 2025](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-discover-sources/) | A described topic yields source recommendations with short relevance annotations and explicit source import. Original sources remain available. | Keep the path question → source → inspect → human shortlist. Any future AI fit note should cite its input record and look distinct from provider metadata. This historical feature example does not establish today's NotebookLM capabilities or our retrieval quality. |

The most useful 2027-facing hypothesis is **more deliberate hierarchy, richer identity and clearer agency**, rather than more decoration everywhere. Test expressiveness in the composer, selected states and meaningful transitions; test quiet precision in long result lists and metadata comparisons. This is our synthesis of the examples, not a sourced prediction that one visual trend will win.

## Three directions that should feel different

| Concept | Visual character | Composition and useful distinction | Main risk to evaluate |
| --- | --- | --- | --- |
| **Cobalt Studio** | Cool near-white canvas, confident blue, rounded tonal groups, crisp outlined icons. | A strong composer above a practical workspace; comfortable source rows; an obvious shortlist count. Closest to the previously selected blue direction. | Overlarge pills, repeated cards or excessive blue can consume the reading area and weaken hierarchy. |
| **Fieldnotes** | Warm paper-like surface, strong ink, an editorial heading voice, blue controls. | Longer reading passages and deliberate white space; quieter navigation; evidence treated like a research notebook. Serif can be limited to headings/source titles, with sans-serif UI labels. | Styling must not imply that records have been read or verified. Keep warm neutrals high-contrast and retain clear interactive affordances. |
| **Midnight Observatory** | Deep navy canvas, distinct raised surfaces, pale blue actions, precise counters. | A focused discovery console with denser aligned rows and a detailed inspector; restrained operational status. | Dark is an optional preference, not an accessibility upgrade. Glowing accents, tiny gray metadata and constant activity can make prolonged research harder. |

For every concept, preserve one selected discovery provider, OpenAlex as the primary/default, a bounded within-provider hybrid plan, progressively available source rows, and human inclusion/exclusion. Crossref/DataCite checks remain explicit per-record observations. No concept should suggest automatic provider mixing, completed full-text reading, guaranteed evidence quality or an implemented feature merely because a polished sample shows it.

## Candidate semantic tokens

These are **proposed starting tokens**, not a specification of the mockups' final computed styles. Prefer solid sRGB values for predictable prototype review. Keep any gradient or atmosphere behind decoration rather than small text. Use a small shape vocabulary: about 8px for compact controls, 12–16px for groups and 20–24px for a prominent composer; these dimensions are design judgments to test.

| Role | Cobalt Studio | Fieldnotes | Midnight Observatory |
| --- | --- | --- | --- |
| Canvas | `#F5F8FC` | `#F6F3EC` | `#0B1220` |
| Reading / raised surface | `#FFFFFF` | `#FFFFFF` | `#141F32` |
| Primary text | `#15243B` | `#242A36` | `#EAF0FB` |
| Secondary text | `#536278` | `#596372` | `#AAB8D0` |
| Primary action fill | `#1565C0` | `#155BB5` | `#92BBFF` |
| Text on primary action | `#FFFFFF` | `#FFFFFF` | `#10234B` |
| Selected surface | `#E3F2FD` | `#E4EEFD` | Distinct blue-toned raised surface, with a visible selected marker |
| Essential outline candidate | `#6D7F96` on white | `#6D7F96` on white | `#62738E` on raised navy |

The original primary `#1976D2` with white text computes to **4.602:1**. It passes the normal-text contrast threshold as an opaque pair but leaves little margin; `#1565C0` gives **5.746:1**. `#42A5F5` can remain decorative or be paired with suitably dark text; do not assume it works for small white text.

Computed examples use the WCAG sRGB relative-luminance formula with opaque colors, measured locally during this research. Values are rounded for display; pass/fail used unrounded values. These **token checks are not a whole-page accessibility audit**; translucency, overlays, hover, disabled state, font rendering and actual adjacent colors still need inspection.

| Foreground / background | Contrast | Intended use |
| --- | ---: | --- |
| `#15243B` / `#F5F8FC` | 14.632:1 | Cobalt primary reading text |
| `#536278` / `#F5F8FC` | 5.822:1 | Cobalt small secondary text |
| `#1565C0` / `#E3F2FD` | 5.031:1 | Cobalt selected text |
| `#242A36` / `#F6F3EC` | 12.984:1 | Fieldnotes reading text |
| `#596372` / `#F6F3EC` | 5.489:1 | Fieldnotes secondary text |
| `#FFFFFF` / `#155BB5` | 6.572:1 | Fieldnotes action label |
| `#EAF0FB` / `#0B1220` | 16.365:1 | Midnight reading text |
| `#AAB8D0` / `#141F32` | 8.237:1 | Midnight secondary text |
| `#10234B` / `#92BBFF` | 7.899:1 | Midnight primary action label |
| `#62738E` / `#141F32` | 3.430:1 | Midnight essential control outline |
| `#64748B` / `#F5F8FC` | **4.468:1 — fails normal text** | A tempting muted token to avoid on this canvas |

For light-theme semantic statuses, candidate text/background pairs are success `#18734F` / `#E6F5ED` (**5.174:1**), attention `#8C5C0F` / `#FFF4D9` (**5.255:1**) and error `#B42318` / `#FEECE9` (**5.757:1**). Always add plain language and an appropriate icon; a green check must not conflate “saved”, “registry record found” and “scientifically valid”. Color cannot be the sole information channel. [W3C: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)

## Components and icon discipline

The current [frontend package](../../../frontend/package.json) contains Next.js and React without MUI. **Material Design is design guidance; Material UI is a React library.** The current MUI homepage FAQ states it adopts Material Design 2, so installing it must not be described as obtaining Material 3 Expressive automatically. [MUI Material UI overview](https://mui.com/material-ui/)

Three offline mockups can use semantic HTML, CSS tokens and inline SVG. They should not install a framework to demonstrate aesthetics. If the chosen direction later warrants MUI, its theme supports palette, typography, spacing, shape, component overrides and CSS variables. Keep custom app tokens mapped into that theme rather than scattering raw values. The palette's automatic contrast choice is not a page-level audit. [MUI theming](https://mui.com/material-ui/customization/theming/), [MUI palette](https://mui.com/material-ui/customization/palette/)

| Research Scout element | Mockup / current React approach | Candidate MUI mapping, if later selected |
| --- | --- | --- |
| Workspace navigation | Semantic `nav`, labeled links and an unmistakable current location | Drawer + List; responsive temporary drawer where needed |
| Question and provider scope | Labeled `textarea`, explicit provider/select controls, primary button; advanced filters disclosed secondarily | TextField + Select + Button + Collapse/Popover |
| Source results | Stable `ol`/`li` or articles; title, bibliography, available abstract, provider and human selection | Custom ListItem/Paper composition; avoid assuming Data Grid is needed for fewer than 20 long-text sources |
| Progress | Plain branch labels and status icons; indeterminate activity where timing is unknown | LinearProgress/CircularProgress for the active operation, not a fabricated completion percentage |
| Source inspector | Desktop `aside` where non-modal; appropriately labeled dialog/sheet on narrow layouts | Persistent/temporary Drawer or Dialog depending on actual interaction semantics |
| Metadata comparison | Labeled discovery and registry observations, field match/conflict text | Definition lists or small Table; Alert for actionable scoped conflict |
| Human shortlist | Explicit labeled include/exclude controls and reason field; acknowledgement beside the edit | Button/ToggleButtonGroup + TextField; Snackbar only as supplementary feedback |
| Secondary provenance | Disclosure for executed queries, retrieval time and bounded coverage | Accordion/Collapse; badges are supplementary labels, not opaque confidence scores |

The mapping is a design proposal, not a dependency decision. The [MUI Dialog](https://mui.com/material-ui/react-dialog/) and [Progress](https://mui.com/material-ui/react-progress/) guidance support matching components to their actual modal/loading behavior. If MUI is adopted later, follow its current [Next.js App Router integration](https://mui.com/material-ui/integrations/nextjs/) rather than adding a generic client-side theme wrapper and assuming streamed styles are handled.

Use one consistent icon family, usually 18–20px for metadata and 20–24px for primary controls, while keeping the interactive hit area larger. Suggested roles are search, filter, bookmark/include, external source, inspect, download and status. Pair uncommon meanings with text. Prefer an explicit **Check DOI metadata** label over a shield icon that could suggest scientific trust. Decorative icons should be hidden from assistive technology; icon-only controls need accessible names and visible focus. These sizes and icon choices are our practical proposal.

MUI's icon package exposes Material Icons; its documentation currently distinguishes them from newer Material Symbols, which that package does not support. Inline SVG avoids icon-font loading and lets prototypes remain offline. [MUI Material Icons](https://mui.com/material-ui/material-icons/)

## Accessibility and progressive behavior review contract

| Requirement | Prototype/application check |
| --- | --- |
| Readable text | Normal text at least **4.5:1**; qualifying large text **3:1**. Do not classify 14–16px metadata as large text. [W3C contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) |
| Visible control/state cues | Meaningful component boundaries, state indicators and graphics need **3:1** against adjacent colors when required to identify them. Decorative separators are different. [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) |
| Easy activation | WCAG 2.2 AA specifies **24×24 CSS px**, with defined exceptions. Use approximately **44×44px** as our stronger practical goal for primary/touch controls, rather than claiming 44px is the AA minimum. [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) |
| Keyboard confidence | Every control has visible focus. Keep the focus indicator clear of sticky headers, bottom actions and inspector edges; use a 2–3px ring with offset as a candidate treatment, then inspect actual surroundings. [W3C focus visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) |
| Honest inspector semantics | A persistent desktop panel can remain non-modal. A modal sheet makes background content inert, receives focus, contains Tab navigation, closes with Escape and restores focus sensibly. Do not label an arbitrary desktop aside modal. [W3C APG modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) |
| Useful progressive updates | Keep available rows usable; show lexical/semantic branch states separately. Preserve row positions and human edits. Coalesce concise polite announcements; do not move focus or announce every incoming field. Status changes must be available to assistive technology without forcing focus. [W3C status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) |
| Calm motion | Short purposeful state transitions can aid orientation. Respect `prefers-reduced-motion`, remove decorative motion in that mode, and avoid perpetual row shimmer/pulse after usable content arrives. Disabling non-essential interaction-triggered animation aligns with the stronger AAA criterion, not a claim that this criterion is AA. [W3C animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) |
| Responsive reading | Collapse the multi-column workspace into one usable reading path, with an explicit inspector transition and wrapping titles/metadata. Test 320 CSS px and 400% zoom where applicable; avoid two-dimensional page scrolling for ordinary source text. [W3C reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) |

Do not put all streaming output inside one `aria-busy` wrapper that effectively hides useful early content. Reserve busy state for the affected operation; preserve access to source titles, inspection and saving. Do not automatically reorder the list when fused ranking finishes; keep **Apply final ranking** explicit. These are existing Research Scout contracts, not new speculative features.

## What to avoid and how to choose

Avoid generic gradient hero banners that displace working content; indiscriminate frosted glass behind reading text; a card around every metadata fragment; excessive tiny badges; icons with no clear job; low-contrast “premium” gray; color-only verification; percentages without a measurable denominator; fake activity; unavailable features that look active; and a chat answer that postpones source access.

Compare the concepts using the same fictional records and the same tasks: identify the selected provider/scope, find an early result while another branch runs, inspect source content state, distinguish a registry observation from scientific validation, include a record with a reason, reopen the shortlist and locate export. Ask which direction feels engaging **and** easier to work in; measure misunderstanding and task completion before adopting a winner. Review desktop, narrow width, keyboard, contrast and reduced motion separately. A screenshot can establish visual intent; it cannot prove accessibility, retrieval quality or live provider behavior.
