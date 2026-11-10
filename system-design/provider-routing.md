# Provider isolation and routing

**Current automatic discovery:** [Multi-source discovery, canonical DOI papers and automatic Unpaywall](automatic-federated-discovery-2026-11-09.md) is the latest user-directed default. Source selection is optional advanced behavior; a recorded eligible route searches multiple isolated services, groups matching DOIs into one paper and resolves access links through Unpaywall automatically. Earlier manual-selection/two-source defaults are superseded.

**October 26, 2026 · approved isolation and routing; local framework implemented**

**Latest provider set:** [November 9 expansion](provider-expansion-2026-11-09.md) extends the independent service boundary to arXiv, OpenAIRE, Europe PMC and Unpaywall, and adds Crossref discovery. Six discovery choices remain explicit and separately ranked; DOI registry and Unpaywall access routes are distinct. No automatic fallback or field blending was added. Earlier four-provider tables below are preserved baseline contracts.

Current evidence: [implementation status](implementation-status.md) and the [November 9 provider/streaming checkpoint](streaming-generation-2026-11-09.md). Four independent provider processes and agency routing are implemented. OpenAlex MCP OAuth/native hybrid/details and Crossref/DataCite live UI lookup passed. S2 details passed; anonymous search returned 429, while the local encoder is configured/tested. Crossref/DataCite topic search is not wired despite broader upstream capabilities. Optional OpenAI generation consumes saved evidence; it is not a scholarly discovery route. Earlier target requirements below do not imply every upstream capability is implemented.

The user requires separate providers, explicit routing and no provider mixing unless the research gives a good reason. This supersedes the initial proposal to place provider adapters inside one Python backend. Treat separation as an independent service/process boundary, not merely four routers mounted in the same application.

## 1. Service ownership

One repository and a local launch configuration can contain all services. Each provider must be independently startable, configurable, testable and disableable. Containers, a message broker and separate databases are not prerequisites; deployment packaging and storage remain open.

| Boundary | Owns | Must remain independent of |
| --- | --- | --- |
| Application core | Briefs, run lifecycle, Deep Agents, local application MCP, routing policy, human selections and deterministic exports | Provider SDKs, upstream credentials and provider-specific retry loops |
| OpenAlex service | OpenAlex transport/client, search/detail mapping, OAuth or explicitly chosen REST credentials, cache and attempt journal | Semantic Scholar, Crossref and DataCite availability |
| Crossref service | Crossref REST client, DOI metadata lookup and separately identified registration-agency lookup | Other provider clients and metadata stores |
| DataCite service | DataCite REST client and public DOI metadata lookup | Crossref metadata service availability when the DOI agency is already known |
| Semantic Scholar service | Its API client, bounded search/detail, access configuration and provider-specific errors | OpenAlex availability |

Every provider service owns its upstream timeouts, retry policy, rate admission, capability status, normalized observation output and durable attempt accounting. The core has a bounded connection timeout and records dispatch; it does not wrap a provider's retry loop with another automatic retry loop. An unavailable service must not prevent the application core or another configured provider from starting.

Provider code may share a small versioned contract package. It must not import another provider's runtime, instantiate all providers at startup, share a global health flag or share one undifferentiated request allowance. Each service owns a distinct cache/receipt namespace. The storage engine is undecided; no service may write another service's files or the application's selection repository.

## 2. Provider roles and research basis

| Provider | Initial responsibility | Explicitly outside its Increment 1 responsibility |
| --- | --- | --- |
| OpenAlex | Primary hybrid lexical/native-semantic scholarly discovery and details for its own returned records | Fetching full papers or silently consulting other indexes |
| Crossref REST API | Check selected Crossref-registered DOI metadata; optionally establish the registration agency through its documented agency endpoint | Assuming every DOI belongs to Crossref or treating a miss as an invalid DOI |
| DataCite REST API | Check selected DataCite-registered DOI metadata; retain actual resource type and version relationships | Acting as a blind second attempt after any Crossref error or becoming a general dataset-search lane |
| Semantic Scholar API | A separate complementary search/detail choice with a proved native semantic route or bounded compatible local-encoder rerank | Automatic supplementary cross-provider search, pooled cross-provider ranking, citation traversal or recommendation workflows |

