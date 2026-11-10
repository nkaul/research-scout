# Research Scout: standalone scope and next decisions

**25 October 2026 · proposal foundation, not an implementation plan approval**

## The problem

A person planning a system or solving a research problem often searches for repositories and datasets in separate places. A list of links does not explain which resource serves which role, whether two tools complement or replace each other, what evidence supports a recommendation, or what still needs checking. Saving links without that context makes the same investigation necessary again later.

The initial Research Scout concept is to turn a clear brief into a bounded investigation and a reviewable result: relevant resources, supported findings, an approach, source references and explicit unknowns. A user then decides what to keep in a Research library.

## Starting inputs preserved from the prototype

| Input | Purpose | Qualification |
| --- | --- | --- |
| Research title and problem/use-case brief | State the intended outcome and audience | A short, specific brief improves discovery |
| Requirements and constraints | Explain required roles, preferred language, deployment needs or operational limits | A stated constraint is not a verified resource capability |
| Repository license preference and intended commercial use | Screen obvious licensing issues early | A reported license is not a compatibility or legal verdict |
| Candidate/read limits | Keep the research scope manageable | A small shortlist is not exhaustive coverage |
| Optional data needs and selected providers | Extend the investigation to relevant public-data catalogs | Catalog discovery does not establish download access or reuse rights |
| Execution/budget choice | Distinguish fixed discovery from a paid model-directed investigation | New project limits, credentials and authorization remain to be designed and approved |

The original work considered AWS Open Data, Kaggle, Enigma, data.gov, Hugging Face and World Bank. Enigma was treated as a commercial service. Each provider and dataset has its own access and licensing conditions; the [copied source research](research/public-data-and-licenses.md) records those distinctions as of its original date.

## Expected research outputs

- A brief-specific shortlist organized by role, with evidence for fit and explicit limitations.
- An approach document explaining how selected resources might contribute to a solution and what to verify next.
- A research report with citations, observed licenses/access conditions, coverage gaps and unknowns.
- A narration **text script**, preserving the prototype's actual output type. Audio generation is a separate future decision.
- A user-reviewed saved research result, with source provenance and a clear record of what was accepted.

## What changes when this becomes a standalone project

| Earlier GitHub Manager context | Standalone Research Scout consideration |
| --- | --- |
| Research was a sidebar section next to My Repos/Favorites | Research becomes the primary project workflow; no dependency on GitHub Manager navigation |
| The prototype reused GitHub Manager's OAuth App and account session | Choose and verify a standalone identity/GitHub access approach; no credentials or OAuth grants were copied |
| The application MCP boundary was called GHM MCP | Reuse the task-scoped service/tool design; define a Research Scout application MCP identity later |
| Private Research SQLite and existing experiment ledgers lived in the original repository | Define independent persistence, ownership and finite-budget accounting; do not point the new project at the old files |
| Existing taxonomy, organization and ground-truth workflows surrounded Research | Those workflows are not initial Research Scout dependencies |
| The original approved cloud target belonged to GitHub Manager | Cloud architecture is undecided here; do not inherit DynamoDB/SQS or any deployment commitment automatically |
| Original architecture diagrams contain GitHub Manager names | Preserve them as historical explanatory assets; adapt diagrams after approving the standalone design |

## Incremental continuation

1. **Current step: research transfer.** Preserve the relevant documentation, examples and illustrations, with provenance. This step creates no application implementation.
2. **Review the standalone product scope.** Confirm the first user journey, intended users, initial resource types, desired report structure and what counts as a useful result. The root README's broader cross-modality ambition needs a concrete staged definition before adding more source types.
3. **Agree the first thin slice.** Decide whether to start with one supplied public repository, brief-driven public repository discovery, or repositories plus curated dataset leads. Specify a small acceptance example and human review/save behavior.
4. **Prepare an implementation proposal.** Use the original design and prototype lessons to choose the smallest suitable runtime, app structure, authentication, persistence and MCP boundary. Separate simulated tests, live integration proofs and quality evaluation.
5. **Approve implementation and live limits separately.** Only then add code, install dependencies, configure credentials or run paid tests in this repository.

The [original incremental plan](design/incremental-plan.md) and [evaluation approach](design/evaluation-plan.md) are inputs to that discussion, not a claim that their GitHub Manager phases have already been adopted or completed here.
