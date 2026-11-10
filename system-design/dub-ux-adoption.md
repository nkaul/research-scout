# Dub-inspired UX adoption

**Selected October 29, 2026 · implemented and validated October 30 · existing stack retained**

The user selected the [Dub-inspired trial](../discovery/ux/2026-10-29-linear-cal-dub-trials/dub-trial.html) as the visual direction for the working application. This supersedes the earlier blue palette and initially closed desktop inspector. The trial remains an unchanged, fictional design artifact; its sample records and scripted search are not installed in the application.

## Stack and service boundary

Retain Next.js App Router, React, TypeScript, authored CSS and local SVG icons. No component framework, new dependency, backend change, database, hosting, authentication or provider integration is introduced. Existing Python services, LangChain Deep Agents, application MCP, provider isolation, bounded hybrid discovery and SSE contracts continue to apply. Provider/live-model access gates remain as recorded in [implementation status](implementation-status.md).

## Implemented presentation

| Trial pattern | Application behavior |
| --- | --- |
| White left navigation | Discover, Saved shortlist, Research notes, saved run history, Providers and Settings. No invented account or collaborative workspace state. |
| Slate canvas and dark primary actions | Neutral surfaces, fine borders, blue selection accents, restrained shadows, 14px reading copy and important metadata at least 12px. |
| Research question with scope chips | Existing controlled query, provider selector, hybrid label, editable year bounds in Settings and visible 2,000 UTF-8-byte limit. Edits prepare the next explicit search. |
| Source index and document preview | Persistent desktop reader with Overview, Metadata and Your notes tabs; first available record can be read immediately, without an automatic details call. Selecting another record changes the reader. |
| Progressive status | Actual lexical/semantic outcomes, available source count, reconnect/cancel state and retained warnings. No simulated timers or invented relevance scores. |
| Source controls | Human inclusion/exclusion, three-source cap, local title/author/year filtering and explicit application of saved ranking. Arrivals do not automatically reorder existing rows. |
| Research notes | Existing saved selection reasons, grouped into a view for the current run. A draft remains keyed by run/source through updates and conflicts. A note saves with an include/exclude decision; this is not a new notebook backend. |
| Inspector tabs | Overview shows supplied content and its limits. Metadata contains provider provenance, explicit details/DOI checks and whole-record citation choice. Your notes contains the decision and reason editor. |
| Preferences and provider controls | Comfortable/compact spacing and optional list excerpts affect the open workspace. Provider status is read from the existing application configuration; no fabricated connection setup. |
| Narrow layouts | A stacked index/reader at tablet widths; mobile navigation and a native source dialog below 900px. Focus returns to the source button after closing the dialog. |

The trial's Open access filter is omitted because the current frontend contract does not supply a reliable access predicate. Lexical/semantic toggle settings are also omitted: the current run contract remains bounded hybrid discovery. Abstract availability is labeled separately from full-text acquisition. The trial's fictional account, citations, relevance labels and sample progress are replaced with application state.

## Preserved workflow requirements

SSE updates retain row identity, active reading context, local reason drafts and human selections. Search/reopen, conflict recovery, explicit provider details, agency-routed registry observations and immutable revision exports keep their existing API paths. Display preferences and local result filtering make no research/model calls. Crossref/DataCite observations cannot replace discovery fields without the existing explicit citation-source choice.

No live-provider or hosted-model quality claim follows from this visual update. Validation and rendered screenshots are recorded in the [UX implementation review](../docs/validation/dub-ux-adoption.md); the October 26 implementation receipt remains a historical baseline.
