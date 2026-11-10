# Cal-inspired Research Scout trial

29 October 2026 · Design exploration only

This direction translates the restrained controls and light appearance of [starter.cal.com](https://starter.cal.com/) into a fuller research workspace. The starter exposes configurable corner radius, typeface and appearance; its [first-party repository](https://github.com/calcom/developer-starter-kit#theming) describes owned coss/ui primitives and shared theme variables. These are reference principles, not dependencies installed by this trial.

The mockup uses warm white surfaces, fine olive-gray borders, quiet icons, a compact permanent sidebar and dark primary actions. The research question is a real input, rather than a marketing headline. A unified results sheet keeps scanning calm, while a separate scope column makes search settings visible. Reading opens in a focused dialog, giving this direction a different rhythm from a permanent three-pane reader. System fonts are used; Cal branding and font files are not copied.

Trial interactions include progressive discovery replay, consistent source-type/date/access filters, lexical/semantic/hybrid mode selection, source previews, per-source notes, a human shortlist of up to three items, result sorting and density preferences. The export contains explicitly fictional demo records. Everything runs offline in the standalone HTML; no application files, dependencies or provider connections change. All titles, authors, identifiers and metrics are invented design data, not research evidence.

The Cal references were inspected through their current public page content and first-party implementation documentation. This is an interpretation of their light visual principles, not a claim to reproduce an authenticated Cal.com dashboard.

Interaction hooks for review:

- `#run-search`: replays arrival of 2, 4 and 6 illustrative sources.
- `[data-preview="RS-DEMO-002"]`: opens a source preview; `#source-note` stores a note in the current tab; `#dialog-save` toggles the shortlist.
- `#oa-filter`, `#year-filter`, `#type-article`, `#type-preprint`: filter the visible results.
- `#tab-shortlist` / `#review-shortlist`: show the shortlist.
- `#view-open`: opens preferences; `#density` changes result density.
- `#menu-open`: opens the compact-screen navigation.
