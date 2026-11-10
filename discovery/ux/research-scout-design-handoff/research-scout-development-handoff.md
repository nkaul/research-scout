# Research Scout — Findings, Architecture, and Development Handoff

**Prepared:** October 26, 2026  
**Research reviewed:** October 25–26, 2026  
**Purpose:** A standalone handoff for VS Code with integrated Codex, covering the research findings, architectural recommendations, development sequence, and validation requirements from this conversation.  
**Status:** Planning and source review completed. Application development has not started in this workspace.

> Provider capabilities, quotas, pricing, licenses, and preview APIs change. The linked official documentation takes precedence over historical numbers and third-party articles. Recheck the specific integration being implemented. Recommendations in this document are proposed defaults, not additional requirements imposed by the user.

## Contents

1. [Objective and current state](#1-objective-and-current-state)
2. [Consolidated decisions](#2-consolidated-decisions)
3. [Review of the six supplied sources](#3-review-of-the-six-supplied-sources)
4. [Provider roles and integration priorities](#4-provider-roles-and-integration-priorities)
5. [API and access reference](#5-api-and-access-reference)
6. [Application architecture](#6-application-architecture)
7. [Research workflow and evidence rules](#7-research-workflow-and-evidence-rules)
8. [Data model and provenance](#8-data-model-and-provenance)
9. [Service, API, and MCP contracts](#9-service-api-and-mcp-contracts)
10. [Incremental development plan](#10-incremental-development-plan)
11. [Evaluation and acceptance criteria](#11-evaluation-and-acceptance-criteria)
12. [Operational requirements](#12-operational-requirements)
13. [Outputs and paper-writing support](#13-outputs-and-paper-writing-support)
14. [Initial backlog and decision register](#14-initial-backlog-and-decision-register)
15. [VS Code/Codex continuation instructions](#15-vs-codecodex-continuation-instructions)
16. [Source register](#16-source-register)

## 1. Objective and current state

### 1.1 User objective

Develop Research Scout incrementally so a user can:

- Find scholarly papers relevant to a research question.
- Explore a research landscape, including trends and citation relationships.
- Obtain accessible full text and extract source-backed knowledge.
- Search the public web and discover relevant YouTube videos.
- Compare findings and definitions across sources.
- Produce cited research briefs, evidence matrices, bibliographies, and eventually paper outlines or drafts.
- Use the capabilities through an application and, where useful, MCP clients.
- Continue design refinement and development in VS Code with integrated Codex.

The original inspiration was a quoted four-server workflow:

1. OpenAlex maps the literature.
2. Semantic Scholar finds relevant papers and passages.
3. Unpaywall locates open-access versions.
4. PubMed extends coverage into biomedical research.
5. An LLM orchestrates and synthesizes.

This is a useful division of responsibilities. It does not require every question to call all four services, nor does it establish that the quoted MCP implementations are installed, official, free at unlimited volume, or suitable for production.

### 1.2 What exists now

At handoff creation, the workspace contained work/ and outputs/ directories, with no application source code identified. This document is a planning deliverable, not evidence of an implemented or tested application.

Completed work:

- Reviewed the user-provided reference material and six additional links.
- Checked key provider claims against official documentation.
- Inspected selected fulltext-article-downloader acquisition and MCP source paths.
- Developed the architecture, provider priorities, development milestones, and acceptance criteria.

Not completed:

- Installing or running any supplied package or MCP server.
- Creating provider accounts, keys, subscriptions, or OAuth applications.
- Live credentialed API smoke tests or end-to-end retrieval tests.
- Establishing a domain-specific evaluation dataset.
- Implementing UI, backend, MCP tools, database, ingestion, or deployment.

Repository review covered documentation and selected acquisition/MCP files, not an exhaustive audit. The inspected downloader package metadata reported v0.2.4; this is an observation, not a tested-release endorsement. Record exact commits/package versions during implementation because main/master source links are mutable.

### 1.3 Recommended initial product boundary

Start with a single-user local application using online provider APIs. Local execution does not mean offline access or that documents remain local when sent to a hosted model.

The first paper MVP should:

1. Search papers.
2. Save a shortlist.
3. Validate identifiers and bibliographic metadata.
4. Retrieve accessible documents.
5. Compare selected papers with passage citations.
6. Export an evidence table and bibliography.

Public web, YouTube, dataset ingestion, institutional APIs, multi-user access, and complete paper drafting are later capabilities. Keep their extension points in the design.

“No subscriptions” is an inspiration from the quoted example, not a confirmed unlimited-free requirement. Prefer a bounded free-tier prototype and show usage costs rather than promising zero cost.

## 2. Consolidated decisions

| Decision | Recommended approach | Reason |
|---|---|---|
| Application structure | One shared research core with replaceable provider adapters | Keeps application and MCP behavior consistent |
| Initial scholarly discovery | OpenAlex first | Broad discovery, semantic matching, grouping, and useful entity metadata |
| Bibliographic validation | Crossref early | DOI lookup, metadata enrichment, and deposited update information |
| Complementary discovery | Semantic Scholar next; domain sources as needed | Adds relevance, snippets, recommendations, and citation exploration |
| Open-access lookup | Unpaywall as a resolver/fallback | Resolves locations; does not itself return extracted full text |
| Acquisition | Direct repository/content APIs plus an evaluated downloader adapter | Reuse available capabilities while retaining control over identity, versions, and outcomes |
| Evidence | Preserve passages with page, section, paragraph, table, or timestamp locators | Enables reviewable claims |
| Retrieval | SQLite text search first; evaluate embeddings after a baseline exists | Avoids infrastructure before retrieval quality is measured |
| MCP | Expose the same core functions; add tools as capabilities stabilize | MCP is a transport/tool interface, not a replacement for domain logic |
| Web search | A structured provider whose use/storage terms fit the selected workflow | Discovery and permitted content acquisition are distinct |
| Google Search grounding | Separate end-user grounded-answer feature | Its terms restrict automated link harvesting and indexing |
| YouTube | Public search/details first; content evidence separately | Metadata access does not guarantee transcript access |
| Datasets | Separate discovery lane after the paper MVP | Dataset applicability, versions, schemas, and analysis require different handling |
| Commercial literature | Optional institutional adapters | A wrapper does not grant subscription or content rights |
| Model choice | Configurable model interface | Avoid making the application depend on Claude or Gemini alone |
| Deployment | Local first; remote/multi-user only when required | Reduces early authentication, infrastructure, and operational work |

These are architectural recommendations. Preserve user choices that differ during subsequent refinement.

## 3. Review of the six supplied sources

### 3.1 IntuitionLabs — primary influence on the refined provider approach

[Research Paper APIs for Scientific Literature in 2026](https://intuitionlabs.ai/articles/research-paper-apis-scientific-literature), dated March 8, 2026, is useful as a provider landscape. Its categories support separating discovery, bibliographic metadata, access, citation networks, identities, and licensed services.

The main additions to the earlier plan are Crossref near the beginning, DataCite for linked research resources later, and optional identity/citation enrichment when a concrete workflow needs it. It also supports selecting complementary services rather than treating all providers as interchangeable paper search engines.

Treat it as a provider shortlist, with current primary documentation governing implementation. Some examples and generalizations require correction.

### 3.2 Corrections to carry into implementation

| Earlier assumption or supplied example | Corrected implementation position |
|---|---|
| Crossref examples using /v1/records/... or a doi query parameter as a singleton lookup | Use the documented works lookup and verify the supported path against the current API reference |
| A DOI implies one provider owns every record | Crossref and DataCite register different bodies of DOI metadata; a provider miss is not proof a DOI is invalid |
| All arXiv articles are CC-BY | Articles and versions carry different licenses; retain the actual license |
| A free API means everything it returns is public-domain content | Metadata, abstracts, full text, derived features, and service access can have different terms |
| PubMed lookup retrieves complete papers | PubMed supplies bibliographic records/abstracts; full-text acquisition is a separate operation |
| Unpaywall retrieves/extracts full text | It supplies access locations, version and license information where available; fetch the asset separately |
| A model file upload establishes a persistent semantic library | File Search requires a store and an import/indexing workflow |
| An SDK or MCP Registry entry proves an official supported MCP integration | Inspect the implementation, owner, transport, capabilities, and upstream requirements |
| All four MCP servers are local and unlimited-free | Each implementation and upstream service must be assessed independently |
| Website homepage URLs are API endpoints | Use service-specific paths; do not parse JSON from a provider homepage |

Supporting primary documentation: [Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/), [arXiv licenses](https://info.arxiv.org/help/license/index.html), [Unpaywall format](https://unpaywall.org/data-format), [PMC developers](https://pmc.ncbi.nlm.nih.gov/tools/developers/), [Gemini File Search](https://ai.google.dev/gemini-api/docs/file-search).

Do not select a provider solely from old corpus-size figures. Evaluate relevance, marginal coverage, metadata quality, access, and cost on representative research tasks.

### 3.3 google/mcp

[google/mcp](https://github.com/google/mcp) is a catalog of Google MCP services, deployment material, and examples. Its README distinguishes managed remote services from open-source implementations that may run locally. It is not one universal Google research server.

Relevant implications:

- Developer Knowledge searches Google developer documentation; it is useful during development or for explicitly scoped technical research.
- Cloud/database MCP services do not expose Google's general public-web index.
- Workspace integration may support authorized document ingestion later.
- The reviewed catalog did not establish an official YouTube MCP service.
- Local STDIO and hosted Streamable HTTP are different deployment arrangements.

Use the current [supported-products catalog](https://docs.cloud.google.com/mcp/supported-products), [Developer Knowledge documentation](https://developers.google.com/knowledge/mcp), and [Cloud Run hosting guidance](https://docs.cloud.google.com/run/docs/host-mcp-servers) for actual service choices.

### 3.4 Scalekit — YouTube MCP versus API

The [Scalekit article](https://www.scalekit.com/blog/youtube-mcp-vs-api) compares direct APIs with Scalekit's own managed connector exposed through MCP. It is partly about creator/account operations, which are outside the initial Research Scout scope.

Adopting its token vault and managed connector is optional. Multi-user support depends on credential isolation and authorization in an implementation; MCP itself neither forbids multiple users nor supplies a token vault automatically.

For the research MVP:

- Use public search and video details.
- Defer uploads, comment moderation, analytics, and channel management.
- Introduce per-user OAuth only for capabilities that require it.
- Keep caption-track metadata distinct from readable transcript text.

The [Scalekit connector documentation](https://docs.scalekit.com/agentkit/connectors/youtube/) can inform a later managed integration.

### 3.5 fulltext-article-downloader

The [repository](https://github.com/computron/fulltext-article-downloader) offers Python, CLI, and local MCP interfaces. It accepts several scholarly identifier types, chains acquisition routes, and reports the source and outcome. Its code is BSD-3-Clause licensed; this does not license downloaded articles.

Recommendation: evaluate the Python interface behind Research Scout's acquisition adapter. Select routes explicitly, keep output within application storage, and retain independent document validation.

Selected code findings:

- Designated trusted routes skip title matching.
- A custom route list can bypass the lookup that supplies an expected title.
- The Python batch interface accepts route restrictions that the supplied MCP batch tool does not expose.
- Optional dependencies enable browser-session/TLS behavior; they are unnecessary for the initial API/repository route trial.

Therefore the README's verification language is not an application-level identity guarantee. Benchmark correct matches, unrelated documents, supplements, abstract-only responses, and versions before adoption.

Sources: [README](https://github.com/computron/fulltext-article-downloader), [downloader code](https://github.com/computron/fulltext-article-downloader/blob/main/fulltext_article_downloader/downloader.py), [MCP code](https://github.com/computron/fulltext-article-downloader/blob/main/fulltext_article_downloader/mcp_server.py).

### 3.6 pybliometrics

[pybliometrics](https://github.com/pybliometrics-dev/pybliometrics) is a Python client for Elsevier's Scopus, ScienceDirect, and SciVal APIs. Its MIT code license does not provide upstream access entitlement.

Use as an optional institutional adapter when a user has suitable access and asks for its coverage, metrics, or content. Full functionality may depend on keys, product permissions, institutional networks/VPN, or tokens. A newly issued API key alone does not grant subscription access.

Keep provider-specific citation metrics separate. Defer this integration from the open-access MVP.

Sources: [access guide](https://pybliometrics.readthedocs.io/en/stable/access.html), [Elsevier authentication](https://dev.elsevier.com/tecdoc_api_authentication.html).

### 3.7 Awesome Public Datasets

[Awesome Public Datasets](https://github.com/awesomedata/awesome-public-datasets/blob/master/README.rst) is a categorized directory generated from apd-core metadata. Entries link to external sources and may include maintenance markers; the directory is not a uniform data API or a guarantee of access, quality, or common licensing.

Use selected entries to seed a reviewed catalog. Do not bulk-download all linked resources.

For each candidate dataset, capture the publisher, version, dates, geography/population, variables, formats, identifiers, access conditions, license, and last verification time. Relevance to a topic does not demonstrate that a dataset measures the concept in the question.

## 4. Provider roles and integration priorities

### 4.1 Discovery and bibliographic services

| Provider | Role | Priority | Integration note |
|---|---|---|---|
| OpenAlex | Broad discovery, landscape counts, entities, citation links | Initial | API-backed adapter; official MCP useful for agent access |
| Crossref | DOI metadata verification/enrichment and deposited relationships/updates | Initial | Enrich selected records; do not assume every field is present |
| Semantic Scholar | Complementary relevance, snippets, recommendations, citations | Early | Preserve its IDs, scores, metrics, and content-access distinction |
| PubMed | Biomedical discovery, abstracts, controlled queries/publication types | Domain branch | Add when validating biomedical use cases |
| arXiv | Direct preprint discovery and versioned sources | Domain branch | Preserve preprint status and relationships to later publications |
| DataCite | Research-resource metadata and registered relationships | Singleton fallback early; discovery later | Handle DataCite-registered DOIs in the first catalog slice; add dataset search in its own phase |
| ORCID/ROR | Researcher/organization identity enrichment | Later | Reuse supplied identifiers before adding separate lookup workflows |
| OpenCitations | Additional open citation graph exploration | Later | Add when it supplies measurable coverage or graph benefits |
| NASA ADS/RePEc and other domain sources | Specialized coverage | Demand-driven | Do not implement every provider merely because it appears in a survey |
| Scopus/WoS/Dimensions | Licensed coverage and analytics | Optional | Entitlement and terms are integration dependencies |

### 4.2 Access, acquisition, and knowledge services

| Capability | Initial approach | Later option |
|---|---|---|
| OA location resolution | Existing provider locations plus Unpaywall fallback | Additional repository aggregators if coverage warrants |
| Original file acquisition | Repository/content APIs and controlled downloads | Evaluated downloader package and entitled publisher routes |
| Biomedical full text | PMC-supported retrieval paths | Europe PMC as a complementary adapter where useful |
| Repository breadth | Add only measured gaps | Evaluate CORE and selected institutional repositories |
| Web discovery | One provider with appropriate use/storage rights | Additional providers based on benchmark coverage |
| URL reading | Controlled webpage/PDF acquisition | Gemini URL Context for suitable model-assisted tasks |
| Semantic retrieval | Local text-search baseline | Embeddings/hybrid retrieval or managed File Search |
| Video discovery | YouTube Data API | Additional cross-platform discovery if needed |
| Video evidence | Authorized/imported timestamped transcripts | Public-video analysis through a separately evaluated model feature |
| User documents | File upload/import | Authorized Drive/Workspace ingestion |

## 5. API and access reference

These are reference paths, not credentialed smoke-test results. Validate schemas, pagination, escaping, and access requirements during implementation.

### 5.1 Scholarly endpoints

| Service | Endpoint or route | Access / return type |
|---|---|---|
| OpenAlex discovery | GET https://api.openalex.org/works | JSON; basic anonymous access, verified free key recommended |
| OpenAlex singleton | GET https://api.openalex.org/works/{id} | JSON; resolve supported identifiers per current docs |
| Crossref DOI lookup | GET https://api.crossref.org/works/{doi} | JSON bibliographic metadata; no sign-up required |
| Crossref search | GET https://api.crossref.org/works | Bibliographic queries/filters; include contact identification |
| Semantic Scholar search | GET https://api.semanticscholar.org/graph/v1/paper/search | JSON; endpoint-dependent key requirements |
| Semantic Scholar singleton | GET https://api.semanticscholar.org/graph/v1/paper/{paper_id} | Request selected fields |
| Semantic Scholar bulk search | GET https://api.semanticscholar.org/graph/v1/paper/search/bulk | Evaluate for larger defined result sets; behavior differs from relevance search |
| Semantic Scholar snippets | GET https://api.semanticscholar.org/graph/v1/snippet/search | Matching passages and paper provenance; verify current schema/access |
| Unpaywall DOI lookup | GET https://api.unpaywall.org/v2/{doi}?email={contact_email} | JSON access locations; real contact email required |
| arXiv search | GET https://export.arxiv.org/api/query | Atom XML with query, paging, and identifiers |
| NCBI search | GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi | Specify database, term, and desired return mode |
| NCBI record fetch | GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi | Database-dependent records; PubMed abstracts are not article bodies |
| PMC OAI-PMH | https://pmc.ncbi.nlm.nih.gov/api/oai/v1/mh/ | Metadata and eligible full-text XML |
| DataCite DOI lookup | GET https://api.datacite.org/dois/{doi} | JSON metadata and relationships |

OpenAlex content links for covered works are supplied through has_content and content_urls. Documented paths include https://content.openalex.org/works/{work_id}.pdf and the .grobid-xml variant; content downloads require a key and consume usage budget. Parsed XML can contain errors, and scanned PDFs can require separate OCR. [Full-text documentation](https://help.openalex.org/access/fulltext/)

Do not assume all DOIs resolve through Crossref. Retain the DOI registration agency and route DataCite records appropriately. Singleton agency handling/DataCite fallback belongs in Increment 1; dataset discovery remains later. Missing metadata and an invalid identifier are different states.

Semantic Scholar relevance search is capped at 1,000 results; reaching the end of that interface is not proof of exhaustive coverage. Evaluate its bulk-search or dataset interfaces for larger defined sets. Before enabling the adapter, verify applicable API/data-use terms: the reviewed agreement directs commercial and other expanded uses to an expanded-license request. Do not treat API access as a blanket CC0 content grant. [API reference](https://api.semanticscholar.org/api-docs/), [API agreement](https://api.semanticscholar.org/license/)

### 5.2 Access and rate-limit observations

These figures are a dated baseline, not hard-coded application constants.

| Service | Observed documentation baseline | Required engineering behavior |
|---|---|---|
| OpenAlex | Free verified account: $1/day usage; basic no-key access also exists | Track returned usage/budget data; avoid unlimited pagination |
| OpenAlex rates | No key 10 RPS; free/prepaid 30 RPS; semantic search 1 RPS | Endpoint-aware limits; pagination/key requirements checked |
| OpenAlex semantic search | Up to 50 matches; title/abstract embeddings | Use for relevance exploration, not complete population counts |
| Semantic Scholar | Introductory keyed rate documented as 1 RPS; some endpoints require keys | Keyed does not mean unthrottled; handle shared/public access separately |
| NCBI E-utilities | Default 3 RPS without key, 10 RPS with key | Include tool/contact parameters and batch requests where suitable |
| Unpaywall | DOI lookup and contact-email workflow; published limit 100,000 calls/day | Configure limits and use DOI resolution rather than retired search |
| YouTube | Separate buckets: 100 search calls/day, 100 upload calls/day, and 10,000 units/day for remaining methods | Each additional search page consumes a call; uploads remain out of scope |

Sources: [OpenAlex pricing](https://help.openalex.org/access/pricing/), [authentication](https://help.openalex.org/api/authentication/), [semantic search](https://help.openalex.org/api/semantic-search/), [Semantic Scholar access](https://www.semanticscholar.org/product/api), [NCBI limits](https://support.nlm.nih.gov/kbArticle/?pn=KA-05510), [YouTube quota calculator](https://developers.google.com/youtube/data/determine_quota_cost).

Earlier advice commonly quotes YouTube search as costing 100 units per call. The reviewed October 2026 documentation describes separate daily call buckets instead. Read the project's actual quota configuration.

Unpaywall's published API page reports that /v2/search retired September 18, 2026 and now returns 410 Gone; /v2/{doi} remains the resolver route. [Unpaywall API](https://data.unpaywall.org/products/api)

### 5.3 Google capabilities: keep the purposes separate

| Service/tool | Purpose | Position |
|---|---|---|
| Gemini with Google Search grounding | End-user answers grounded in web search | Optional distinct feature; not corpus-harvesting input |
| Gemini URL Context | Model reads specified accessible URLs, including supported public PDFs | Optional analysis aid; not original-file storage |
| Gemini File Search | Managed semantic retrieval over imported files | Optional alternative to local indexing |
| Google/Vertex vector search | Similarity/hybrid search over supplied embeddings | Later infrastructure option; not a public-web source API |
| Knowledge Graph Search | Entity matching and descriptions | Optional enrichment; not scholarly/full-text search |
| Enterprise Knowledge Graph | Enterprise entity capabilities | Evaluate only for a concrete entity requirement |
| Google Drive API | Authorized downloads and Workspace exports | Later user-document integration |
| Google Developer Knowledge MCP | Search/read Google developer documentation | Development aid or explicitly scoped technical source |
| Custom Search JSON API | Legacy web/image search API | Avoid as a new dependency; closed to new customers and migration deadline January 1, 2027 |

The legacy Knowledge Graph endpoint is https://kgsearch.googleapis.com/v1/entities:search. Its own documentation advises new enterprise use toward the newer product and warns against a production-critical dependency on the legacy API. [Knowledge Graph documentation](https://developers.google.com/knowledge-graph)

Google does not expose one general public endpoint covering scholarly discovery, structured datasets, full documents, and arbitrary video evidence.

**Correction to the earliest proposed Google-led acquisition flow:** Google's Search grounding terms prohibit collecting returned links for indexing or identifying crawl targets. Do not extract its citation URLs into an automated acquisition queue or persistent source index. Keep grounded answers within their supported end-user display workflow, with required source/search presentation. The broader retention rules also mean they should not enter the general evidence store by default. [Grounding terms](https://ai.google.dev/gemini-api/terms)

Choose a separate search integration whose rights fit discovery/storage, then acquire destination content through permitted methods. Brave has an official MCP implementation, but search-result storage rights depend on its plan. SerpApi and SearchAPI are third-party services, not official Google endpoints. [Brave API](https://brave.com/search/api/), [Brave MCP](https://github.com/brave/brave-search-mcp-server), [SerpApi Videos](https://serpapi.com/google-videos-api), [SearchAPI Videos](https://www.searchapi.io/docs/google-videos)

URL Context is not a universal reader: YouTube URLs, Google Workspace documents, audio/video files, and paywalled content require other paths. Raw Files API uploads expire after 48 hours; imported File Search content persists until deletion, subject to service/model lifecycle. Keep originals in application storage. [URL Context](https://ai.google.dev/gemini-api/docs/url-context), [File Search](https://ai.google.dev/gemini-api/docs/file-search)

Vector indexing and embedding generation are separate operations. Verify a model's supported modalities rather than assuming a named embedding model handles text, images, and video. Persist model/version, vector dimensions, chunking version, and embedding configuration so changes can trigger reindexing.

Google Scholar is excluded as an automated collection dependency: its help declines bulk record access and directs users to underlying data sources. No supported automated ResearchGate integration was verified; leave it outside the initial pipeline. Opaque /goto?url= references in the supplied copied text were not treated as verified original sources. [Google Scholar help](https://scholar.google.com/intl/en/scholar/help.html)

Reference third-party video routes are https://serpapi.com/search.json and https://www.searchapi.io/api/v1/search with the relevant engine parameters. Do not use their homepages as request endpoints. Add at most one only if YouTube coverage is insufficient.

### 5.4 YouTube discovery and evidence

Initial API routes:

- GET https://www.googleapis.com/youtube/v3/search with part=snippet and type=video.
- GET https://www.googleapis.com/youtube/v3/videos for selected IDs and snippet/contentDetails/status as needed.

Use API-key access for public discovery. OAuth is needed for account/private capabilities; service accounts do not supply a general YouTube user identity. Creator writes and analytics are out of initial scope.

Use separate content statuses:

- metadata_only
- transcript_imported
- authorized_captions
- video_analyzed

Official captions.download requires permission to edit the video. Captions listing does not provide arbitrary public transcript text. Start with authorized or user-provided transcript files. Keep timestamp provenance and never label a generated summary as a verbatim transcript.

Public YouTube URL analysis through Gemini is a separately evaluated preview capability; private and unlisted videos are not supported by the reviewed documentation. Confirm current access, model support, pricing, and output accuracy before enabling.

Apply provider-specific refresh/deletion rules to API data. Limited non-authorized YouTube API data, including cached titles/descriptions, must generally be refreshed or deleted within 30 calendar days. Store refresh_after and handle dependent representations when source data is refreshed or removed. Other data classes have their own applicable rules; do not assume indefinite retention.

Sources: [search](https://developers.google.com/youtube/data/reference/rest/v3/search/list), [video details](https://developers.google.com/youtube/data/reference/rest/v3/videos/list), [caption download](https://developers.google.com/youtube/data/reference/rest/v3/captions/download), [errors/authentication](https://developers.google.com/youtube/data/reference/rest/v3/errors), [policies](https://developers.google.com/youtube/terms/developer-policies), [video understanding](https://ai.google.dev/gemini-api/docs/video-understanding).

### 5.5 MCP availability and deployment

Verified examples:

- OpenAlex official remote MCP: https://mcp.openalex.org/mcp; Streamable HTTP with OAuth. It uses the account's budget and does not fetch full-text PDFs or bulk export whole result sets.
- OpenAlex source: https://github.com/ourresearch/openalex-mcp-server.
- fulltext-article-downloader offers a local MCP entry point.
- Brave publishes an official search MCP server.
- Google Developer Knowledge: https://developerknowledge.googleapis.com/mcp; scoped to Google developer documentation.

The exact Semantic Scholar, Unpaywall, and PubMed community-server repositories from the original quote were never supplied. Their code quality, capabilities, transport, and “all local/free/open” status remain unverified.

The google/mcp catalog and an SDK's existence do not establish an official YouTube MCP server. A directory listing likewise is not a code audit.

Sources: [OpenAlex connector](https://help.openalex.org/access/connector/), [Google catalog](https://github.com/google/mcp), [Developer Knowledge](https://developers.google.com/knowledge/mcp).

## 6. Application architecture

### 6.1 Shared core

~~~mermaid
flowchart TD
    UI[Research Scout UI] --> CORE[Research service]
    MCP[MCP interface] --> CORE
    CORE --> PLAN[Query planning and provider routing]
    PLAN --> ADAPTERS[Provider adapters]
    ADAPTERS --> SCHOLAR[Scholarly discovery and metadata]
    ADAPTERS --> ACCESS[Access resolution and acquisition]
    ADAPTERS --> WEB[Web discovery and reading]
    ADAPTERS --> VIDEO[Video discovery and evidence]
    CORE --> CATALOG[Catalog and research history]
    ACCESS --> INGEST[Parsing and validation jobs]
    INGEST --> EVIDENCE[Evidence passages and search index]
    EVIDENCE --> SYNTH[Comparison and cited synthesis]
    CATALOG --> SYNTH
~~~

Provider discovery, acquisition, and model synthesis are distinct capabilities. The initial adapter interface may call a direct API, a library, or a verified upstream MCP implementation. Normalize outputs at the boundary.

### 6.2 Proposed initial stack

- Backend: Python service, with FastAPI/Pydantic/httpx as reasonable implementation candidates.
- Metadata: SQLite with migrations and FTS5 for the first passage-search baseline.
- Files: application-controlled local storage with checksums and a manifest.
- Jobs: persisted job records and a bounded worker; job completion must survive a request ending.
- UI: thin local browser interface for search, shortlist, reader, evidence comparison, and export.
- Model interface: structured extraction/synthesis adapter, configurable by provider/model.
- MCP: local STDIO surface initially; add Streamable HTTP and user isolation for a real remote/multi-user requirement.

Package/framework versions are intentionally not pinned in this planning document. Select supported versions during implementation and record them in lockfiles.

### 6.3 Scale triggers

Add infrastructure only after measuring the need:

- Embeddings/hybrid retrieval: passage relevance falls short of the lexical baseline.
- Managed File Search: managed retrieval fits privacy, cost, citation, and portability needs.
- PostgreSQL/managed storage: multiple users, concurrency, or operational requirements justify migration.
- Dedicated queue/workers: ingestion volume and recovery requirements exceed the local worker.
- Hosted MCP: remote clients require it.
- Enterprise access integrations: an entitled customer requests them.

Migration boundaries should already separate storage, indexing, providers, and model access.

## 7. Research workflow and evidence rules

### 7.1 Research request

Capture:

- Question and purpose.
- Discipline and intended audience.
- Date range, language, geography/population.
- Included source types and document types.
- Inclusion/exclusion criteria.
- Search mode: exploration or defined-corpus analysis.
- Desired output.
- Provider/request/document/model budget.

Example:

~~~json
{
  "question": "How do higher education studies define institutional AI readiness?",
  "discipline": "education",
  "date_range": {"from": "2020-01-01", "to": "2026-10-26"},
  "source_types": ["paper"],
  "search_mode": "exploration",
  "include_preprints": true,
  "inclusion_criteria": ["institution-level readiness", "higher education context"],
  "exclusion_criteria": ["school-only populations"],
  "output": "definition_comparison",
  "budget": {"max_candidates": 50, "max_documents": 10}
}
~~~

Numbers in this example are proposed run limits, not provider quotas or accuracy guarantees.

### 7.2 Planning and routing

1. Convert the question into concepts, synonyms, and explicit constraints.
2. Produce provider-specific queries, recording exact executed syntax.
3. Select only relevant capabilities.
4. Preview result scope before expensive acquisition.
5. Enrich selected works rather than querying every provider for every item.
6. Broaden discovery only when measured coverage or the user's task warrants it.

For biomedical topics, include PubMed/PMC. For preprint-heavy technical topics, consider arXiv. Missing coverage should be reported explicitly.

### 7.3 Identity and deduplication

- Normalize identifiers and URL forms.
- Preserve DOI, PMID, PMCID, arXiv, OpenAlex, and Semantic Scholar IDs independently.
- Use trusted identifiers and explicit relationships before title similarity.
- Treat fuzzy matches as candidates with confidence, not automatic identity proof.
- Retain preprint/published-version relationships.
- Do not assume a conference paper and a substantially extended journal paper are the same study.
- Repeated metadata in several indexes is not independent corroborating evidence.

### 7.4 Access and acquisition

Preferred sequence is capability-based, not a fixed universal publisher chain:

1. Reuse a valid local asset where permitted.
2. Check repository/content links supplied by the catalog.
3. Resolve missing OA locations through Unpaywall.
4. Retrieve from suitable repository/content APIs.
5. Try explicitly enabled fallback routes through the acquisition adapter.
6. Record all failures and retain metadata when full text is unavailable.

Validate content type, plausible size, identity, article versus supplement, and version. A PDF signature proves a file format, not that it is the intended paper.

Supplements are separate assets. Their existence does not establish that the underlying research dataset is complete or reusable.

### 7.5 Parsing and extraction

Prefer structured article XML/TEI where available. Retain original files alongside derived text. Handle malformed XML, missing sections, tables, and scanned PDFs explicitly.

Extract:

- Research question/hypothesis.
- Study design.
- Population/sample/dataset.
- Methods and analytical approach.
- Definitions of relevant concepts.
- Findings and quantitative results with units/context.
- Limitations.
- Funding/conflicts where supplied and relevant.
- Source passages supporting each field.

Distinguish source-authored text, provider-generated summaries, parsed text, model extraction, and model synthesis. Do not use a summary as a substitute for the underlying evidence.

### 7.6 Passage retrieval and synthesis

Begin with lexical passage search and metadata filters. Evaluate embeddings/hybrid ranking on known questions.

For each synthesized claim:

- Link supporting and contradicting passages.
- Preserve locators and the actual asset/version read.
- Describe access limitations.
- Avoid generalizing beyond the source's population and methods.
- Report insufficient evidence when support is missing.

An abstract-only source cannot support invented details about unseen methods or results. A metadata-only video cannot support claims about its spoken content.

### 7.7 Landscape analysis

Use a defined, reproducible corpus for counts. Relevance-ranked top results are a shortlist, not a population estimate.

Record:

- Database, executed query, filters, date, document types, and exclusions.
- Deduplication and version handling.
- Whether the current year is incomplete.
- Country affiliation counting: full or fractional.
- Journal volume versus citations to works in the selected corpus.
- Provider and timestamp for citation metrics.

Do not average or add citation counts across providers. High citation count is not a quality assessment. “No evidence found under these searches” is weaker than a demonstrated literature gap.

## 8. Data model and provenance

### 8.1 Core entities

| Entity | Purpose / representative fields |
|---|---|
| ResearchProject | Question family, scope, saved library, settings |
| ResearchRun | Request, query plan, executed calls, budgets, selected sources, model versions, status |
| SourceSelection | Run/work/version membership, shortlist state/rank, inclusion/exclusion reason, selection timestamps |
| ResearchRunRevision | Immutable input/query/selection/asset/passage-reference manifest and generation configuration used by a comparison or export |
| Work | Intellectual contribution; internal ID, normalized identifiers, type, selected display metadata |
| PublicationVersion | Preprint/accepted/published/revised copy; dates, relationships, status |
| ProviderRecord | Provider ID, retrieved time, raw/normalized fields, permitted retention, schema version |
| MetadataAssertion | Field/value/source/time/confidence and selected-value rationale |
| SourceLocation | Landing/PDF/XML URL, host, version, access and license evidence |
| Asset | Particular file/page/transcript; checksum, origin, size/type, storage path, retrieval and retention |
| Passage | Text, asset, section/page/paragraph/table/timestamps, extraction method/version |
| Claim | Statement, supporting/contradicting passages, scope and review status |
| Relationship | Version-of, cites, dataset-for, supplement-to, software-for, authored-by; provenance/confidence |
| Job | Type, state, attempts, progress, errors, idempotency key |
| Export | Format, research-run revision, cited claims and source manifest |

The conceptual Work/PublicationVersion model is deliberate: identical IDs, revised files, and related outputs cannot safely be represented by one flattened “paper” row.

Create lightweight run revisions before the first comparison/export; richer revision-history UI can wait. Immutability applies to manifests, not a permission to retain restricted content indefinitely. Exports reference a revision and evidence assets, while independently refreshable provider caches retain their own lifecycle. New source selections or evidence changes produce a new revision; affected stored exports are marked stale where necessary.

### 8.2 Dataset extension

Represent a dataset as a Work with resource_type=dataset, linked PublicationVersion/Asset records, and an optional DatasetProfile extension. Discovery metadata and inferred applicability belong to the catalog. Schema, variables, units, missingness, and computed summaries are separately labeled profiled fields created only after ingestion. Track discovered, retrieved, and profiled states independently.

Dataset records additionally need publisher, version, variables, schema/data dictionary, units, coverage dates, geography/population, formats, size, missingness notes, and access conditions.

Use registered DataCite relationships where available. Mark text-inferred matches separately. Start with dataset discovery; support one selected repository and manageable format before general analysis.

### 8.3 Statuses

Keep access and processing states independent.

Access:

- metadata_only
- abstract_only
- source_snippet
- fulltext_available
- fulltext_retrieved
- access_unavailable

Processing:

- queued
- running
- completed
- partially_completed
- failed
- cancelled
- needs_review

Do not represent all acquisition failures as “paywalled.” Distinguish unavailable, invalid URL, authentication/entitlement, rate/budget limit, timeout, wrong document, parse failure, and unsupported format.

### 8.4 Provenance contract

Every evidence-bearing object should retain:

~~~text
provider and provider_record_id
canonical source URL and actual retrieval URL
research_run_id and executed query/call reference
retrieved_at and source/version dates
asset_id, checksum, format, and content origin
access status and license/access evidence
refresh_after or deletion requirements where applicable
page/section/paragraph/table/timestamp locator
extraction method and version
model/provider/version for generated transformations
confidence/review status and supporting passage IDs
~~~

Store raw responses only where retention permits. Separate original content from model outputs. Refresh/deletion must also invalidate or reevaluate affected search entries, claims, and exports.

## 9. Service, API, and MCP contracts

### 9.1 Domain functions

Proposed capability names:

~~~text
search_papers
get_work
set_shortlist_selection
validate_metadata
resolve_open_access
fetch_document
get_job
search_evidence
compare_sources
get_landscape
search_web
search_videos
get_video_details
import_transcript
search_datasets
get_research_run
export_brief
~~~

Add functions only when their increment is ready. A combined search_sources function can be introduced after individual source types work; do not force one identical schema onto every evidence type.

### 9.2 Provider adapter behavior

Each adapter should declare:

- Supported capability and query modes.
- Authentication configuration and capability-level availability.
- Paging and batching.
- Per-endpoint rate/concurrency controls.
- Budget/cost observation where available.
- Retention and attribution requirements.
- Response normalization and provenance.
- Retryable and non-retryable errors.
- Health and last verified documentation/version.

A provider timeout should produce a partial result with errors, not erase successful results from other providers.

### 9.3 Result envelope

Illustrative contract:

~~~json
{
  "request_id": "req-example",
  "research_run_id": "run-example",
  "status": "partially_completed",
  "items": [],
  "next_cursor": null,
  "truncated": false,
  "stop_reason": null,
  "provenance": {"providers_completed": ["openalex"]},
  "warnings": [{"code": "provider_unavailable", "provider": "secondary"}],
  "errors": [],
  "usage": {"requests": 1, "cost_usd": null}
}
~~~

Unknown cost is null, not zero. Do not expose credentials or sensitive request headers.

next_cursor is an opaque application cursor, not one upstream provider's cursor. It must capture per-provider page/cursor state, query/filter identity, ordering, and deduplication progress. Explicitly report provider truncation and result ceilings rather than presenting a capped search as exhaustive. If a defined corpus cannot be fully enumerated, label the analysis incomplete or use a provider-supported aggregate operation with an explicit matching scope.

### 9.4 Proposed application routes

~~~text
POST /research-runs
POST /research-runs/{id}/paper-search
POST /research-runs/{id}/shortlist
PATCH /research-runs/{id}/shortlist/{work_id}
GET  /works/{id}
POST /works/{id}/acquisitions
GET  /jobs/{id}
POST /research-runs/{id}/evidence-search
POST /research-runs/{id}/comparisons
POST /research-runs/{id}/landscape
POST /research-runs/{id}/web-search
POST /research-runs/{id}/video-search
POST /research-runs/{id}/exports
~~~

These are design suggestions, not existing endpoints. Async acquisition returns a job ID immediately. Repeated acquisition requests should reuse/reconcile existing assets through idempotency rather than repeatedly downloading them.

### 9.5 MCP interface

- App routes and MCP tools call the same domain services.
- Begin with bounded tools such as search_papers/get_work.
- Return structured summaries and resource/asset references rather than entire corpora.
- Add evidence tools once locators and source access are implemented.
- Keep STDIO stdout protocol-clean; use stderr for logs.
- Use application-owned output paths; do not expose arbitrary filesystem writing as a tool argument.
- Add remote transport, authentication, and per-user isolation only for a real requirement.
- The model selects capabilities; deterministic code enforces budgets and data handling.

## 10. Incremental development plan

The sequence incorporates the successive refinements. Increment 1 provides an early useful product; increments 0–4 constitute the paper-evidence MVP. Later source lanes are additive.

### Increment 0 — Contract, fixtures, and skeleton

Build:

- Research request and catalog schemas.
- Basic service/CLI or API skeleton.
- SQLite migrations, file-store abstraction, configuration, and provider interfaces.
- A small human-reviewed evaluation set and legally retainable fixtures.

Exit:

- One research run can be created, persisted, reopened, and inspected.
- Secrets are outside tracked files.
- Expected discovery and citation behavior is documented.

### Increment 1 — OpenAlex discovery and Crossref validation

Build:

- Search, filters, paging, result cards, paper details, and saved shortlist.
- Exact query/call logging.
- Selected DOI/bibliographic validation, registration-agency handling/DataCite singleton fallback, and field provenance.
- Persisted shortlist inclusion/exclusion states and a lightweight revision manifest for exports.
- BibTeX/RIS or equivalent bibliography export.
- Initial MCP search/get tools if a desktop-client demonstration is useful.

Exit:

- Topic to saved, attributed shortlist to usable bibliography.
- Provider misses and metadata conflicts are visible.
- Repeated searches/paging respect budgets.

### Increment 2 — Complementary scholarly coverage

Build:

- Semantic Scholar search/enrichment and selected citation/snippet tools under applicable access terms.
- Cross-provider identifier mapping and deduplication.
- PubMed and/or arXiv branches according to actual test topics.
- Clearly labeled provider summaries, abstracts, and snippets.

Exit:

- Combined results preserve provenance and version relationships.
- Benchmark whether an additional provider improves relevant coverage.
- The application handles a missing key or failed secondary provider.

### Increment 3 — Full-text acquisition

Build:

- Access-location resolution and an acquisition manifest.
- Direct content/repository paths and Unpaywall fallback.
- Small controlled trial of fulltext-article-downloader behind the adapter.
- Document identity/version validation, checksums, job status, and failure classification.
- Minimal persisted job lifecycle, bounded retries, usage counters, cancellation checks, and restart recovery. Increment 9 expands operational coverage rather than introducing these essentials.

Exit:

- Every shortlisted paper has an explicit access/acquisition state.
- Wrong documents, supporting files, and abstract-only responses are not silently accepted as article full text.
- Download retry/resume is bounded and idempotent.

### Increment 4 — Evidence reader and cited comparison

Build:

- Structured XML/PDF parsing and manual locator verification.
- Passage storage/text search.
- Structured extraction with supporting passage IDs.
- Selected-source Q&A and definition/method/findings comparison.
- Simple evidence table and cited brief export.

This increment covers bounded comparison over selected papers. Wider multi-source synthesis and richer revision workflows belong to Increment 9.

Exit:

- A user can inspect the exact source evidence for substantive claims.
- Abstract-only limitations remain visible.
- Evidence omissions and conflicting findings are represented.
- Paper-evidence MVP demonstration succeeds on the reviewed examples.

### Increment 5 — Reproducible landscape and citation navigation

Build:

- Explicit corpus/query definition.
- Year/venue/country aggregation and citation traversal.
- Counting rules, snapshot labels, and exported query manifest.
- Optional OpenCitations only if it adds measurable value.

Exit:

- Counts reconcile with executed queries and local deduplication rules.
- Candidate limits from exploration requests are not reused as the population size. Truncated corpus enumeration must remain visibly incomplete.
- Charts never present semantic top-k results as exhaustive populations.
- Citation metrics retain their provider and observation date.

### Increment 6 — Web knowledge

Build:

- One appropriately licensed structured discovery adapter.
- User-supplied URL ingestion and allowed destination reading.
- Main-content extraction and publication/publisher dates where available.
- Distinct search-snippet versus retrieved-page evidence.
- Optional separate Google-grounded answer presentation.

Exit:

- A web-supported claim links to the content actually read.
- Unsupported/blocked pages produce explicit outcomes.
- Search-derived data follows its retention/attribution requirements.
- Google grounding URLs are not used as a harvesting queue.

### Increment 7 — YouTube knowledge

Build:

- Public search/details and selectable video cards.
- Timestamped transcript import for authorized/user-provided text.
- Passage retrieval and citation links into video time.
- Optional video-analysis experiment after transcript-backed behavior is reliable.

Exit:

- Metadata-only videos remain distinguishable from content-backed evidence.
- Caption listing is not presented as transcript access.
- Quotas and refresh policies are enforced.
- Generated video analysis is labeled and verified separately.

### Increment 8 — Dataset discovery, then controlled ingestion

Build discovery first:

- Selected reviewed directory entries and DataCite records.
- Applicability/coverage metadata and registered/inferred relationships.
- Dataset shortlist without mandatory download.

Then one ingestion slice:

- One relevant repository and one manageable format, such as CSV.
- Version/checksum, data dictionary, schema profile, and links to papers.

Exit:

- The app explains why a dataset fits or fails the research question.
- Schema and provenance survive retrieval.
- Topical similarity is not treated as empirical support.
- Actual analytical execution remains a separately validated feature.

### Increment 9 — Synthesis, product reliability, and optional expansion

Build:

- Broader multi-source evidence matrices, contradictions, scoped gaps, and policy briefs, extending the bounded comparisons from Increment 4.
- Research-run revision history and bibliography validation.
- Recovery, cancellation, request/cost telemetry, and backup/export.
- Optional pybliometrics/institutional sources.
- Multi-user/hosted operation only if required.
- Author/institution enrichment and additional domain sources when justified.

Exit:

- Outputs survive source-level review and state coverage limitations.
- Partial failure produces an understandable partial result.
- Representative performance and cost targets are met.
- Empirical results are based on actual analyses, not generated to fill a section.

## 11. Evaluation and acceptance criteria

### 11.1 Build a small reference set first

Proposed initial evaluation: approximately 15–25 reviewed questions and a curated set of relevant papers/documents. This is a suggested project-sized starting point, not an externally validated benchmark.

Include:

- Education/policy questions around institutional AI readiness.
- Biomedical questions around student mental health interventions.
- A technical/preprint-heavy question.
- Known DOI/title lookups.
- Full-text available and unavailable sources.
- Sources with revised/published versions.
- Conflicting definitions/findings.
- Web and video questions after those integrations exist.

### 11.2 Measures

| Area | Measure / review |
|---|---|
| Discovery | Human relevance judgments, precision at k, known-source recall, marginal coverage per provider |
| Identity | Wrong merges, missed duplicates, and version handling |
| Acquisition | Correct full-text success rate over eligible sources; failure reasons |
| Parsing | Body/section/table/locator fidelity on manually checked examples |
| Retrieval | Whether known supporting passages appear in top results |
| Extraction | Field accuracy and correct passage support |
| Synthesis | Whether cited passages entail the claims; contradictions and missing evidence |
| Landscape | Reproducible counts and correct scope/counting rules |
| Web/video | Content-access labels and valid page/timestamp locators |
| Operations | Latency, requests, retries, model tokens, storage, cost, and partial-failure behavior |

Set numerical relevance/performance thresholds after measuring a baseline. Do not invent quality percentages before establishing judgments.

Required behavioral gates:

- Every substantive generated claim in the evaluated output has inspectable support or is explicitly marked unsupported/uncertain.
- No fabricated identifiers, citations, methods, or empirical results.
- Do not count versions of the same study as independent evidence; do not merge distinct studies without a supported relationship.
- No successful-full-text state for an unrelated or abstract-only file.
- No indefinite retry loop.
- No secrets in logs, exports, fixtures, or model context.

### 11.3 Necessary failure cases

Test behavior, not implementation mirroring:

1. 429 with Retry-After; daily budget exhaustion.
2. Timeout and partial provider success.
3. Invalid identifier versus provider-not-found.
4. Unrelated PDF returned for a valid DOI.
5. Supplement returned instead of main paper.
6. XML with no article body; scanned/unparseable PDF.
7. Conflicting publication dates and article versions.
8. Dataset/software DOI entered as a paper DOI.
9. Broken dataset link or unsuitable dates/population.
10. Metadata-only video asked a spoken-content question.
11. A source passage containing instructions aimed at the model.
12. Refresh/deletion of content underlying an existing claim.
13. Interrupted ingestion followed by restart.
14. Bibliography entry with incomplete/ambiguous metadata.

Use deterministic unit/contract tests for normalization, state transitions, and locators; fixture-based integration tests for provider adapters; a bounded opt-in live smoke suite; and human-reviewed retrieval/synthesis evaluation.

## 12. Operational requirements

### 12.1 Configuration and secrets

Suggested configuration names; values are not supplied:

~~~dotenv
SCOUT_DATA_DIR=./data
SCOUT_DATABASE_URL=sqlite:///./data/scout.db
OPENALEX_API_KEY=
CROSSREF_CONTACT_EMAIL=
SEMANTIC_SCHOLAR_API_KEY=
UNPAYWALL_EMAIL=
NCBI_API_KEY=
NCBI_TOOL=research-scout
NCBI_EMAIL=
YOUTUBE_API_KEY=
WEB_SEARCH_PROVIDER=disabled
WEB_SEARCH_API_KEY=
MODEL_PROVIDER=disabled
MODEL_NAME=
MODEL_API_KEY=
~~~

Map package-specific names, such as downloader environment variables, inside adapters. Missing credentials disable the relevant optional capability gracefully. Do not invent contact emails or automatically sign up users.

Local .env files, tokens, downloaded content, databases, and raw research fixtures should not be committed by default. Keep .env.example free of real credentials.

### 12.2 Budgets and recovery

- Enforce per-run candidate, document, request, and model-token ceilings.
- Use provider-specific concurrency/rate controls and bounded retries with jitter.
- Respect Retry-After and distinguish daily exhaustion from transient throttling.
- Track unknown usage explicitly.
- Checkpoint paginated searches and ingestion.
- Separate immutable file identity from refreshable provider metadata.
- Reuse existing assets only where identity and retention remain valid.

### 12.3 Acquisition and evidence boundaries

These controls directly support a reliable document-fetching product:

- Validate public URLs/redirect destinations; prevent local/internal address fetching.
- Bound file size, redirects, timeouts, and decompression.
- Use application-owned output paths.
- Parse downloaded content without executing it.
- Treat source text as evidence, never as instructions authorizing tools or secret access.
- Keep model outputs separate from source-authored material.
- Apply source-specific retention rather than a universal cache policy.

A library's code license, a source's open metadata license, and a document's content rights are separate records. Entitled institutional access is an optional capability, not a general access bypass.

### 12.4 Observability

Record request/run/job IDs, provider, endpoint/capability, duration, retry count, outcome, bytes, budget observations, parser/model versions, and redacted error categories.

Expose understandable states: searching, resolving access, retrieving, parsing, ready, partial, unavailable, and failed. Keep operational details out of the primary reading workflow unless they explain a meaningful limitation.

## 13. Outputs and paper-writing support

### 13.1 Initial outputs

- Saved shortlist and source cards.
- Bibliography export.
- Document/access manifest.
- Definition/method/findings evidence matrix.
- Source-linked Q&A.
- Cited comparison or research brief.
- Search/query manifest suitable for documenting the method.

### 13.2 Later outputs

- Landscape charts with scope/counting notes.
- Contradictory-findings and scoped-gap reports.
- Policy brief.
- Related datasets/software and applicability notes.
- Paper outline/draft grounded in selected evidence.

### 13.3 Research paper structure

IMRAD refers to Introduction, Methods, Results, and Discussion. Abstract, conclusion, references, and other sections vary by discipline and venue. Do not enforce one template for every output.

| Section | Research Scout support |
|---|---|
| Abstract | Summarize an existing, completed draft and verified findings |
| Introduction | Context, prior work, question, and a carefully supported gap |
| Methods | Search/selection procedure for a review, or actual study/analysis procedure for empirical work |
| Results | Evidence synthesis for a review; actual computed/observed results for empirical research |
| Discussion | Interpretation, limitations, alternative explanations, and relationship to prior work |
| Conclusion | Implications and future work within the supported scope |
| References | Verified bibliographic records for sources actually cited |

Analytical and argumentative writing should use suitable discipline-specific outlines. Source retrieval alone does not constitute an experiment, clinical trial, or empirical result.

### 13.4 Canonical demonstration

Question: “How do higher education studies define institutional AI readiness?”

Expected flow:

1. Search and inspect candidate papers.
2. Validate identities and save a bounded shortlist.
3. Retrieve accessible copies with versions and access states.
4. Extract each author's definition with passages.
5. Compare differences in constructs, population, and methods.
6. Open supporting page/section locators.
7. Export the evidence matrix and bibliography.
8. Report papers not read in full and unresolved evidence gaps.

For the biomedical example, search AI interventions/student mental-health outcomes with explicit study/population criteria. Classify the actual study design and population; do not infer a clinical trial or causal effect from a title.

## 14. Initial backlog and decision register

### 14.1 P0 — First useful slice

- [ ] Inspect the actual target repository and applicable instructions.
- [ ] Confirm/refine the local single-user default without blocking unrelated work.
- [ ] Establish project/request/provider/work/identifier schemas.
- [ ] Create migrations and a local configuration example.
- [ ] Implement OpenAlex discovery and details.
- [ ] Add selected Crossref lookup/enrichment.
- [ ] Save a shortlist with provenance, inclusion/exclusion reasons, and query history.
- [ ] Handle DOI registration agency and DataCite singleton fallback.
- [ ] Snapshot the selected source manifest for the first export.
- [ ] Export a bibliography.
- [ ] Add focused tests and a bounded live smoke command.
- [ ] Demonstrate the slice and document observed limitations.

### 14.2 P1 — Paper-evidence MVP

- [ ] Add complementary discovery justified by evaluation.
- [ ] Resolve access and implement acquisition jobs.
- [ ] Benchmark a controlled downloader adapter.
- [ ] Parse assets and preserve locators.
- [ ] Retrieve passages and extract supported definitions/findings.
- [ ] Produce a cited comparison.
- [ ] Add bounded MCP tools over the same service.
- [ ] Complete wrong-document, version, and partial-failure tests.

### 14.3 P2 — Broader scout

- [ ] Reproducible landscape analytics.
- [ ] Public web search/reading.
- [ ] YouTube discovery and transcript-backed evidence.
- [ ] Dataset discovery and controlled ingestion.
- [ ] Optional licensed services and richer identity/citation graph.
- [ ] Hosted/multi-user operation if requested.
- [ ] Advanced paper drafting and reproducible analysis features.

### 14.4 Decisions still open

| Question | Proposed default |
|---|---|
| Target discipline | Broad discovery with education/policy and biomedical evaluation examples |
| Interface | Thin local UI plus reusable service; MCP as additional interface |
| Hosted model | Configurable; retrieval/bibliography usable without generation |
| Semantic indexing | Lexical baseline first; choose embeddings after evaluation |
| Web provider | Decide based on coverage, usage/storage terms, and budget |
| Downloader adoption | Trial before dependency commitment |
| Monthly budget | No paid subscription assumed; explicit run/provider ceilings |
| Multi-user/cloud | Defer until required |
| Institutional entitlements | Optional, user-provided |
| Dataset analysis | Later capability, separate from catalog discovery |

These are refinement questions, not reasons to halt repository inspection or the first independent implementation slice.

## 15. VS Code/Codex continuation instructions

### 15.1 Read this before coding

1. Inspect the actual repository, local instructions, and current implementation.
2. Treat this document as the handoff, with official provider docs as the source of current API truth.
3. Preserve existing user code and decisions.
4. Implement one vertical slice at a time.
5. Keep provider/domain logic independent of UI and MCP.
6. Record tested behavior and deviations from the proposal.
7. Do not describe planned modules as implemented.
8. Verify only the provider capabilities needed for the slice; avoid broad infrastructure work without a demonstrated need.

### 15.2 Suggested repository structure

Illustrative only; adapt to an existing repository:

~~~text
research-scout/
  README.md
  pyproject.toml
  .env.example
  src/research_scout/
    domain/
    services/
    providers/
    acquisition/
    parsing/
    retrieval/
    synthesis/
    storage/
    jobs/
    api/
    mcp/
  migrations/
  frontend/
  tests/
    unit/
    contracts/
    integration/
    fixtures/
  evals/
    queries/
    judgments/
  docs/
    architecture.md
    decisions/
    validation/
  data/                  # local, ignored
~~~

### 15.3 Ready-to-use continuation prompt

~~~text
Use the Research Scout handoff Markdown as project context. Inspect the repository
and applicable instructions first. Refine implementation choices against the
existing code and current official API documentation.

Implement the first useful vertical slice: create a research run, search OpenAlex,
inspect works, validate/enrich selected Crossref DOI records, save a shortlist with
provider/field provenance, and export a bibliography. Preserve exact executed
queries and distinguish missing data from invalid identifiers.

Use one shared application core that can later serve the UI and MCP. Keep
credentials external, use bounded requests, and support partial failures. Add a
small human-reviewed evaluation set and meaningful tests for identifier
normalization, metadata conflicts, pagination, persistence, and exports. A bounded
opt-in live API smoke test is sufficient; do not require network for all tests.

Do not implement every provider, cloud deployment, advanced vector infrastructure,
or full paper generation in this slice. Keep their interfaces extensible. If the
repository already contains part of this capability, continue it rather than
rebuilding it. Deliver a runnable demonstration, validation results, and a concise
record of changes, limitations, and the next increment.
~~~

### 15.4 Completion record for future sessions

For each increment, record:

- What was implemented and where.
- Configuration/dependencies and exact versions.
- Provider docs/schema/access last checked.
- Test/evaluation commands and results.
- Real live-call observations versus fixtures.
- Known limitations and unverified assumptions.
- Next independently useful increment.

## 16. Source register

The six user-supplied sources:

1. [Google MCP repository](https://github.com/google/mcp)
2. [Scalekit: YouTube MCP versus API](https://www.scalekit.com/blog/youtube-mcp-vs-api)
3. [fulltext-article-downloader](https://github.com/computron/fulltext-article-downloader)
4. [pybliometrics](https://github.com/pybliometrics-dev/pybliometrics)
5. [Awesome Public Datasets](https://github.com/awesomedata/awesome-public-datasets/blob/master/README.rst)
6. [IntuitionLabs scholarly API survey](https://intuitionlabs.ai/articles/research-paper-apis-scientific-literature)

Additional official/provider/project references used for implementation findings:

- [OpenAlex API](https://help.openalex.org/api/)
- [OpenAlex authentication and rates](https://help.openalex.org/api/authentication/)
- [OpenAlex semantic search](https://help.openalex.org/api/semantic-search/)
- [OpenAlex pricing](https://help.openalex.org/access/pricing/)
- [OpenAlex full text](https://help.openalex.org/access/fulltext/)
- [OpenAlex MCP connector](https://help.openalex.org/access/connector/)
- [OpenAlex MCP source](https://github.com/ourresearch/openalex-mcp-server)
- [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)
- [Crossref API source documentation](https://github.com/Crossref/rest-api-doc)
- [DataCite public/member API](https://support.datacite.org/docs/api)
- [DataCite single DOI lookup](https://support.datacite.org/docs/api-get-doi)
- [Semantic Scholar API](https://api.semanticscholar.org/api-docs/)
- [Semantic Scholar snippets](https://api.semanticscholar.org/api-docs/snippets)
- [Semantic Scholar access](https://www.semanticscholar.org/product/api)
- [Semantic Scholar API agreement](https://api.semanticscholar.org/license/)
- [Unpaywall API](https://data.unpaywall.org/products/api)
- [Unpaywall response format](https://unpaywall.org/data-format)
- [arXiv API manual](https://info.arxiv.org/help/api/user-manual.html)
- [arXiv licenses](https://info.arxiv.org/help/license/index.html)
- [NCBI E-utilities rate limits](https://support.nlm.nih.gov/kbArticle/?pn=KA-05510)
- [PMC developers](https://pmc.ncbi.nlm.nih.gov/tools/developers/)
- [PMC OAI-PMH](https://pmc.ncbi.nlm.nih.gov/tools/oai/)
- [PMC text-mining/access guidance](https://pmc.ncbi.nlm.nih.gov/tools/textmining/)
- [YouTube search](https://developers.google.com/youtube/data/reference/rest/v3/search/list)
- [YouTube video details](https://developers.google.com/youtube/data/reference/rest/v3/videos/list)
- [YouTube caption download](https://developers.google.com/youtube/data/reference/rest/v3/captions/download)
- [YouTube quota calculator](https://developers.google.com/youtube/data/determine_quota_cost)
- [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies)
- [YouTube API errors](https://developers.google.com/youtube/data/reference/rest/v3/errors)
- [Google managed MCP products](https://docs.cloud.google.com/mcp/supported-products)
- [Google Developer Knowledge MCP](https://developers.google.com/knowledge/mcp)
- [MCP hosting on Cloud Run](https://docs.cloud.google.com/run/docs/host-mcp-servers)
- [Gemini Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search)
- [Gemini terms, including grounding restrictions](https://ai.google.dev/gemini-api/terms)
- [Gemini URL Context](https://ai.google.dev/gemini-api/docs/url-context)
- [Gemini File Search](https://ai.google.dev/gemini-api/docs/file-search)
- [Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Google vector search](https://docs.cloud.google.com/vertex-ai/docs/vector-search/overview)
- [Google Knowledge Graph](https://developers.google.com/knowledge-graph)
- [Legacy Custom Search status](https://developers.google.com/custom-search/v1/overview)
- [Google Drive download/export](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
- [Google Scholar access help](https://scholar.google.com/intl/en/scholar/help.html)
- [Brave Search API](https://brave.com/search/api/)
- [Brave MCP source](https://github.com/brave/brave-search-mcp-server)
- [SerpApi Google Videos](https://serpapi.com/google-videos-api)
- [SearchAPI Google Videos](https://www.searchapi.io/docs/google-videos)
- [Scalekit YouTube connector](https://docs.scalekit.com/agentkit/connectors/youtube/)
- [pybliometrics access](https://pybliometrics.readthedocs.io/en/stable/access.html)
- [Elsevier authentication](https://dev.elsevier.com/tecdoc_api_authentication.html)
- [Downloader acquisition code](https://github.com/computron/fulltext-article-downloader/blob/main/fulltext_article_downloader/downloader.py)
- [Downloader MCP code](https://github.com/computron/fulltext-article-downloader/blob/main/fulltext_article_downloader/mcp_server.py)
- [Dataset directory metadata source](https://github.com/awesomedata/apd-core)

Source availability note: some API documentation is JavaScript-rendered. A direct repeat Semantic Scholar agreement request returned a rate-limit error during handoff preparation; indexed primary-source content was subsequently retrievable and confirmed the expanded-use distinction. Unpaywall's indexed official API page also supplied its retirement and limit notice. Recheck applicable endpoint schemas and access agreements directly before implementation.

