# Research Scout — UX Direction for the Interactive Concept

Prepared October 26, 2026. This brief combines Research Scout's product handoff with the site design elements agent's design research. Scope is the user experience and visual system, not production integrations.

**User-selected palette update — October 26, 2026:** Use Material UI blue for the current design: primary #1976d2, dark #1565c0, light #42a5f5, and selected surface #e3f2fd. Pair these with cool neutral surfaces and dark slate ink. This supersedes the exploratory forest/teal palette while preserving the information architecture, minimal layout, and interaction rationale. Palette adoption does not commit the static prototype or production app to MUI React. [Material UI palette reference](https://mui.com/material-ui/customization/palette/)

## Design decision

Build a calm research workspace with one clear task: find useful sources, save a shortlist, then inspect and compare the evidence. The design should feel like a refined productivity application with editorial readability. Avoid a dashboard of metrics or an AI chat screen that hides the sources.

The design agent's workspace inputs are adopted: a restrained navigation rail, row-based results, a side-peek source inspector, and neutral semantic surfaces. The initial forest/teal accent was exploratory; the current user-selected accent is Material UI blue. Layout, spacing, and neutral tokens remain original recommendations, with the specified blue values applied consistently to actions, focus, and selected states.

## Primary user jobs

1. Turn a research question into a manageable source list.
2. Decide whether a source is relevant and whether its full text was actually read.
3. Save a shortlist without losing research context.
4. Compare definitions, methods, findings, and limitations with visible supporting passages.
5. Assemble a brief and export sources.
6. Extend discovery to web pages and videos while retaining clear content-access states.

The application can support complex provider orchestration while presenting simple task-focused controls. MCP, API names, token budgets, indexing, raw provider errors, and infrastructure settings do not belong in the primary workspace.

## Information architecture

Use four navigation destinations:

- **Discover:** search and review papers, web pages, and videos.
- **Library:** saved sources for the current research project.
- **Evidence:** a bounded source comparison.
- **Brief:** a reviewable research summary and bibliography.

The sidebar also holds the current research project and two or three recent research sessions. A small Settings/Help area can sit at the bottom. Do not add separate provider, analytics, downloads, datasets, or agent-management destinations in this concept.

A source-type segment inside Discover switches **Papers / Web / Videos**. It does not change the overall workspace architecture. Datasets stay outside this initial concept.

## Desktop composition

At a 1440px reference width:

- Left rail: 220–224px.
- Main region: fluid, with a readable content width.
- Source inspector: 376–392px when open.
- Header: about 64px.
- Main content horizontal padding: 32px; reduce to 24px when needed.
- Search: full width, about 52–56px high.
- Result rows: generous 20–24px vertical padding and hairline dividers rather than detached cards.

The hierarchy:

1. Quiet breadcrumb / project context.
2. Project title and one short contextual sentence.
3. Natural-language search field with one accent Search action.
4. Papers / Web / Videos segments.
5. Small filter row: date range, access, and a Filters disclosure.
6. Results count, sort control, and result list.
7. Optional source inspector at the right.

A compact Export control can sit in the header. New research is a quieter secondary action. Avoid multiple equally prominent CTAs.

Keep the inspector closed by default. Open it on explicit source selection, retain the underlying results and reading position, and remember context. This keeps the first screen spacious while giving the detail view a clear purpose.

## Result row anatomy

Each result contains:

- A small source-type icon.
- A strong linked title, usually no more than two lines.
- Author / organization, year, and venue in one muted metadata line.
- A concise one- or two-line relevance description.
- One compact content-access label.
- A small source provenance line if useful.
- A Save button with an accessible name.

Do not add match percentages, abstract “AI confidence” scores, multiple provider logos, a citation count for every source type, or an action cluster around every row.

Paper access labels should use human language:

- **Full text** when article content was retrieved.
- **Abstract only** when only the abstract was read.
- **Metadata only** when no content evidence is available.

An available download link should not be mislabeled as content already read. A preprint can have a separate subtle version label.

