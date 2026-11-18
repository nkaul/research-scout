# Direction 09: Reference App

November 15, 2026. Add **exactly one app refinement preview** to the gallery. Preserve all eight existing options, including Research Observatory (#08), which remains the landing-page concept. The new option keeps Scout's current application structure and features; it is not another hero page or a production adoption.

## Evidence and design intent

Reviewed the current app's information-toolbar screenshot and current workspace/search component structure; the seven earlier previews and Observatory were also visually inspected. Existing live research content is inspection context only: the new mockup continues to use the same nine authored resources and example question.

The [DataPulse reference](https://www.uupm.cc/demo/saas-analytics-dashboard#features) contributes white surfaces on a light canvas, restrained blue borders and depth, colored outline icons and a clear hierarchy between section titles, card titles and descriptions. Its hero, feature sections, analytics charts, commercial claims and page topology do not belong in this app refinement. Keep the research task immediately available.

Compared with DataPulse Research Workspace (#07), make the improvement visible through moderate type weights, a warm/cool surface distinction, aligned action groups, more deliberate icon treatment and a calmer reading rhythm. Avoid its very heavy rounded display headings. Compared with Observatory, retain the sidebar and header, keep the editable question above results, and keep reading beside the list.

## Concrete visual choices

| Region | Treatment |
| --- | --- |
| Shell | White 216–224px sidebar, approximately 56px header, cool near-white main canvas (`#F8FAFC` family). Preserve navigation, breadcrumbs and current project location. No floating marketing navigation. |
| Type | Locally available sans family throughout. Aim for a 24–26px/650 page title, 18px/500 question, 16–17px/650 source titles, 12–13px metadata, 14–15px card prose and 15–16px reader prose. Keep body line height around 1.65–1.75. Use weight and spacing rather than a black display face. |
| Surfaces | White record cards, a lightly warm reader body (`#FFFEFB` family), cool header/control surfaces, pale blue hairlines. Use a small elevation scale: quiet cards, slightly clearer reader, strongest popover. Do not add glass, parallax, tilted surfaces or decorative charts. |
| Search | One compact question card with a clearly labeled, fully discoverable original question. Sources/Date/Custom/Limits/AI and all information controls remain directly below it. Keep the settings bar compact, wrapping groups before compressing labels. |
| Saved AI focus | A white, compact strip with a restrained violet edge/icon, saved lane query, contextual domain/tags, accessible +N and Query details. Avoid filling a large panel with decorative purple. Editing next-search AI/settings must not rewrite saved facts. |
| Resource tabs | Four compact, equal-role tiles, roughly 44–48px high: colored outline modality icon, label and truthful count badge. Preserve real tab semantics. Use tint/border/underline for the active tab without inflating counts into unrelated KPI cards. |
| Results | Retain a single-column record list beside the reader. Approximately 16px card radius and 16–18px padding, two initial source-derived points, quiet metadata and Read more. Keep selected outline/edge distinct from keyboard focus. Provider/year chips remain consistent and readable. |
| Actions and icons | Use one line-icon vocabulary. Small tinted icon wells can distinguish modalities/navigation; repeated source action buttons remain quieter. Align inspect/save/original/media actions on the left and observation/access facts on the right, with one baseline and consistent targets. Keep color names and factual labels available; do not encode meaning by hue alone. |
| Reader | A level, bounded right panel around 350–390px at wide desktop sizes, with fixed header/tabs and independently scrolling body. Use the slightly warmer reading surface and comfortable paragraph rhythm. Preserve source identity and authors/publication below text. Avoid oversized duplicate titles or repeated card chrome. |

Preserve compactness: at ordinary desktop width, show the beginning of useful records in the first viewport while leaving the question, settings, saved focus and modality tabs visible. Do not buy visual polish by adding a large empty introduction or moving the tool down the page.

## Preservation checklist

- **Navigation/header:** Scout identity/tagline, workspace switch, Discover, projects, saved resources/shortlist, Notes, recent searches, Providers, Settings, Admin/tokenomics, local/environment state and profile/context. Keep used/100 credits, settings and Export visibly available.
- **Project/workspace actions:** active project and concept where applicable, project management/create, save current query, New research, Search workspace and Exploration chat. Prototype actions may use explicit local dialogs or demonstrations; they must not navigate into live application services.
- **Search controls:** editable original question, Search, Sources, year slider/custom dates, four lane limits, explicit AI switch, Search overview, Query and focus, Sources and coverage, Timing and usage, compact timing/status, filter and active filter indication, plus visible Stop while replaying.
- **Results/state:** Papers/Videos/Data/Repos remain separate; retain truthful counts, unknown/off/pending/empty/partial/error distinctions, progressive loading, skeletons, local filtering and saved-versus-next preferences. Expanded diagnostics stay behind their existing controls.
- **Source reading/actions:** provider/year/access/observation/version identity; source-derived points versus Original; inline expansion; inspect, project save and original-source actions; paper PDF and video preview/transcript affordances; dataset metadata and repository README/topics; Overview/Metadata/Notes; local note draft preservation and explicit media actions. Changing selection must not silently discard an edited note.
- **Responsive/accessibility:** sidebar becomes an operable phone drawer; controls and chips reflow; four modality tabs remain reachable; reader becomes explicit inline content at small widths. Preserve visible labels, keyboard order, focus return, operable +N/tooltips, text zoom, long-title wrapping, reduced motion and useful loading/error announcements.

The main toolbar's existing semantic labels and the single information-pane ownership remain useful acceptance anchors. A visual preview should not imply new acquisition, model calls, account authentication or production persistence.

## Actual catalog evidence

The scoped `scout-ui-ux-pro-max` skill was read and **five local catalog searches actually ran**, using the existing locked/offline project environment with `--extra encoder --no-sync`. Full queries, returned rows, commands and decisions are in [app-refinement-catalog.json](app-refinement-catalog.json), pinned to upstream `d643997c82e94742dd3bee43210b0198e8bbba3d`.

Primary catalog sources at that immutable revision are [styles](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/d643997c82e94742dd3bee43210b0198e8bbba3d/src/ui-ux-pro-max/data/styles.csv), [colors](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/d643997c82e94742dd3bee43210b0198e8bbba3d/src/ui-ux-pro-max/data/colors.csv), [typography](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/d643997c82e94742dd3bee43210b0198e8bbba3d/src/ui-ux-pro-max/data/typography.csv) and [UX guidance](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/d643997c82e94742dd3bee43210b0198e8bbba3d/src/ui-ux-pro-max/data/ux-guidelines.csv). The bundle retains their MIT license notice; the catalog output is evidence for recommendations, not a mandate to replace the app's style.

The broad style query returned neumorphism/glassmorphism/micro-interactions; those were not treated as a suitable surface system. One narrower retry returned `dimensional-layering`, adapted only for bounded hierarchy and depth. The research-lab color row supplies the near-white/navy/slate foundation; current blue actions and the subtle warm reader are deliberate adaptations. `Friendly SaaS` informs the single-family interface principle, without downloading or claiming an installed catalog font. UX results specifically cover compact-label overflow, native control semantics and visible input labels. No design-system generator, engine audit or provider/model call was run.

## Review after the draft

Compare #09 with the current app and #07 at the same desktop/phone widths: the hierarchy and features should remain familiar while type, surfaces, icon meaning and action alignment visibly improve. Inspect a populated reader and notes state, not only the composer. Validate 320px through wide desktop, long titles and chips, keyboard controls, scroll containment, expanded information, source identity, media actions, loading replay and local-only network behavior. Document a visual limitation directly rather than removing a required feature to make the screenshot cleaner.

## Rendered critique and limitations

Reviewed the [desktop](screenshots/datapulse-app-refined-desktop.png) and [phone](screenshots/datapulse-app-refined-mobile.png) captures and a populated reader diagnostic. The layout reads as the existing app, with clearer modality tiles, a more moderate heading treatment than #07, consistently aligned source actions and a readable, slightly warmer reader. The phone retains the full original question and reflows its controls without visible overlap. No landing-page structure was introduced.

The final refreshed captures were reviewed after the byline contrast and mobile reader-close focus fixes. “Discover Research” uses proper case, and visible observation counts now accompany accessible provenance labels. Independent QA verified the counts against all nine authored records and checked that New research cancels a replay without stale arrivals. No further visual changes were requested.

The [final acceptance report](validation-app-refinement.json) records **29 passing checks**, no horizontal overflow at seven widths from 320 to 1440px, and five measured opaque text/background contrast ratios from 4.81:1 to 15.59:1. It records no runtime/CSP errors, external/API requests or HTTP writes. Gradient backgrounds were not measured; this is scoped prototype evidence, not a complete accessibility audit or a production behavior guarantee.

The approximately 108px focus strip remains a density tradeoff: it keeps saved facts clear but offers little improvement in first-record position over #07. Metadata and chips are deliberately compact. These limitations were retained without removing information or adding a landing-page introduction; application adoption remains a separate decision.
