# Using Research Scout

> **Historical source material — copied 25 October 2026.** This document originated in the GitHub Manager Research Scout work of 23 October 2026. Implementation statements, paths, commands, localhost addresses, test counts and budgets describe that original prototype or proposal, not an implementation in this repository. No code, credentials, data stores or spending authorization are transferred. See the [standalone project scope](../README.md) before using this material.


## What to enter

Give Scout a **title** and a **use-case brief**. Say what you want to build, who will use it, and what a useful solution must do. For example:

> Customer feedback research. Find Python tools to analyze customer feedback tables, identify sentiment and prepare results for a simple dashboard. Prefer reusable libraries over a complete hosted product.

Optional inputs make the result more useful:

| Input | Why it matters | Interpretation |
| --- | --- | --- |
| Preferred language | Restricts GitHub search | Not a promise about every dependency |
| Other constraints | Gives the agent requirements such as self-hosting or low memory | Curated mode records constraints; it does not verify that they are satisfied |
| License policy | Any, known license, or a small permissive-license allowlist | A metadata filter, not a legal compatibility decision |
| Commercial intent | Makes intended reuse explicit | Does not grant commercial rights |
| Maximum candidates | One, three or five | An inspection/shortlist bound, not total GitHub coverage |
| Public-data research | Opt in to selected catalogs and describe data needs | Links and static curated leads; no downloads or paid account access |
| Execution mode | Curated or live agent | Curated makes no model calls; live mode needs a finite approved grant |

For a first curated run, a specific short brief such as “Python sentiment analysis” produces more useful lexical search than a long sentence. The agent mode can choose its own brief-derived search terms.

## Complete workflow

1. Sign in through the existing **Continue with GitHub** flow. Open **Research** in the sidebar.
2. Enter the brief. Open **Constraints and sources** only if you need additional controls. Public-data discovery is optional.
3. Choose **Curated discovery** for a free fixed workflow, or the enabled **Live agent** option for a bounded model-directed investigation. Click **Start research**.
4. Watch the persisted trace. It shows searches, inspected public repositories, optional catalog leads and draft creation. You may stop an active run.
5. At **Waiting human**, read each candidate's description, retained evidence, reported license, policy eligibility and limitations. A public repository is not automatically safe, usable or suitable.
6. Read **Research report**, **Approach document**, and **Narration text**. Download any as Markdown. The narration is a script you may read aloud; this feature does not generate an audio file.
7. Check the repositories you want and click **Save selected to Research**. Saving is explicit and idempotent. Open **Saved library** to see persisted snapshots; reload the page to confirm them.

Research remains separate from My Repos and Favorites. Existing AI Organization, sync, taxonomy, human ground-truth review and evaluation datasets are unaffected. There is no automatic import into those workflows in this version.

## When something stops

- **Waiting auth:** sign in again. Start an explicit new run; expired credentials are not stored for a background retry.
- **Waiting rate limit / blocked:** inspect the visible message. Narrow the brief, wait for access to recover, or correct the relevant setting.
- **Stopped limit:** the task reached its time, tool or model bound, or no validated draft was produced. Evidence already acquired is retained.
- **Waiting reconciliation:** the backend restarted during execution. It retains completed evidence and does not automatically replay a potentially paid request. **Retry as new run** creates a new task; it does not resume or overwrite the old one.
- **License excluded:** select a different repository or start a separate run with a consciously chosen discovery policy. Unknown licenses stay visible as unknown; the app does not invent permissions.

The basic version retains up to 200 tasks per owner and returns bounded lists. It is not an unlimited crawler or a full research-history management product.
