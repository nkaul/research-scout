# Exploration chat and live agent execution audit

**November 9, 2026 · planning evidence · no implementation or live calls**

The current application has a useful search workspace and real LangChain/Deep Agents/LangGraph execution, but it does not yet have a conversational chat or hosted model. Environment changes alone cannot supply those missing capabilities. This audit supports the execution plan; its recommendations are proposals for review.

## Existing behavior and missing work

| Area | Implemented evidence | Missing operational capability |
| --- | --- | --- |
| UI input | `frontend/src/components/research-workspace.tsx:259` submits a question as a new research run. Its state and API types have a question, one selected provider and one summary. | Chat identity, message/turn history, follow-up context, assistant messages and per-turn cancellation/retry. Keep the existing Dub-inspired UI; the rejected HabitQuest previews are irrelevant to this build. |
| Progressive UI | The workspace consumes saved SSE snapshots at `research-workspace.tsx:131`; source identity/order and reason drafts are retained during arrivals. | Additive conversation/turn events and assistant output, linked to the existing source inspector. Do not replace the working run API or regress early source review. |
| Agent topology | `src/research_scout/agents/runtime.py:255` builds two Deep Agents graphs, a coordinator and provider-bound specialist. A narrow custom delegation invokes the specialist. | A real-model factory/profile; a turn workflow that can choose saved-evidence answering, clarification or explicitly scoped new discovery. |
| Model | `FixtureChatModel` is scripted; `_graph()` always constructs it. `run_discovery()` rejects a non-fixture model mode. | Provider-specific LangChain integration, credentials, real tool/structured-output compatibility, cancellation, rate handling and measured usage/cost admission. |
| Mode | `SCOUT_MODE` configures service behavior. `core.py:188` calls the agent runner without passing model mode. | Separate model mode from provider mode. Record both on every run/turn. A live provider plus scripted model must be clearly distinguishable from a fully live chat. |
| Retrieval | One discovery provider per immutable run, with deterministic within-provider hybrid filtering/ranking. Current lexical/semantic query strings are both the original question. | Follow-ups need a typed context-aware retrieval question. Any lexical reformulation must be explicit and validated; it must not widen providers or hard filters. |
| Evidence | The context pack preserves provider-scoped source identities, observation versions and optional field-value hashes. Output validation checks saved references and schema. | Claim-level citations and evidence support checks for substantive assistant answers. Structural reference checks alone do not establish entailment. |
| Durability | Atomic JSON run documents, persisted bounded events, no automatic external replay, restart-to-`INTERRUPTED`. | Durable conversation and turn documents, message revisions, evidence links and turn-level idempotency/budgets. There is no configured LangGraph checkpointer today. |
| Authority | Human inclusion/exclusion, DOI checks, citation-source choice and exports use API actions outside the agents. | Preserve those boundaries. Chat requests may propose research/check actions; agent text must not silently modify human decisions or export. |

## Recommended implementation sequence

1. **Make modes/configuration truthful.** Add separate provider/model settings, presence-only diagnostics and explicit readiness states. Keep the fixture path reproducible. Fix the dev launcher's current `--mode` default/override behavior so the effective configuration matches the startup summary. A configured endpoint or key is not a successful live capability test.
2. **Prove one hosted model through the existing two graphs.** Select one provider/model and its supported LangChain integration, pin the added package, and keep the effective allowlist restrictions. Replace fixture-only byte accounting with provider-specific token/usage and price accounting in live mode. Disable or account for SDK retries. Test the actual model-visible catalog and dispatch guard: disabling general-purpose, filesystem, shell and unused stock middleware must hold for the real model profile, not only the fixture profile.
3. **Deliver one OpenAlex + real-model vertical slice.** Use the actual application MCP path and existing independent OpenAlex process. Show sources before the model response; produce a bounded response with saved citations and metadata/abstract limitations. Prove a human selection, registry check and immutable export through existing APIs. Preserve fixture acceptance as a separate suite.
4. **Add conversation and turn contracts.** Store the transcript, stable scope, plan, child-run links, evidence and accepted assistant answer. Expose additive chat APIs/SSE and retain `/research-runs` for compatibility. Follow-up references such as “the second paper” must resolve against the prior visible/evidence snapshot, not a newly sorted provider list.
5. **Add a bounded turn workflow using LangGraph and Deep Agents.** A deterministic LangGraph turn controller performs admission → context preparation → typed plan validation → selected provider-scoped child run(s) → evidence packing → answer validation/publication. Deep Agents retains the coordinator/specialist model/tool loops; LangChain supplies model/messages/tools. The small controller makes turn status and conditional routes inspectable without moving provider clients into the core.
6. **Add explicitly selected multi-resource exploration.** Default to OpenAlex. If the user selects OpenAlex and Semantic Scholar for comparison, create two separately scoped child discovery runs, initially in sequence to preserve the current single-active-run constraint. Each child retains one provider and one permitted delegation/search. Crossref/DataCite remain exact DOI/agency metadata observations when the user requests verification; they are not four interchangeable topic-search agents. Stream the first child's usable entities immediately, then append the second's attributed entities. Do not silently search every provider for every turn.
7. **Finish the current UI and operational acceptance.** Add transcript/follow-up controls, source/citation links, per-provider stages, stop, partial results and clear error/access messages inside the existing Dub design. Validate desktop/mobile/keyboard behavior and the actual live end-to-end workflow, then record dated per-connection proof.