A selected row gets a very light accent wash or left indicator; it must not look like a saved source merely because the inspector is open. Save state is explicit through the Save/Saved control.

## Source inspector

Keep the inspector useful and quiet:

- Source type and access label.
- Source title and bibliographic metadata.
- Overview / Evidence tabs.
- Overview: short abstract or description, publication/version details, and original-source link.
- Evidence: one or two short supporting passages, each with page/section or timestamp citation chips.
- Footer actions: Save or Saved, Open source, and an optional contextual Ask action.

Use an honest heading such as “What this source adds.” A generated explanation must be distinguished from an original excerpt.

Citation chips are navigation controls: selecting one scrolls/highlights a passage or opens the corresponding evidence location. Do not scatter sparkle icons around summaries.

If only an abstract is available, say so near the evidence content and do not invent paper-body details. For videos, channel/duration metadata is not a transcript.

## Shortlist and comparison behavior

Discover uses Save controls. The Library displays saved sources and offers “Compare sources.”

To avoid two competing selection systems:

- Saving means “include in my research library.”
- Comparison selection happens in Library, with an explicit selection mode or visible selection checkboxes.
- Enable Compare when two or more sources are selected.
- The compact selection bar shows “2 selected,” Clear, and Compare evidence.

Evidence should compare two or three sources at once. Use columns for sources and rows for:

- Definition / central claim.
- Methods or basis of evidence.
- Findings.
- Limitations.

Each meaningful cell has a source passage or a clear “Not stated in the available text.” Citation chips reopen the source inspector. More sources can be added through a disclosure, rather than expanding to a dense spreadsheet by default.

For the demonstration topic, compare how sources define institutional AI readiness. Avoid pretending that several indexes reporting the same paper count as separate supporting studies.

## Brief experience

Present a concise, readable research brief with sections such as:

- Main finding.
- Where the sources agree.
- Where they differ.
- What remains uncertain.
- Sources.

Source citations open the same inspector. Let the user export Markdown or a bibliography through a compact menu. The mockup need not present a complete word processor or academic manuscript builder.

## Visual tokens — current user-selected palette

| Token | Current value |
|---|---|
| Canvas | #f7f9fc — cool near-white |
| Main surfaces | #FFFFFF |
| Primary ink | #1e293b — dark slate |
| Secondary text | #64748b |
| Soft line | #e2e8f0 |
| Primary / accent | #1976d2 |
| Primary dark / hover | #1565c0 |
| Primary light | #42a5f5 |
| Selected surface / accent wash | #e3f2fd |
| Text on primary | #ffffff |
| Caution text | #8A611E |
| Caution wash | #FBF5E9 |
| Focus | 2px accent outline with 2px offset |
| Body | 14px / 1.5–1.6 |
| Reading passages | 15px / 1.65 |
| Metadata | 12px / 1.5, maintain readable contrast |
| Project heading | 28–30px, medium weight, tight but readable tracking |
| Row title | 16px, medium or semibold |
| Spacing scale | 4, 8, 12, 16, 24, 32, 48 |
| Control radius | 8px |
| Panel radius | 10–12px |
| Icon size | 16–18px, consistent monoline strokes |
| Shadow | Restrained overlay/inspector separation only |

Use primary blue sparingly for the Search action, active navigation, focus, links, and selected controls. The pale blue selected surface should remain quiet. Keep most source rows white, preserve text-based access labels, and retain semantic caution colors only where they explain source state. Verify contrast for each actual text/control pairing; the light blue token is not a default small-text color.

Use a system/Inter-like sans-serif for the interface. Avoid tiny text, all-uppercase metadata overload, large gradients, glass effects, and oversized rounded floating cards.

The brand can use a small compass/aperture mark with a simple wordmark. Use icons beside labels for navigation; icon-only controls need tooltips and accessible names. Do not use emojis as the icon system.

## Controls and progressive disclosure

Visible by default:

- Search.
- Source-type segments.
- Date/access filters.
- Sort.
- Save.
- Open source/inspector.
- Relevant next action.

