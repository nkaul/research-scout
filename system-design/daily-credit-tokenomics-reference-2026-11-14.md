# Daily credits — Habit Quest reference and Research Scout adaptation

November 14, 2026. Reference research and implementation-review checklist. The user explicitly authorizes replacing Research Scout's lifetime $0.25 admission block with an enforced **100-credit daily allowance**, a visible credit bar, a reset control and an **Admin page without login or admin credentials**. This supersedes earlier instructions to retain that lifetime admission ceiling. Per-operation USD/output bounds and historical accounting still apply.

No Habit Quest code, credentials, runtime database or private family state was changed or copied. No paid model request was made for this analysis. The source/reference paths below were read from both local checkouts; their `tokenomics.py` files were byte-identical at review time.

## What Habit Quest actually implements

The reference is **FastAPI/PostgreSQL**, with `psycopg`, family-scoped accounting, database roles and a separate authenticated operator console. It is not an existing SQLite implementation to copy into Research Scout.

| Source | Verified behavior worth adapting |
| --- | --- |
| [Current design](~/Documents/repos/hq/habbit-quest/docs-design/11-tokenomics-latency-and-observability.md) | Distinguishes product credits, HTTP attempts, measured tokens, estimated USD and unresolved provider exposure. Historical analyses/prices are dated inputs, not invoices. |
| [Accounting module](~/Documents/repos/hq/habbit-quest/backend/src/habitquest_backend/tokenomics.py) | `_window` uses timezone-local calendar midnights. `begin_operation` serializes admission, checks the request identity and snapshots policy/window before work. `record_attempt` persists dispatch before provider work and updates the same attempt when usage arrives. |
| [Recovery and settlement](~/Documents/repos/maiteam36/habitquest/backend/src/habitquest_backend/tokenomics.py) | Stale undispatched slots can be released; incurred/uncertain exposure remains. Attempts can settle after an operation closes, without inventing another dispatch. `finish_operation` separates useful-result credits from actual provider expenditure. |
| [HTTP metering](~/Documents/repos/hq/habbit-quest/backend/src/habitquest_backend/tokenomics_usage.py) | Allowlisted metadata only: routing, IDs, counters and timing. Each SDK retry is a separate attempt. Prompts, response text and vectors do not enter the accounting projection. |
| [Schema migration](~/Documents/repos/hq/habbit-quest/backend/db/migrations/202611050003_tokenomics.sql) | Separate policy, windows, operations, attempts and legacy-exposure records. Unique request/attempt IDs, policy snapshots and preserved historic exposure support auditability. |
| [Credit meter](~/Documents/repos/maiteam36/habitquest/frontend/src/components/CoachingBudget.tsx) | Shows used, pending, remaining and reset time; an accessible progress bar explains reservations. Completion/failure/focus events refresh authoritative GET state with sequence guards; failed refresh preserves a visibly stale balance. |
| [Admin](~/Documents/repos/maiteam36/habitquest/frontend/src/pages/Admin.tsx), [API](~/Documents/repos/hq/habbit-quest/backend/src/habitquest_backend/admin.py) | Policy/metrics/history views omit application conversation content. Token history distinguishes measured, partial, unavailable and inapplicable counts. Policy changes are versioned. |

Important differences: Habit Quest's starting policy charges **useful completed activities**, such as two Coach credits or one habit-batch credit, and defaults to tracking-only. It can block on legacy USD exposure when enforcement is enabled. Its family/JWT/admin-login system, activity weights, embeddings/Pinecone charges, failed-result credit refunds and old USD admission gate are **not** adopted here. Habit Quest's daily-window code is a reference; the new manual reset is Research Scout's own explicit policy.

## Research Scout credit contract

- **Unit:** one credit per dispatched hosted-model HTTP request attempt, including failed or uncertain outcomes. Credits are product request units, not tokens, dollars or a guaranteed token allowance. Local encoding, source REST/MCP calls and saved reads cost zero model credits.
- **Admission:** atomically reserve the operation's worst-case remaining calls before accepting paid work: up to nine for four-provider planning/review/repair, one for an explicit answer. If fewer credits remain, fail visibly before dispatch rather than start a workflow that cannot fit its reserved topology.
- **Dispatch:** persist a unique operation/step attempt and convert one reserved slot to one used credit immediately before the HTTP boundary. Complete all known cancellation/preflight checks first. Database commit plus network send cannot be atomic: a crash at that boundary is conservatively charged as uncertain, rather than granting a free retry.
- **Completion:** settle observed tokens and estimated USD onto that exact attempt; release only undispatched reserved slots. A failed/refused/truncated/unknown request still used its dispatched credit. Repeated completion or replay cannot charge twice. Missing usage remains unknown, not zero.
- **Day:** default to `America/New_York`, matching the user's timezone, with UTC-stored instants computed from successive local calendar midnights. Do not use a fixed UTC offset or add 24 hours across daylight-saving transitions.
- **Manual reset:** an explicit UI action creates a new current window epoch with 100 fresh credits until the next local midnight. It does not delete operations, tokens, costs, uncertainty or old reservations. A reset request uses an idempotency key plus the expected current window/revision; an outdated tab cannot inadvertently reset again.
- **Late work:** each admitted operation retains its original window. Later dispatch/settlement after midnight or manual reset affects that original allocation, never the new window. Display current-window credits separately from actual requests grouped by wall-clock dispatch time.
- **Retained limits:** keep the reviewed per-operation $0.05 bound, fixed request topology, planning/review output limit of 2,600 tokens and answer limit of 800 tokens. The new daily policy replaces the old lifetime admission barrier; it does not silently expand per-call capabilities or enable model retries.