The original [handoff §2](../discovery/research/research-scout-development-handoff.md#2-consolidated-decisions) recommends OpenAlex first and Crossref early. Its [Increment 1](../discovery/research/research-scout-development-handoff.md) includes Crossref/DataCite handling; Semantic Scholar originally follows in Increment 2. The current proposal restores the registry checks and brings forward a separately enabled Semantic Scholar search slice. That extension is proposed, not a claim that the original research required all four immediately.

Crossref documents both `/works/{doi}` and `/works/{doi}/agency`. DataCite documents public singleton retrieval at `/dois/{id}`; its unauthenticated public API returns Findable records, so absence has several possible explanations. Semantic Scholar documents paper search/detail and a broader graph, whose other capabilities are deferred. [Crossref REST](https://www.crossref.org/documentation/retrieve-metadata/rest-api/), [DataCite REST](https://support.datacite.org/docs/rest-api), [DataCite singleton](https://support.datacite.org/docs/api-get-doi), [Semantic Scholar API](https://api.semanticscholar.org/api-docs/).

These official sources were checked October 26, 2026. Documentation access establishes documented capabilities, not authenticated integration or live data quality. The Semantic Scholar graph-page fetch was rate-limited; its indexed official API reference and [official API overview](https://webflow.semanticscholar.org/product/api) supplied the capability evidence. No research API request was performed.

## 3. Routing policy

| Operation | Route | Behavior on failure or missingness |
| --- | --- | --- |
| Discover papers | OpenAlex is primary/default; user may choose enabled `semantic_scholar`. Run snapshots one provider and its admitted lexical/semantic hybrid plan | Preserve empty/partial/unavailable outcome. No other-provider search. |
| Hydrate a discovery record | Its originating provider service | Saved fields remain available; no replacement index is queried. |
| Check selected DOI metadata | Explicit human action; established registration agency chooses Crossref **or** DataCite metadata service | Keep unsupported, unresolved, unavailable and not-found states distinct. |
| Reopen, decide or export | Application-owned saved snapshots | Zero provider/model calls, including during complete provider outage. |
| Search another provider | New explicit provider-scoped run | Separate query/result set and provenance; no blended ranked list. |

The router validates an operation's capability, selected provider, source identity, access status, operation ID and remaining limits. A model cannot select an unadmitted provider or authorize a DOI check. The discovery role receives only the run's selected search capability. Refining a question or changing provider creates a new run. The latest user instruction authorizes bounded lexical-plus-semantic branches and fusion within the selected provider; it does not authorize cross-provider search fan-out or field merging. [Hybrid retrieval](hybrid-retrieval.md) defines query embedding, filters and same-provider dedup/ranking.

### Registration-agency decision

1. Validate and normalize the selected DOI locally without guessing its agency from a title, publisher or prefix convention.
2. Reuse a compatible recorded registration-agency assertion if one exists. Keep who established it and when.
3. If the agency is unknown, the explicit metadata-check workflow may call the Crossref service's documented `/works/{doi}/agency` operation. Record this as **agency lookup**, distinct from Crossref metadata retrieval, and count its attempt separately.
4. Dispatch exactly one metadata lookup to the matching service: Crossref or DataCite. If another agency is returned, report `UNSUPPORTED_AGENCY`. If resolution fails, report `AGENCY_UNRESOLVED` or the relevant availability error; do not probe both metadata APIs.
5. Preserve the lookup response as a separate observation attached to the DOI check. A metadata miss does not initiate a different provider request or prove the DOI invalid.

Step 3 is a deliberate, research-supported routing dependency: an unknown DataCite DOI may require a Crossref **agency** lookup before reaching DataCite. It does not mix discovery results or make DataCite's service depend on Crossref's metadata client. If this dependency is unavailable, that unresolved workflow stops visibly; already established DataCite routes continue to work. A neutral registration-agency resolver can replace this step after its own contract proof; none is assumed implemented.

## 4. Why selected metadata checks can cross providers

An index's discovery record and a registration agency's deposited DOI record serve different purposes. Consulting the appropriate registry can reveal identity/bibliographic disagreement, missing fields or resource-type differences. This is the narrow reason supported by the handoff for a cross-provider workflow in Increment 1.

It does not establish that a paper's findings are correct, that full text was read, or that repeated metadata represents independent scientific corroboration. Registry records can also be incomplete or disagree.

Store provider observations under `(provider, provider_record_id, observation_version)`. An exact normalized DOI may create a recorded identity link; versions and conflicting identifiers remain explicit. Do not fuse titles/authors across provider observations, pool citation counts, average cross-provider relevance scores or silently replace a discovery record with another source's fields. The authorized within-provider hybrid union preserves lexical and semantic branch contributions and uses an explicitly configured rank-fusion rule. Exact-title similarity alone never authorizes a link.

The user sees the discovery record alongside `registry_match`, `registry_conflict`, `registry_not_found`, `agency_unresolved`, `unsupported_agency`, `unavailable` or `not_checked`. A matched DOI record means bibliographic checking, not endorsement of research quality.

Exports default to a complete selected discovery-record snapshot. If a user explicitly chooses a registry record as the citation source, record that whole-record choice and its version; do not silently fill individual missing fields from other providers. The manifest includes the other observations, route evidence, conflicts and missingness.

## 5. Failure and budget contracts

- Independently enable services. Only the chosen service's missing access blocks its live operation; the core and saved workspace remain usable.
- Keep admission and actual upstream attempts durable. A restarted service cannot reset an allowance. The core and service reconcile usage using the same operation IDs and bounded grants.
- The provider service owns upstream retries. An app-to-service timeout is uncertain until resolved by operation status; the core never blindly reissues the operation or switches provider/transport.
- Bound queues/concurrency, response sizes, request timeouts and retry attempts per service. An open circuit returns an attributable availability error, rather than blocking another provider.
- Partition caches by provider, operation, query/identifier, filters, access scope, transport/schema, ranking and freshness. Never return another provider's cache entry under the selected provider's name.
- Preserve completed observations on cancellation, model failure, partial verification and provider outage. Mark uncertain attempts; do not replay them on reopen.

Finite limits and execution packages are in [Increment 1](increment-1.md). Implemented behavior has fixture/process test evidence. Provider quotas/commercial access, selected hosted-model rates and live search quality remain unproved.

## 6. Required isolation evidence

1. OpenAlex works with all other provider services stopped. A separately configured Semantic Scholar run works with OpenAlex stopped.
2. Each search calls exactly its selected provider, including empty, rate-limited, failed and model-misrouting cases.
3. A known DataCite route works when Crossref is stopped; unknown agency resolution reports its dependency failure without trying two metadata services.
4. Crossref, DataCite, another agency, malformed DOI, provider miss and unresolved agency produce distinct outcomes and attributed routes.
5. Conflicting records remain separate; exact-DOI links preserve versions and never pool counts/ranks or overwrite source fields.
6. Duplicate/uncertain operation IDs, retries and service restarts cannot bypass per-provider or global allowances.
7. Reopen, human decisions and export work with every provider service stopped and zero external calls.
8. Fixtures, live provider checks and real model-driven journeys have separate reports. A provider stays pending/disabled until its own proof passes; another provider's success is not its proof.