Within Filters:

- Publication type.
- Language.
- Preprints.
- Domain or venue.
- Source provider, if needed.
- Other advanced scope criteria.

Within settings or contextual details:

- Connected-source status.
- Provider-specific limitations.
- Account configuration.
- Retrieval options.

Avoid an ever-present chatbot, floating agent log, provider status wall, raw quota counters, or a large collection of charts. Landscape analysis can later be a focused view attached to a defined research question.

## Responsive behavior

- Around 1180px: inspector becomes a drawer over the main content.
- Around 800px: collapse the rail into a labeled menu or compact navigation; keep destination names accessible.
- Around 600px: search and primary actions stack; result metadata wraps; inspector becomes full screen.
- Filter chips may scroll horizontally in their own region.
- The page itself must not overflow horizontally.
- Keep mobile tap targets about 44px and desktop icon controls at least 32px where appropriate.

## Interaction and state requirements

- Search submits through Enter and the Search button.
- Filters visibly change the list; Clear filters restores it.
- Save state updates Library and relevant counts.
- Source selection opens and closes the inspector.
- Papers/Web/Videos display distinct row anatomy and access states.
- Compare selection enables a working Evidence view.
- Citation controls expose evidence locations.
- Export produces a real local file in the interactive concept.
- Escape closes drawers/dialogs; focus returns to the invoking control.
- Keyboard focus is visible and all clickable controls have semantics.

Empty state: one sentence explaining the next useful action and a small number of example research questions. Avoid a massive hero illustration.

Loading state: stable skeleton rows and plain progress text. Do not fabricate live provider activity in the mockup.

No results: show the active query and filters, with Clear filters and an editable query.

Partial data: a concise contextual notice only when relevant. Sources that cannot be read retain useful metadata and clear access state.

## Demonstration honesty

The published mockup uses illustrative/local sample data. Label it quietly as an interactive concept or sample workspace. Do not imply that search, retrieval, transcript access, or synthesis is connected to live scholarly services.

If using invented sample paper titles or passages, keep them explicitly illustrative; do not present fabricated DOI links or academic claims as verified research. Prefer genuine links when a real source is used.

## Acceptance criteria for the mockup

The initial screen should answer within seconds:

1. What research question am I exploring?
2. Which sources can I inspect?
3. What content was actually read?
4. How do I save and compare useful sources?

The screen should feel spacious at desktop size, remain usable on mobile, and expose no unnecessary implementation details. The primary workflow must operate through discovery, saving, source inspection, and comparison.

## Design research references

The first agent's completed research brief is saved at work/site-design-elements.md. This UX direction adopts its workspace patterns and uses the following official references:

- [Linear display options](https://linear.app/docs/display-options): compact ordering/filtering/property controls and saved preferences.
- [Notion views, filters, and sorts](https://www.notion.com/help/views-filters-and-sorts) and [layouts](https://www.notion.com/help/layouts): list simplicity, visible properties, and side peek that preserves collection context.
- [Attio records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records): contextual record preview and source selection.
- [Geist colors](https://vercel.com/geist/colors) and [typography](https://vercel.com/geist/typography): semantic neutral roles and readable information hierarchy.
- [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility): focus, semantics, and keyboard behavior.
- [MUI Data Grid accessibility](https://mui.com/x/react-data-grid/accessibility/): comparison density and navigation principles.
- [Material UI palette](https://mui.com/material-ui/customization/palette/): the main/light/dark/contrast-text token roles and primary blue values adopted in the October 26 user override.
- [shadcn sidebar](https://ui.shadcn.com/docs/components/sidebar): a composable, responsive shell.
- [Raycast action panel](https://manual.raycast.com/action-panel): contextual commands as optional accelerators.

These are source-backed pattern references, not copied product layouts. Research Scout's composition and neutral tokens are original recommendations. The current primary blue palette follows the user's October 26 override and the linked Material UI palette reference; using these colors is independent of a component-framework migration.