## Persistence and service boundary

Use a small core-owned economics service with Python's standard-library `sqlite3`. The canonical live workspace stores its database in **`backend/db/tokenomics.sqlite3`**, the selected database folder; isolated fixture/custom state uses its own state directory. `get_economics` provides a content-free authoritative projection for the credit bar and Admin; provider adapters remain isolated and do not acquire a new dependency or separate budgeting authority. Reset is an explicit application UI/API action, not an autonomous agent capability.

Keep policy/windows, operation reservations, unique attempt records, reset audit and legacy import metadata in the database. Serialize check-and-reserve/update operations with short `BEGIN IMMEDIATE` transactions, unique constraints, foreign keys and a finite busy timeout. Never hold a database transaction across provider HTTP. SQLite permits concurrent readers but a single writer; a deferred read-then-write check alone does not serialize competing admissions. [SQLite transaction semantics](https://www.sqlite.org/lang_transaction.html).

The core also retains an exclusive database-owner lock for the recovery lifecycle. Distinct application state directories must not share a database and independently classify each other's active reservations as abandoned. Multiple short database connections remain supported; the owner lock protects recovery authority rather than replacing transactional admission.

The selected local configuration is rollback journal **`DELETE`** with **`synchronous=FULL`**. WAL is unnecessary for this first slice. SQLite documents a WAL/checkpoint race affecting older runtimes; [release 3.51.3](https://sqlite.org/releaselog/3_51_3.html) fixes it. The chosen rollback mode avoids that WAL-specific path without a runtime install or dependency change. [Primary advisory, section 11](https://www.sqlite.org/wal.html).

Import the old JSON ledger once using a recorded source digest; retain the original file and every legacy cost/unknown-hold record. Do not re-charge historical HTTP calls into the new daily credit epoch. Imported unresolved USD exposure remains visible history but no longer blocks new daily-credit admission, as explicitly authorized. Keep SQLite authoritative for new accounting and avoid independent JSON/database budget decisions. Backups and ignore rules must cover operational database/journal files; research, projects and provider grants are unchanged.

## Admin and meter presentation

The Admin page is a local operations view, **without authentication setup**, as requested. It should explain the credit rule, show current allowance/used/pending/remaining/reset time and expose an explicit reset action. History can show operation kind/status, model, dispatch count, recorded token counts, estimated USD and unknown exposure; it should not expose questions, source snippets, model bodies, response text, credential values or private filesystem paths. A reset changes the current credit epoch, not the historical totals.

Keep product credits, actual reported tokens and estimated USD in separate columns/cards. Zero model credits for a source lookup does not imply that provider has unlimited API quota. A loading, stale or unavailable meter must not show a fictional full balance. Refresh via saved GETs after operations/reset/focus; preserve source selection, search drafts, notes and reader state. The backend remains the admission authority even if an older tab displays enough credits.

## Review cases

1. Concurrent reservations cannot spend more than the current epoch's allowance; nine reserved slots block competing admissions correctly.
2. A one-request clarification spends one credit and releases unused research slots; cancellation before dispatch spends zero; failed/unknown dispatch spends one.
3. Replaying request/step/reset keys neither dispatches nor charges again; conflicting payloads fail explicitly.
4. Midnight, DST's 23/25-hour days and manual-reset epochs preserve old operation ownership; late completions do not modify new-window balance.
5. Restart releases undispatched abandoned slots while retaining dispatched credits and unknown USD exposure; no replay of uncertain work.
6. Legacy import is complete/idempotent, original JSON remains unchanged, and legacy holds no longer cause the lifetime block.
7. Token totals are measured/partial/unknown rather than estimated from credits; Admin/meter responses contain no research text or secrets.
8. Existing operation/output/provider limits and source-state behavior still pass; fixture tests do not imply new live model access or spending.

## Implementation review status

Reference research and most read-only implementation review are complete. The current implementation uses the selected SQLite transaction/journal settings, imports and verifies a content-preserving legacy backup, keeps current and historical epochs separate, exposes token-coverage counts beside recorded subtotals, and resolves later measured financial usage without spending the new window. Review also corrected returned-model retention, the same-database recovery-owner race, and ambiguous UI reset retries so they preserve the original expected window and request key. Admin's reset timezone comes from the authoritative response.

Final bounded read-only review found no remaining blocker in the agreed accounting/Admin scope. Known pre-dispatch generation cancellation now keeps attempt counters at zero and terminal usage reconciles from the durable ledger; retrieval accounting can reconcile after cancellation without reopening the research turn. The owner-lock, late-settlement, backup, model-identity and reset-retry corrections were verified in source and focused regression cases were inspected.

Full-suite/build/browser checks, actual fixture integration and controlled production migration remain the parent task's responsibility. This document does not claim a live paid call, current provider prices, successful production migration or completed validation. Costs remain retained app estimates, separate from credits and actual reported tokens. The Analysis agent accessed no production accounting database or legacy runtime ledger.
