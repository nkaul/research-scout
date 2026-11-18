# Compact controls, resource loading and Research Scout identity

The latest user refinement keeps Sources/selection, Date range, Custom years, Videos and AI refinement together in one desktop control row. Project selection, project creation/management and saving the current query move to the workspace header beside New research and the Search/Exploration switch. The light Refined + Workbench design and existing stack remain in place.

## Controls and behavior

- Sources shows its selection count and opens a bounded multi-source panel. Existing provider availability and four-source limits remain enforced.
- Date range retains the remembered adaptive year slider. Custom is a calendar icon that opens year inputs and the explicit Apply range & search action.
- Videos shows the requested count and opens a 1–20 slider. It replaces the native dropdown while retaining the same remembered setting and request field. Editing never starts a search.
- AI refinement is a distinct sparkle icon switch with state and explanatory tooltip. Its optional AI/direct behavior and model-credit accounting are unchanged.
- Search settings remains an icon disclosure in the control row. Longer connection/routing details stay in its popover.

Small screens use compact wrapping rather than overflow. Control panels stay within the viewport, scroll in the space above or below their trigger and keep that trigger accessible. Escape returns focus; outside interaction closes a panel; opening another closes the previous panel. Sources supports keyboard activation and disabled transitions close stale panels. Inline application validation still handles date errors before dispatch.

Project actions keep their existing handlers and authority: moving them does not create projects, save queries or fetch resources automatically. Saved search scope and next-search preferences remain separate. Save query follows the active Search or Exploration conversation; starting a new chat cannot save a stale Search query.

## Honest loading per resource

Papers, Videos, Data and Repos tabs expose a visible spinner and `aria-busy` for real loading work, with one polite status summary. Initial admission/saved-history loading is distinct from provider retrieval. Selected lanes remain busy while their AI plan is being prepared; clarification stops that activity. A completed paper lane stops spinning while YouTube continues. Access-only enrichment does not keep unrelated discovery tabs busy.

Data/Repos start saved reads on first visit, and start provider work only through explicit Find/Refresh. Visited panels stay mounted while hidden and inert so active SSE, notes and progress survive tab changes. Activity and count callbacks are bound to conversation and turn; stale reports cannot update another query. All initial reads settle before the loader clears, including partial read failures. Idle, failed, completed and cancelled work does not leave a perpetual spinner.

## Identity and motion

The wordmark is **Research Scout**, with the tagline **A little curiosity goes a long way**. Main headings use **Discover Research** and **Explore Research**. A Material blue navigation mark and matching SVG favicon replace the generic compass treatment. The logo remains a crisp vector asset within the existing icon system.

The busy search graphic is a 56px atom: three independently moving rings and orbiting particles plus a gentle overall wobble. It is decorative inside the existing accessible loading status. Reduced-motion preferences retain a visible static illustration and stop its animations.

## Validation

Acceptance checks the one-line desktop layout, project placement, source/date/video/AI controls, popover trigger access on short screens, remembered values, no implicit submission, per-lane tab progress, background saved reads and cancellation. Motion is checked in Chromium with and without reduced motion. Existing research, project, media and keyboard workflows remain regression requirements. [Validation receipt](../docs/validation/2026-11-14-compact-controls-final.json).

This is a frontend refinement. Python services, retrieval/generation policies, provider connections, credentials and SQLite credit accounting are unchanged. Fixture verification does not spend live model credits or query live providers.

Completed acceptance: 218 cases passed in the full browser run, followed by 9 focused project/toolbar checks on the final header-context correction, covering 219 unique cases. TypeScript and production build pass; all 81 frontend source files match the tested artifact. Chromium verified the 56px atom's independent animation and static reduced-motion state. Saved-live checks pass across 13 healthy services, 58 paper cards and 10 video cards. All 765 existing JSON/config files and model accounting are unchanged; no live source search, paid model call or credit reset was made.
