# Site Design Elements — Research Scout

Prepared October 26, 2026. Official product documentation and design-system examples were reviewed. This is an original design synthesis, not a ranking of every current framework or a signed-in audit of these products.

## Latest user-selected palette — Material UI blue

The user's latest direction is to use Material UI blue for the UX. This supersedes the original forest/teal palette recommendation retained below. The light, minimal workspace structure, typography, spacing, icon guidance, and progressive disclosure remain applicable.

The official [Material UI palette documentation](https://mui.com/material-ui/customization/palette/) defines the default primary tokens as:

| Token | Value | Research Scout use |
|---|---|---|
| primary.main | #1976D2 | Primary actions, active navigation, selected controls, links, and visible focus treatment |
| primary.light | #42A5F5 | Restrained supporting accents and non-text emphasis |
| primary.dark | #1565C0 | Primary-action hover/pressed states and stronger blue emphasis |
| primary.contrastText | #FFFFFF | Text on the solid primary-action background |

Proposed supporting neutral tokens are original Research Scout choices:

- Cool near-white canvas: #F7F9FC.
- White surfaces: #FFFFFF.
- Primary ink: #1F2937; secondary text: #667085.
- Hairline borders: #E3E8EF.
- Selected and hover surfaces: pale blue or low-opacity primary blue, such as rgba(25, 118, 210, 0.08), while retaining legible dark text.

Apply blue selectively to meaningful interaction: the search action, active tab/navigation, saved/selected controls, selection indicators, links, and keyboard focus. Keep most reading content and metadata neutral. Semantic success/warning/error states retain their own text labels and appropriate colors; the primary blue is not a substitute for every status.

This is a palette update. It does not require a layout redesign or migration of the prototype to the full Material UI framework. The same tokens can be implemented in the existing lightweight HTML/CSS/JS prototype or a later component system. Verify actual foreground/background contrast and focus visibility in the rendered interface.

## Recommended direction

Create a calm, light research workspace with a narrow navigation sidebar, a strong search field, structured source rows, and a contextual reading inspector. The aesthetic should feel precise and editorial: information-rich when needed, quiet at first glance. Use Linear/Attio for workspace interaction, Notion for contextual reading, and Geist for restrained visual hierarchy. Use accessible component patterns from shadcn/Radix or MUI without inheriting every default visual convention.

The interface should not resemble a marketing page or a dashboard of oversized metrics. Research sources and supporting passages are the content. Decorative gradients, hero artwork, elaborate cards, glowing accents, and several simultaneous side panels would work against this goal.

## Reference set

| Reference | Verified pattern | Useful interpretation for Research Scout |
|---|---|---|
| [Linear display options](https://linear.app/docs/display-options) and [custom views](https://linear.app/docs/custom-views) | Ordering, grouping, visible properties, saved views, and keyboard shortcuts belong to a compact view-level control surface. | Put Filter, Sort, and view settings together above results. Keep advanced choices in popovers. Preserve the user's reading position. |
| [Notion database views](https://www.notion.com/help/views-filters-and-sorts) and [layouts](https://www.notion.com/help/layouts) | The same records can use different views; properties can be hidden; side peek preserves the underlying collection. | Use a list as the discovery default and a side inspector for one paper. Reveal DOI, provider details, and acquisition history inside details rather than every row. |
| [Attio records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records) and [filters](https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views) | Record collections support visible attributes, saved views, selection, and contextual record previews. | Treat papers as browsable records. Reveal batch actions only after selection. Use compact source/status labels with stable alignment. |
| [Vercel Geist colors](https://vercel.com/geist/colors) and [typography](https://vercel.com/geist/typography) | Separate background, hover, active, border, and text roles; typography differentiates labels, reading copy, and numbers. | Define semantic tokens rather than selecting arbitrary gray values per component. Use a 14px information layer and larger reading copy in the inspector. |
| [MUI Data Grid accessibility](https://mui.com/x/react-data-grid/accessibility/) | Grid navigation, row/column associations, and density are explicit concerns. | Borrow robust density and keyboard behavior for a later comparison table. Do not make a dense spreadsheet the first discovery experience. |
| [shadcn sidebar](https://ui.shadcn.com/docs/components/sidebar) | Composable, themeable, collapsible sidebar patterns. | Good basis for a small, responsive app shell. A component library is not the visual direction; apply the Research Scout tokens and hierarchy consistently. |
| [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility) | Primitives provide focus management, keyboard patterns, and accessible semantics, while applications still supply labels/context. | Tooltips supplement labels; icon-only buttons need accessible names. Dialogs/popovers need focus handling and Escape behavior. |
| [Raycast search](https://manual.raycast.com/search-bar) and [action panel](https://manual.raycast.com/action-panel) | Keyboard-first results navigation and contextual action discovery. | Offer slash-to-search or a restrained command launcher as an accelerator. Primary workflows must remain visible and discoverable without shortcuts. |

These references are operational app patterns and component systems. Their marketing-page styling is not the recommendation.

## Original aesthetic specification — retained research

These values document the original research recommendation. The forest/teal and warm-neutral colors below are superseded by the user-selected Material UI blue palette above; the non-color guidance remains a useful starting point. These original values were not copied brand tokens.

- Canvas: warm near-white #F8F9F7; primary surface #FFFFFF.
- Primary ink: #202722; secondary text #68736C.
- Hairline divider: #E5E9E4; selected surface: #EDF4EF.
- One accent: restrained forest/teal #2F6B55; stronger text on pale green for active/selected states.
- Warning/status colors: small amber/red/blue semantic touches only; always accompanied by text.
- Typeface: a neutral modern sans such as Geist/Inter or a reliable system stack; avoid novelty fonts.
- Main heading: 28–32px, medium weight, slightly tight letterspacing.
- Paper title: 15–16px, medium weight, wrapping naturally.
- Reading copy: 15–16px with 1.55–1.65 line height.
- UI labels: 13–14px; metadata 12–13px. Do not make body content tiny to create apparent sophistication.
- Spacing: 4px base with 8/12/16/24/32px rhythm.
- Controls: 34–40px high for compact desktop toolbars, larger hit areas for small icon controls/touch.
- Radius: 7–10px controls; 10–14px reading/modal surfaces; avoid pill-shaped everything.
- Borders: subtle single hairlines. Shadows: only where depth explains an overlay, with low opacity.
- Motion: brief 120–180ms state transitions; respect reduced-motion preferences.

## Components and hierarchy

1. App shell: approximately 208–224px left sidebar, 56px workspace header, flexible central canvas.
2. Search composer: an actual input with a concise prompt and a clear action; source-type selection nearby, advanced search hidden.
3. View tabs: Papers, Web, Videos (or source counts in a compact segmented control), with the same search context maintained.
4. Result list: title, author/year/venue line, one-line relevance or abstract excerpt, compact access label. Save icon at the edge; selection checkbox for comparison.
5. Inspector: approximately 360–400px on a wide desktop, opened by a row. Header, tabs such as Overview/Evidence, readable abstract, evidence excerpts, and a source-opening action.
6. Shortlist: collection view using the same row model; selection count produces contextual Compare/Export actions.
7. Comparison: a focused view/modal for selected sources, with concept/method/finding rows and clickable citations.
8. Feedback: quiet success toast, clear selected state, helpful empty state, and explicit content-access state.

## Progressive disclosure

Visible first: research question, source type, 2–3 useful filters, result count, results.

On demand: filter groups, publication range, source providers, bibliographic details, citation export, acquisition information, keyboard commands.

After selection: compare/export actions.

After opening a source: abstract, evidence, source link, version/access details.

Keep provider names as provenance, not a row of competing branded logos or selectable infrastructure switches. Users should choose their research goal rather than understand API routing.

## Icon and control guidance

- Use one consistent outlined icon family, generally 16–18px with equal stroke weight.
- Icons explain action/type; they do not decorate every sentence.
- Main navigation uses icon + text. Primary actions use text, optionally one leading icon.
- Icon-only controls suit save, close, expand, and overflow when their names are accessible.
- Status must not rely on color or tiny icons alone: use labels such as Full text, Abstract only, or Transcript available.
- Avoid showing a tooltip for information required to understand a result.
- Provide visible keyboard focus, native button/input semantics, and reversible save/selection behavior.

## Responsive behavior

- Wide desktop: sidebar + results + optional inspector.
- Medium widths: collapse navigation; inspector overlays or takes the content area rather than crushing result titles.
- Mobile: a single content column, navigation drawer, and full-height detail sheet. Filters become a focused sheet.
- Do not leave a fixed multi-column comparison/table spilling beyond the viewport without a deliberate responsive alternative.

## Framework recommendation

For a production implementation, shadcn with accessible underlying primitives offers fine visual control; MUI is a strong option if advanced grids/enterprise controls dominate. Neither is necessary for a browser-local mockup. The current Sites prototype can implement this visual language in lightweight HTML/CSS/JS, while keeping recognizable components for later React adoption.

The design direction should be judged by the task sequence: discover a source, understand its access level, save it, inspect evidence, compare selected papers. A beautiful screen that obscures this sequence is not a successful mockup.
