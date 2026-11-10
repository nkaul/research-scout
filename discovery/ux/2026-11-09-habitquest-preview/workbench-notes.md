# HabitQuest-inspired lavender workbench

**November 9, 2026 · quick standalone preview · illustrative data**

This is the professional adaptation of the repository's [HabitQuest UI Design skill](../../../../skills/habitquest-ui-design/SKILL.md). The skill and its visual foundations, component patterns, artwork/motion guidance and dashboard screenshot were read. The source frontend's `01-tokens.css` and `13-coach-catalog.css` were also inspected read-only under `hq/habbit-quest/frontend/`.

The preview transfers HabitQuest's lavender-white canvas, deep violet hierarchy, selective gold, 24px panels, 14–18px inner cards, rounded controls, soft tinted shadows and colorful semantic book artwork. Supporting text uses the skill's darker `#5b5486`; the white-label primary gradient uses its contrast-adjusted `#6846d9 → #5a3fc6`. System/rounded local font fallbacks replace the original remotely loaded Fredoka and Plus Jakarta Sans. The shared book/sparkles SVGs are the skill's Microsoft Fluent Emoji assets; their MIT notice and provenance stay in the shared assets folder.

Research Scout keeps a practical sidebar, question composer, source index, persistent reader, source provenance and human shortlist. HabitQuest family, children, buddies, credits, rewards and backend/AI behavior are not transferred. This page does not call the running application or any provider. Every source and discovery outcome is fictional. State is in page memory and resets on reload.

Working controls: source selection, overview/metadata/notes tabs and arrow-key tab navigation, shortlist up to three, per-source note drafts, search within received sources, 2026 filtering, density preferences, native settings/provider/navigation dialogs, and an explicitly illustrative two-to-four-source arrival replay. Selecting a source on stacked layouts scrolls to its reader. Main application files and earlier prototypes remain untouched.

QA hooks: `[data-source="demo-01"]` selects a record; `#save-source` toggles it; `[data-tab="notes"]` opens `#source-note`; `#filter`, `#recent-filter`, `#compact` and `#comfortable` change the local view; `#top-settings` opens `#settings`; `#apply-settings` commits local display preferences; `#replay` or `#search` replays arrivals. Notes and shortlist survive that replay. Root owns rendered desktop/mobile review.
