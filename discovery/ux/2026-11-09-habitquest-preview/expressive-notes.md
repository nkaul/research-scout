# The discovery desk — expressive HabitQuest adaptation

November 9, 2026 · standalone preview only

Applied the [HabitQuest UI Design skill](../../../../skills/habitquest-ui-design/SKILL.md), its visual-foundations, component-patterns and artwork/motion references, and visually inspected the skill's dashboard reference. HabitQuest's source frontend and instructions were read as references; no source application was changed.

The preview carries pale lavender, deep violet hierarchy, rounded panels/pills, warm gold shortlist accents and semantic research-object artwork into Research Scout. Original inline SVG papers, books and lenses replace HabitQuest's family/buddy/reward identities. Licensed book/sparkles icons are shared assets supplied from the skill. System/rounded local fonts avoid a remote font dependency.

The composition is more expressive than the denser sibling preview: contained research artwork, small illustrated source cards, a white reading panel and an inviting question composer. The research action remains central; no quota, rewards, extra AI agent or backend behavior is invented.

All source titles/authors/abstracts are fictional. Search replays four fixed illustrative records with an explicitly labeled pending batch. No provider or model is contacted; changing the question does not make sample results real or relevant to the new question. Notes and shortlist live only in page memory.

Trial hooks:

- `#run-search` replays 2 → 4 sources; existing reader/note DOM remains stable.
- `[data-inspect="01"]` selects a record. At ≤980px it moves the same reader into a native dialog, with Escape/close and focus restoration.
- `[data-save]` and `#reader-save` toggle the three-source shortlist.
- `[data-view]` chooses Discover, Shortlist or notes; `#abstract-filter` filters supplied abstracts.
- `#source-note` stores a per-source reading note in the preview session.
- `#top-settings` opens `#settings-dialog`; `#density` changes spacing.
- `#new-question` clears the query while preserving trial decisions. `index.html` links to the parent comparison gallery.

Root handles browser/visual QA and preview delivery. No Research Scout implementation files, dependencies or services are modified by this concept.
