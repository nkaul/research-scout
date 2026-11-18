# UI UX Pro Max family — design decisions and local evidence

November 15, 2026. Three standalone light-theme review artifacts, built from the shared authored Research Scout content/interaction contract. They are catalog-guided proposals, not upstream recommendations for Research Scout or production adoption. No application code, private research, provider request or hosted-model call was used.

## Compared treatments

| Preview | Chosen catalog guidance | Visible difference | Tradeoff |
| --- | --- | --- | --- |
| [Swiss Workbench](pro-swiss.html) | `minimalism-and-swiss-style` + `data-dense-dashboard`; Minimal Swiss typography direction | A disciplined grid, narrow white navigation, square controls, results grouped into divided rows, small provenance labels and a flat reader with a strong top rule. | Best scanning density; less visual warmth and more compressed prose than Scholar. |
| [Scholarly Reading Desk](pro-scholar.html) | `e-ink-paper` reading surface; Academic/Research typography direction | Warm paper, open result rhythm, serif titles/prose, calmer metadata and a 455px desktop reader. Ordinary blue controls and media surfaces remain familiar. | More comfortable long reading; fewer result rows fit. Paper treatment belongs to reading, rather than imposing a magazine layout on video or operational feedback. |
| [Material Clarity](pro-material.html) | `accessible-and-ethical` + `data-dense-dashboard`, with the current Material blue; Analytics Dashboard palette as a reference | Clear rounded surface layers, stronger selected-card border, separated pill tabs, legible descriptions and larger icon hit areas. | Easiest visual grouping and action recognition; more card chrome and vertical space than Swiss. Material Clarity is a local combination, not a named upstream style or a new Material component library. |

All three retain the original question, one compact settings/diagnostic toolbar, visible saved AI focus, four resource tabs, source identity, descriptions, saving, notes and a scrollable reader. The shared renderer owns behavior and identical example counts, so theme comparisons do not trade away functionality. At phone widths the reader is explicitly opened inline and the navigation becomes a controlled drawer.

## Typography, colors and motion

The catalog's Minimal Swiss and Academic/Research pairings informed hierarchy. These offline previews do **not** download Inter, Crimson Pro or Atkinson Hyperlegible. Swiss/Material use system UI fonts; Scholar uses an installed serif fallback for its reading surface. This tests typographic rhythm rather than claiming the upstream fonts were installed.

The Productivity Tool palette returned teal, while the Analytics Dashboard palette returned blue. User-approved Material blue primary actions remain consistent across all three; neither result silently changes Scout's brand or semantic chip colors. Swiss uses almost no shadow, Scholar has a restrained paper edge, and Material uses small elevation differences. None requires an animation library. Existing reduced-motion behavior remains in the shared renderer/base styles.

## What actually ran

The active/portable scoped skill pins upstream commit `d643997c82e94742dd3bee43210b0198e8bbba3d`; its `UPSTREAM.json` records every imported path, immutable URL, byte length and SHA256, and its MIT license is preserved. Scripts use Python's standard library. No npm CLI, sibling skills, global installation, packages, font binaries or native-only rules were installed.

[receipts-pro.json](receipts-pro.json) retains executed queries, commands and compact results. Local checks used the existing environment through `uv run --project backend --locked --offline --extra encoder`, preserving the encoder extra. They include exact style searches for all four chosen families, palette and typography matches, compact-label UX guidance, React guidance, Next.js guidance and three design-system explorations.

The Swiss generator matched Productivity Tool / Minimalism & Swiss Style. Material's generator matched Productivity Tool / Flat Design. Scholar's first broad query matched Book & Reading Tracker, which was unsuitable for the whole workspace; the narrowed retry matched Productivity Tool and Academic/Research typography. The final paper surface came from the verified explicit E-Ink/Paper search. Generated marketing/hero/testimonial patterns were **not** adopted for this existing research workspace.

The initial React state query returned memoized callbacks as its top result; the narrower `stable list keys` retry returned **Use keys properly**. Next.js returned client-component boundary guidance. Those rows declare React 19.2 / Next.js 16.2 applicability and remain dated advice: the installed project documentation and current package versions take precedence. This trial did not restructure application components.

## Reuse and provenance

Use `$scout-ui-ux-pro-max` for catalog-informed UI decisions and dense workspace reviews. It supports only the bundled domains/stacks and keeps its concise project entry point separate from unchanged upstream resources. Read the relevant reference on demand; do not load all catalogs into every task.

An update means reviewing a new immutable upstream commit, diffing scripts and complete linked tables, retaining license/attribution, refreshing the manifest, and repeating supported-mode smoke checks. The full upstream semantic validator expects omitted datasets; no claim is made that its complete suite ran. Exact upstream sources are linked in the skill manifest, including the [style catalog](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/d643997c82e94742dd3bee43210b0198e8bbba3d/src/ui-ux-pro-max/data/styles.csv), [typography catalog](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/d643997c82e94742dd3bee43210b0198e8bbba3d/src/ui-ux-pro-max/data/typography.csv), [palette catalog](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/d643997c82e94742dd3bee43210b0198e8bbba3d/src/ui-ux-pro-max/data/colors.csv) and [MIT license](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/d643997c82e94742dd3bee43210b0198e8bbba3d/LICENSE).

The common gallery and browser/visual validation record report the final measured preview checks separately. These artifacts demonstrate design and local interaction; they do not establish live retrieval quality or adopted application behavior.

## Visual review

Viewed all three desktop (1440px) and phone (390px) PNGs. Swiss visibly fits the most results: its third paper begins inside the desktop capture, while the other directions give more space to individual cards or reading. Scholar's wider reader and serif prose provide the calmest long-form rhythm. Material gives the clearest card/action boundaries and the most familiar blue treatment.

One observed mobile issue was corrected in the Scholar theme: its larger question text needed a third line, but the shared two-row textarea initially hid the ending. A mobile minimum height and progressive content sizing now expose the complete sample question. The refreshed mobile PNG was inspected to verify the correction. No other theme overlap or clipping was observed in the reviewed captures; browser overflow and interaction checks remain in the root validation report.

For a dense day-to-day research workflow, **Swiss Workbench** is the strongest direction within this family. Scholar is the distinct reading-focused alternative; Material is the familiar card-oriented alternative. Keep them separate for user comparison rather than silently blending them into a production theme.
