# Reusable design skills and Research Scout mockup trials

November 15, 2026. **Approved and executed.** Three agents reviewed Impeccable, UI UX Pro Max, and the supplied DataPulse reference, then built the seven standalone mockups and two scoped skill bundles after approval. [Gallery and implementation record](README.md) · [Browser acceptance](validation.json). Application code remains unchanged.

## Findings

[Impeccable](https://github.com/pbakaus/impeccable) provides refinement guidance covering layout, typography, meaningful grouping, readable states and polish. Its [Operate guidance](https://github.com/pbakaus/impeccable/blob/main/skill/reference/operate.md) and [polish workflow](https://github.com/pbakaus/impeccable/blob/main/skill/reference/polish.md) fit an existing research workspace. Current native audit/critique workflows also involve an engine and detector accounting. The initial trials will explicitly use **Impeccable-guided design review**; that does not establish that its native detector or audit ran. Automatic hooks and live-edit mechanisms are outside this initial scope.

[UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) supplies searchable styles, palettes, typography, UX guidance and stack references. Its [Python search implementation](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/src/ui-ux-pro-max/scripts/search.py) uses local catalog retrieval; design-system generation is not itself a hosted-model request. Generate recommendations and separately consult React/Next.js guidance: the generator does not apply the stack flag to its design-system output. Use a coherent reviewed resource subset, including scripts and their linked catalogs, instead of assuming that copying SKILL.md alone is sufficient.

The [DataPulse reference](https://www.uupm.cc/demo/saas-analytics-dashboard#features) was rendered and visually inspected. It is a marketing landing page containing a dashboard preview; working product interactions were not verified. Useful elements include pale cool surfaces, white rounded cards, delicate blue borders, restrained depth, navy/slate text and colored line icons. Adapt these to Scout's compact workspace. Keep Material blue primary actions, resource counts in tab badges and detailed timing/coverage behind their toolbar icons.

## Seven proposed mockups

| Family | Variant | Main treatment |
| --- | --- | --- |
| Impeccable-guided | Quiet Workbench | Closest to today's UI: precise alignment, clearer typography, flat compact rows and quieter borders. |
| Impeccable-guided | Research Folio | Warm light reading surfaces, calmer metadata and stronger source-title/prose rhythm. |
| Impeccable-guided | Signal Desk | Light slate layers and stronger selected-row, focus, provenance and progress distinctions. |
| UI UX Pro Max | Swiss Workbench | Catalog-informed Swiss hierarchy and data-dense structure, with a disciplined grid and efficient list/reader proportions. |
| UI UX Pro Max | Scholarly Reading Desk | An E-Ink/Paper-inspired reader with an academic typography direction, surrounded by compact ordinary controls. |
| UI UX Pro Max | Material Clarity | A proposed combination of accessible, data-dense guidance with existing Material blue, distinct surfaces, semantic chips and clear interaction targets. |
| Supplied site adaptation | DataPulse Research Workspace | Reference-inspired cards, depth, typography and icon treatments within Scout's existing navigation/search/results/reader structure. |

These are proposed design directions, not claims that upstream recommends each combination for Research Scout. Keep the families separate during the first comparison. Favor light themes, reflecting the user's established preferences.

## Reusable skills after approval

Create two scoped skills: `scout-impeccable` and `scout-ui-ux-pro-max`. Use active `.agents/skills/` folders and matching portable `skills/` copies, following the repository's existing convention. Register usage in AGENTS.md and the skill index.

- Keep entry points concise. Put detailed upstream guidance, catalog resources and the reference-site adaptation recipe in supporting resources.
- Pin one immutable upstream commit per bundle; record URLs, imported paths/hashes, retrieval date, local modifications and update procedure. Preserve relevant LICENSE/NOTICE material and attribution. Keep these manifests separate from the historical GitHub Manager transfer records.
- The Impeccable wrapper retains reviewed written guidance and identifies its guidance-only boundary. Engine-based audits can be considered later when their evidence is needed.
- The UI UX Pro Max wrapper retains the local search/generator scripts and complete linked tables required for supported style, color, type, UX and React/Next.js searches. Smoke-test those operations with the existing project Python tooling. Preserve the current Next.js/React/CSS stack.
- Repository requirements and current user choices take precedence over upstream style defaults. Future design tasks load only the relevant skill/resources, and record the resulting token/component decisions and rationale.

## Common baseline and deliverables

Every preview starts from the current Research Scout UX: left navigation, project/query actions, used-credit display, original question, Sources/Date/Limits/AI controls, overview/query/coverage/timing icons, visible timing, automatic AI focus, four resource tabs and a right-hand reader.

Preserve the visual affordances for source identity, abstracts/descriptions, Key points/Original, inline expansion, PDF/video preview, notes, saving, loading skeletons, progressive results and honest empty/error states. Use identical authored example content and counts across variants. No private saved research, model calls or provider queries are needed.

Deliver seven standalone responsive HTML/CSS/JS previews, a comparison gallery, desktop/mobile screenshots and a short rationale for each. Local interactions should demonstrate tab changes, selected resources, expansion and loading states. These are review artifacts under `discovery/ux/2026-11-15-design-skill-trials/`; app adoption is a later selection step.

## Execution and review

After approval, parallel agents own the Impeccable family, UI UX Pro Max family and site adaptation. Root integrates the reusable skill bundles, common content contract and comparison gallery, then reviews the results together.

Check typography, density, hierarchy, contrast, icon meaning, tooltips, focus, keyboard use, reduced motion, long titles and reader scrolling at phone, tablet and desktop widths. Compare each preview against the same baseline; document meaningful tradeoffs and recommend the strongest direction. Update the UX research index and keep application code unchanged during the mockup trial.
