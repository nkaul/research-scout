# Compact reader, aligned actions and explicit date refresh

November 11, 2026. This user-directed refinement builds on the project workspace without changing backend services or retrieval policy.

The main reader now keeps title context available to assistive technology while removing the repeated visible title, authors, venue and citation banner from Overview, Metadata and Notes. Its short header identifies the provider/year; the selected row supplies the visible citation. Video descriptions, metadata coverage, retrieval ranks, coverage warnings and paper open-access reporting use collapsible sections. Metadata retains additional record identifiers and version information. Notes retain the existing run/project distinction and historical-version guards.

Paper and video preview, save, original-source and provider controls share one action line. Video actions span the full card width below the thumbnail/description. Provider disclosure opens a separate report below the line, preserving each provider's original title, identifier and version. Narrow screens retain accessible names while showing compact icons.

Desktop Search reserves its reader column before selection, avoiding a card-width jump under the pointer. Saved paper/video reads show a skeleton immediately. Existing reader tabs remain mounted to preserve focus; old content and footer actions are inert while loading. Sequence fences retain the latest row intent, and closing/navigating prevents a delayed response from reopening the reader. Mobile retains the inline reader.

Custom date edits were previously next-search preferences, so existing results correctly retained their old scope but the refresh action was unclear. **Apply range & search** now submits the visible question through the normal pipeline with the edited publication bounds and selected sources. It creates a fresh saved search and replaces the current results. Invalid or reversed years are rejected before dispatch. Typing individual year digits does not start repeated retrieval/model calls. Date/source preferences and previous query records remain preserved.

Validation includes new cases for compact identity across tabs, one-line actions at 1440/390/320px, collapsible reports, delayed paper/video skeletons, stale-response protection, applied date bounds/result replacement and inert actions during transitions. Related reader, navigation, projects and date regressions are also exercised. The shared mock SSE implementation now replays saved state on connection, matching actual server behavior; previous immediate publication could otherwise race initial subscription.

See the [combined receipt](../docs/validation/2026-11-11-reader-refinement-final.json) for exact checks, source hashes and cached-live evidence. The final production build uses an isolated source copy with existing dependencies, leaving live research uninterrupted. No backend/provider/model configuration, credentials, budget holds or provider semantics changed.