Steps 1–3 are the first useful live milestone. Steps 4–7 fulfill the requested conversational and multiple-resource experience; they are additional implementation, not a configuration-only switch.

## Conversation, scope and memory decisions

Keep application-owned atomic JSON for the next local slice. Add a single-owner conversation repository with stable `conversation_id`, immutable `turn_id`, revision, idempotency key and events. The application transcript/evidence record remains authoritative; reconstruct a bounded history/context for each new turn. Do not add a second durable graph state store or promise in-flight graph continuation in this slice. Restart marks active turns interrupted and retains accepted messages and observed entities; opening/reconnecting makes zero provider or model calls.

This is a concrete local memory choice, not a claim that JSON is a LangGraph checkpointer. LangGraph checkpointers persist graph/thread state and use `thread_id`; an in-memory saver loses state on restart. If durable graph resume is later required, select a persistent saver and establish which store owns each fact before enabling resume. LangChain's [persistence documentation](https://docs.langchain.com/oss/python/langgraph/persistence) describes that distinction.

Each turn saves an explicit intent (`answer_saved`, `clarify`, `discover`, `compare`, or requested DOI verification), effective provider set, year/type filters, query text and parent context revision. A new typed plan can narrow or explicitly change scope; it cannot alter an existing child run. Follow-ups reuse saved evidence when sufficient. Starting another search is a new, budgeted operation, not an invisible retry of the old one.

Admit at most the two implemented discovery providers per turn, in sequence. Reserve a turn-level aggregate model/provider grant before dispatch; all child grants, planning, synthesis and retries consume it. Existing child limits remain ceilings, and creating another child cannot bypass the parent limit. Pure saved navigation, notes, citation inspection and exports make no new model/provider calls. Answering a new conversational question over saved evidence may invoke the model and must consume model allowance, even when retrieval is zero.

Citation references should include `{turn_id, run_id, provider, source_ref, observation_version, field_or_excerpt}`. DOI equality may create an explicit comparison group, but both provider observations remain separate. Do not pool raw scores, combine fields into a synthetic source, or treat registry metadata as new scientific evidence.

Proposed shortlist semantics for review: the exploration conversation has a **three-source total** shortlist that references immutable observations from child runs. Existing legacy single-run shortlists retain their current behavior. New child runs do not reset or multiply the conversation limit. Selection revisions and reasons remain human-owned. A chat export snapshots the accepted messages/citations and conversation selection; existing run exports stay unchanged.

## Additive API and event proposal

- `POST /api/conversations`: create a conversation with explicit provider scope.
- `GET /api/conversations`, `GET /api/conversations/{id}`: saved history/snapshot without external calls.
- `POST /api/conversations/{id}/turns`: user message, expected revision, idempotency key, requested provider set and structured scope; return 202 plus stable turn identity.
- `GET /api/conversations/{id}/events`: ordered replayable SSE with a cursor and snapshot resynchronization.
- `POST /api/conversations/{id}/turns/{turn_id}/cancel`: cancel only that active turn and its owned operations.
- Separate human selection/export routes for conversation-wide review, backed by saved observations.

Events include `turn.accepted`, `plan.ready`, `provider.started`, `source.available`, `provider.completed/failed`, `answer.delta`, `answer.completed`, `turn.partial/failed/cancelled`. Every source/provider event carries its provider and child run. Commit an assistant message identity before deltas; batch draft updates to avoid rewriting the aggregate for every token. Persist ordered text offsets/revisions and cap retained events/bytes; replay gaps require a saved snapshot, never inference replay.

Only final assistant-role output is user-facing; internal model thoughts, raw tool JSON and credentials are not chat content. Stream draft answer text with a visible draft status, then validate its final citations before accepting it. Unknown or stale citations cannot become clickable accepted references. Source cards and per-provider progress remain usable while answer validation is pending. Cancellation fences late model/provider writes; an uncertain external call retains its spend/attempt reservation rather than being retried for free.

