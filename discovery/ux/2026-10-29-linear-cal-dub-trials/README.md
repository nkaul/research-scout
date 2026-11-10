# Research Scout — Linear, Cal.com and Dub trials

**October 29, 2026 · three independent design agents · trial mockups only**

Open the [comparison gallery](index.html). Each direction is a standalone HTML file with inline CSS, JavaScript and SVG, system fonts, and fictional research records. No installation or provider access is required. The existing application and the earlier six concepts are preserved.

The user's “lear.app” reference is interpreted as **Linear.app**, following the earlier discussion about Linear's workspace. All three studies use a light main canvas, left navigation, and richer workspace controls. They adapt product interaction patterns into original Research Scout designs rather than copying brand identities or marketing pages.

| Trial | Direction | Design rationale |
| --- | --- | --- |
| [Linear-inspired](linear-trial.html) | Compact navigation, source index and persistent reader. | [Reference notes](linear-notes.md) |
| [Cal.com-inspired](cal-trial.html) | Warm white, spacious research workbench with visible search scope. | [Reference notes](cal-notes.md) |
| [Dub.co-inspired](dub-trial.html) | Crisp controls, structured source management and a split inspector. | [Reference notes](dub-notes.md) |

To try the gallery locally from the repository root:

```sh
.venv/bin/python -m http.server 3201 --bind 127.0.0.1 --directory discovery/ux
```

Then open <http://127.0.0.1:3201/2026-10-29-linear-cal-dub-trials/>. The HTML files can also be opened directly. The server command exposes only the local UX research directory on loopback.

For a useful comparison, inspect the same workflow in each: understand the question and selected provider; open a source; shortlist it; adjust filters or workspace settings; then narrow the viewport. Local interactions are demonstrations with illustrative data. They do not call OpenAlex, other providers, models, or the application backend. Settings and sample progress do not establish working production capabilities.

No direction is selected for implementation. Choosing a visual direction is a later decision; existing provider isolation, progressive delivery, provenance and human-decision requirements continue to apply.

Browser checks and screenshots are recorded in [validation.md](validation.md) and `previews/`. The [previous six concepts](../2026-10-28-design-exploration/index.html) remain available for comparison.
