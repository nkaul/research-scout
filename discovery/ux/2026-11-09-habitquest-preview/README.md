# Research Scout — HabitQuest UI quick previews

**November 9, 2026 · two design agents and a hybrid follow-up · preview only**

Open the [comparison gallery](index.html): [Curiosity studio](preview-expressive.html) offers a more expressive interpretation; [Lavender workbench](preview-workbench.html) adapts the same visual language to denser research work.

The user's follow-up favors a hybrid. [Research Scout, with warmth](preview-hybrid.html) keeps Dub's compact organization and dark primary actions, adding selective lavender accents, softer panel corners and one book illustration. The [hybrid notes](hybrid-notes.md) describe that balance. All three directions are standalone previews; no new implementation direction has been applied to the app.

The user explicitly requested the repository's [HabitQuest UI Design skill](../../../../skills/habitquest-ui-design/SKILL.md). The agents read that skill and its visual/component guidance, inspected synthetic reference screenshots and used the local `hq/habbit-quest/frontend` as visual evidence. The transfer is limited to warm lavender/cream surfaces, violet hierarchy, selective gold accents, rounded cards/pills, semantic artwork and restrained motion. Research Scout's current Dub implementation and all HabitQuest source remain unchanged.

All previews are standalone HTML/CSS/JavaScript with fictional research records and local-only controls. There are no backend, provider or model connections. The original Fredoka/Plus Jakarta Sans fonts are not bundled in the source skill; these previews use local system fallbacks without remote font requests. Three unmodified Microsoft Fluent Emoji Flat icons are copied from the skill with their [MIT notice](assets/LICENSE) and [source/hash provenance](assets/provenance.json). Reference screenshots and HabitQuest characters/catalog are not shipped.

The [design notes](expressive-notes.md) and [workbench notes](workbench-notes.md) explain the two adaptations. Rendered screenshots and basic browser checks are stored in `previews/` and `preview-checks.json`. These checks assess mockup layout and interactions, not production functionality or a complete accessibility audit.

## Quick review

All three previews and the gallery passed twelve layout checks at 1440px, 390px and 320px. Six desktop/phone interaction flows checked early fictional source review, note/focus retention, shortlist limits, filters and settings. There were no JavaScript errors, runtime HTTP requests, document overflow, broken images or missing visible labels in the checked initial states. The solid-background text sample covered 614 pairs with no flagged contrast failures; six gradient-background samples were unmeasured. This is scoped mockup QA, not full accessibility conformance. All 40 application source/dependency/test baseline files remain byte-identical.

The review server is available at <http://127.0.0.1:3212/>. To restart it from the repository root:

```sh
.tools/node/bin/node discovery/ux/2026-11-09-habitquest-preview/serve-preview.mjs
```