## Proposed environment additions, not yet wired

| Proposed setting | Purpose |
| --- | --- |
| `SCOUT_PROVIDER_MODE` and `SCOUT_MODEL_MODE` | Independently select fixture/live integrations and model execution; preserve a documented compatibility rule for legacy `SCOUT_MODE`. |
| `SCOUT_LLM_PROVIDER`, `SCOUT_LLM_MODEL` | Exact integration and model identifiers, with no implicit default to a paid model. |
| Provider's standard API-key/credential variable | Supplied only to the core/model process through a supported integration; credentials are not fabricated or committed. |
| `SCOUT_LLM_BASE_URL` | Optional trusted hosted endpoint, only where supported by the selected integration. A generic OpenAI-compatible endpoint is not proof of tool/usage parity. |
| `SCOUT_LLM_MAX_INPUT_TOKENS`, `SCOUT_LLM_MAX_OUTPUT_TOKENS`, `SCOUT_LLM_MAX_HTTP_ATTEMPTS`, `SCOUT_LLM_TIMEOUT_SECONDS` | Finite live model admission and timeout settings, validated against the selected model. |
| `SCOUT_LLM_PRICE_PROFILE`, `SCOUT_LLM_MAX_TURN_COST_USD` | Dated verified input/output/cache rates and a hard per-turn reservation/settlement limit. Include all calls across coordinator, specialists, planning and answer stages. |

These names are a proposed contract, not currently functional environment variables. The exact model, credentials and budget are required inputs before live activation. Existing `SCOUT_*_URL` variables point to local isolated provider services; their loopback restriction should remain. Hosted scholarly endpoints belong to the respective provider's upstream configuration. `NEXT_PUBLIC_*` must never carry backend credentials. The launcher currently passes one environment to every child; implement per-process environment projection so Next.js and unrelated provider processes do not inherit every secret.

LangChain supports explicit model initialization and provider-specific integrations; actual tool, structured-output and streaming behavior needs an integration compatibility test. See [LangChain model documentation](https://docs.langchain.com/oss/python/langchain/models). Current official framework examples may have changed since the installed lock; run compatibility spikes against the pinned versions before selecting APIs or upgrading dependencies.

## Required acceptance and evaluation evidence

1. All four fixture/live combinations behave truthfully, with missing credentials producing a precise blocked state. No fixture fallback is described as live success. No configuration errors silently select a different model/provider.
2. A real model completes the allowed two-graph/MCP path with bounded attempts, measured usage and saved references. Tool/profile/schema failures produce partial results without broadening tools.
3. A chat has at least three turns: initial search, follow-up about saved sources without new discovery, then explicitly selected second-provider comparison. The plan, source attribution and calls match the user's scope.
4. Register one Crossref DOI and one DataCite DOI through the appropriate agency route. Preserve conflicting observations and human citation choice. Chat text cannot itself include/exclude records.
5. Stop during provider retrieval and during model output; reject late writes. Disconnect/reconnect, duplicate send, refresh and restart do not duplicate messages, research or charges. An uncertain model attempt cannot be assumed free.
6. Early source cards arrive before answer completion and remain inspectable/bookmarkable; follow-up drafts, note focus and selected reader survive events. Test keyboard, phone and long-content behavior in the current design.
7. Live context/grounding cases cover conflicting observations, unsupported claims, unknown/stale citations, missing abstracts, no results, injection text in provider metadata, follow-up ambiguity, enforced filters and unavailable providers. Structural invariants must pass; human review evaluates relevance and citation support without pretending a tiny sample establishes corpus recall.
8. Record time to first usable source and accepted answer, per-provider failures, actual model attempts/tokens/cost, context size/omitted previews, cited observation versions and test mode. Existing 6,000/1,500 byte fixture units are not live token/cost measures.

For streaming, the installed graphs already inherit LangGraph streaming capabilities. Map a tested event/message projection into the application's persisted SSE rather than introducing a new frontend stack. Official [LangGraph streaming](https://docs.langchain.com/oss/python/langgraph/streaming) and [Deep Agents streaming](https://docs.langchain.com/oss/python/deepagents/streaming) document separate model, tool and subagent updates. [Deep Agents subagents](https://docs.langchain.com/oss/python/deepagents/subagents) supports narrow specialized contexts; the application's chosen custom wrapper still needs explicit per-child traces/cancellation rather than assuming built-in task streaming covers it.

No application, environment, dependency or runtime setting was changed for this audit. No hosted model call, scholarly provider operation or test suite was executed. Findings are based on repository inspection and official documentation checked on November 9.
