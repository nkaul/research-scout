# Research Scout — Scholarly Providers and Source Review

**Prepared:** October 26, 2026  
**Research observation dates:** October 25–26, 2026  
**Authoring role:** Scholarly-provider research subagent  
**Purpose:** A self-contained context and findings handoff for the Codex agent implementing Research Scout incrementally.

## 1. Task context and review scope

The user wants an incrementally developed Research Scout application for finding papers, obtaining accessible documents, extracting knowledge, and eventually combining scholarly evidence with web and YouTube sources. The inspiration is a quoted four-server MCP workflow: OpenAlex maps a field; Semantic Scholar finds relevant papers/passages; Unpaywall locates accessible versions; PubMed extends biomedical coverage; an LLM synthesizes results.

This agent was assigned three related tasks:

1. Verify the scholarly providers' capabilities, access, API/MCP boundaries, and integration order using official documentation.
2. Review the IntuitionLabs survey, pybliometrics, and fulltext-article-downloader; identify implications and misleading assumptions.
3. Review the main development handoff for concrete omissions, endpoint mistakes, and implementation ambiguities without editing it.

The user supplied no concrete repositories for the Semantic Scholar, Unpaywall, or PubMed community MCP servers mentioned in the original quote. Their particular implementations remain unverified. This agent did not substantively review the Google MCP catalog, Scalekit article, or Awesome Public Datasets directory; those were assigned elsewhere in the team.

**Review boundary:** Documentation, repository READMEs/package metadata/history, and selected downloader acquisition/MCP source files were inspected. No package or MCP server was installed or run. No provider accounts or API keys were created. No credentialed API calls, download benchmarks, end-to-end retrieval tests, or full security audits were performed. Public documentation observations are not runtime compatibility guarantees. Source links to `main`/`master` are mutable; pin and record the reviewed revision before dependency adoption.

## 2. Main recommendation

Start with **OpenAlex discovery plus Crossref DOI verification**, then add complementary Semantic Scholar capabilities. Use existing OA locations and OpenAlex/repository content paths for acquisition, with Unpaywall as a DOI resolver fallback. Add PubMed/PMC for biomedical questions. A four-provider integration is an eventual capability set, not a prerequisite for the first useful release.

Keep these concerns separate:

- Discovery and bibliographic metadata.
- Work identity, publication versions, and relationships.
- Access-location resolution.
- Actual file retrieval and independent identity validation.
- Parsing and passage evidence.
- Retrieval, comparison, and model synthesis.
- Agent transport through MCP.

Direct APIs, a Python library, and MCP can all sit behind the same application service. Prefer the route whose behavior can be tested, bounded, and observed. A local MCP wrapper still calls upstream online services and inherits their quotas, access requirements, and charges.

## 3. Provider findings

### 3.1 OpenAlex: initial discovery, landscape, and content availability

OpenAlex provides works, authors, sources, institutions, topics, citation connections, filters, and grouping/counts. Use its work IDs alongside external identifiers rather than making its ID the sole identity of an intellectual work. [API reference](https://help.openalex.org/api/)

Reference routes:

```text
GET https://api.openalex.org/works
GET https://api.openalex.org/works/{id}
GET https://api.openalex.org/works?search={query}
GET https://api.openalex.org/works?search.semantic={query}
GET https://api.openalex.org/works?group_by={field}
```

The reviewed documentation describes anonymous basic use and a verified free API key with **$1/day of metered API usage**. A free key enables a larger budget and cursor paging beyond the initial page. Observed request limits were 10 RPS without a key, 30 RPS for free/prepaid use, and 1 RPS for semantic search. Observe response usage/budget information and treat these as dated configuration inputs. [Authentication and limits](https://help.openalex.org/api/authentication/), [pricing](https://help.openalex.org/access/pricing/)

Native semantic search matches title/abstract meaning, accepts up to 2,000 characters for matching, and returns at most 50 works. Some filters are unsupported in that query mode. Use this for relevant candidates, not exhaustive corpus enumeration or publication-volume estimates. [Semantic search](https://help.openalex.org/api/semantic-search/)

For covered OA works, `has_content` describes available formats and `content_urls` supplies cached file locations. Documented download forms include:

```text
https://content.openalex.org/works/{work_id}.pdf?api_key={key}
https://content.openalex.org/works/{work_id}.grobid-xml?api_key={key}
```

The TEI XML is parsed content and can contain extraction errors. Preserve the actual downloaded version, source/license information, and original asset. These downloads require a key and consume usage budget. The reviewed cost table lists PDF content downloads at $10 per 1,000 calls; the same daily allowance is shared across operation types. Do not promise both the maximum search allowance and maximum download allowance simultaneously. [Full-text documentation](https://help.openalex.org/access/fulltext/), [worked costs](https://help.openalex.org/access/example-costs/)

Grouping supports reproducible counts by fields such as publication year, institution, or author-affiliation country. Define whether country counting is full or fractional and distinguish journal publication volume from citations to works in the chosen corpus. Missing/unknown grouping values require explicit handling. [Grouping documentation](https://help.openalex.org/api/grouping/)

### 3.2 OpenAlex official MCP

An official open-source OpenAlex MCP service was verified:

```text
https://mcp.openalex.org/mcp
```

Its documented transport is Streamable HTTP with OAuth. The hosted connector uses the signed-in account's API budget. This establishes an official remote option; it does not substantiate the original quote's claim that every selected server runs locally or that upstream use is unlimited-free. Application API integration remains useful for deterministic paging, acquisition jobs, and persisted catalog behavior. [Connector documentation](https://help.openalex.org/access/connector/), [official source](https://github.com/ourresearch/openalex-mcp-server)

### 3.3 Crossref: early DOI metadata verification

Use Crossref to verify/enrich selected DOI metadata, deposited references, and relationships/update information where supplied. Fields can be incomplete; a source's absence is not evidence that the paper or DOI is invalid.

```text
GET https://api.crossref.org/works/{doi}
GET https://api.crossref.org/works?query.bibliographic={query}
GET https://api.crossref.org/works/{doi}/agency
```

Identify the application/contact according to current provider guidance, respect returned rate information, and encode query parameters correctly. Some deposited abstracts can carry copyright distinct from the broader metadata. [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api), [official source documentation](https://github.com/Crossref/rest-api-doc)

A DOI can be registered through DataCite or another agency. The Increment 1 validator should preserve an unresolved/provider-not-found state and support agency-aware fallback. DataCite singleton metadata lookup can be early even while broad dataset discovery is deferred:

```text
GET https://api.datacite.org/dois/{doi}
```

Do not assume Crossref and DataCite are an exhaustive list of registration agencies. Route known agencies explicitly and preserve unknowns. [DataCite API](https://support.datacite.org/docs/api)

### 3.4 Semantic Scholar: complementary relevance, passages, and graph

Relevant reference routes:

```text
GET https://api.semanticscholar.org/graph/v1/paper/search
GET https://api.semanticscholar.org/graph/v1/paper/search/bulk
GET https://api.semanticscholar.org/graph/v1/paper/{paper_id}
GET https://api.semanticscholar.org/graph/v1/snippet/search
```

Request the required fields rather than assuming the default response includes abstracts, identifiers, citations, and PDF locations. `paper/search` is relevance-ranked and returns at most 1,000 results. Evaluate the bulk endpoint for larger defined sets; its retrieval behavior and supported fields differ. [API documentation](https://api.semanticscholar.org/api-docs/)

Snippet search is real, not merely a proposed community MCP feature. It returns matching passages with section/offset/annotation information and source-paper provenance for available indexed text. A snippet does not establish that the entire paper was retrieved or reviewed. Retain its source kind and bounds. [Snippet API](https://api.semanticscholar.org/api-docs/snippets)

Most endpoints are publicly accessible through a shared unauthenticated rate pool; some require authentication. The documented introductory API-key limit is **1 RPS**. A key does not remove throttling. Implement bounded retry/backoff and capability-level degradation. [Access and rate guidance](https://www.semanticscholar.org/product/api)

The reviewed API agreement imposes use and attribution conditions and directs commercial uses to seek an expanded license. Do not treat all API outputs as unrestricted CC0 or enable a commercial application integration solely because an API key is available. Verify applicability before implementation; retain the agreement/access decision as provider configuration. This is a concrete provider dependency, not a claim that all scholarly APIs have identical restrictions. [API agreement](https://api.semanticscholar.org/license/)

No exact official/community Semantic Scholar MCP implementation was verified for the original four-server claim. Do not invent an MCP URL from the REST host name.

### 3.5 Unpaywall: DOI-based access resolver

```text
GET https://api.unpaywall.org/v2/{doi}?email={contact_email}
```

The reviewed API is free and requires a contact email; published guidance asks callers to stay within 100,000 calls/day. Its former `/v2/search` endpoint was retired **September 18, 2026**, and returns `410 Gone`; use DOI lookup for this adapter. [REST API](https://data.unpaywall.org/products/api)

Unpaywall returns metadata about accessible copies. `best_oa_location`, `oa_locations`, `url_for_pdf`, `url_for_landing_page`, `license`, and `version` describe candidate locations and versions. Fields can be null, and `url` can be a landing page rather than a PDF. It does not return extracted full text. Fetch and validate the actual asset separately. OpenAlex already carries overlapping OA information, so invoke this resolver when it adds value. [Response schema](https://unpaywall.org/data-format)

No particular Unpaywall MCP repository from the quoted setup was supplied or audited.

### 3.6 PubMed and PMC: discovery versus full text

```text
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi
```

Use `db=pubmed` for biomedical discovery and bibliographic records/abstracts. Full article bodies require a separate available full-text route, often PMC. Retain PMID, PMCID, and DOI independently.

The documented E-utilities baseline is **3 RPS without a key, 10 RPS with a key**. Identify the application/contact and batch requests where appropriate. A higher-rate key is a different request, not something the client should assume. [NCBI limits](https://support.nlm.nih.gov/kbArticle/?pn=KA-05510)

PMC supports automated acquisition through named services including E-utilities, OAI-PMH, BioC, and Cloud Service. Not all PMC articles permit text mining or the same reuse. Useful documented routes include:

```text
https://pmc.ncbi.nlm.nih.gov/api/oai/v1/mh/
https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/
https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi
```

Select the service for the intended article set and format. Preserve article-specific license/access evidence. Do not substitute generic website scraping for the supported automated services. [PMC developers](https://pmc.ncbi.nlm.nih.gov/tools/developers/), [PMC text-mining guidance](https://pmc.ncbi.nlm.nih.gov/tools/textmining/)

The specific PubMed community MCP server from the quote remains unverified.

### 3.7 arXiv: domain branch and versioned preprints

```text
GET https://export.arxiv.org/api/query
```

The query API returns Atom XML and supports search terms, identifier lookup, paging, and sorting. Preserve the actual arXiv version read and the relation to any later published work. Read the provider's current fair-use/pacing guidance during adapter implementation. [API manual](https://info.arxiv.org/help/api/user-manual.html)

Articles are freely readable/downloadable, but license choices vary and versions can have different licenses. Article content and repository metadata rights are separate. [License information](https://info.arxiv.org/help/license/index.html)

## 4. IntuitionLabs survey: use and corrections

The [March 8, 2026 survey](https://intuitionlabs.ai/articles/research-paper-apis-scientific-literature) was reviewed across its substantive sections, tables, examples, and references. Use its provider taxonomy as a shortlist; verify implementation details independently. Its corpus counts mix historical dates, some examples are incorrect, and some use cases are speculative. Its suggestion that PMC has been superseded should not replace supported PMC services.

Concrete correction references:

| Survey item | Implementation correction | Primary reference |
|---|---|---|
| `/v1/records/{doi}` or a `doi=` parameter as singleton lookup | Use the documented `/works/{doi}` form and current supported API version/path | [Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api) |
| Assumed `/works/{doi}/reference` sub-endpoint | Read deposited reference fields using the documented works response; verify any additional feature independently | [Crossref API source](https://github.com/Crossref/rest-api-doc) |
| All arXiv content CC-BY | Preserve the actual article/version license | [arXiv licenses](https://info.arxiv.org/help/license/index.html) |
| Semantic Scholar data universally CC0 | Apply the actual API agreement and content terms | [S2 API agreement](https://api.semanticscholar.org/license/) |
| PubMed/PMC treated as interchangeable | PubMed records/abstracts and eligible PMC full text are separate capabilities | [PMC developers](https://pmc.ncbi.nlm.nih.gov/tools/developers/) |

## 5. pybliometrics review

**Decision:** optional institutional adapter, deferred from the initial OA product.

[pybliometrics](https://github.com/pybliometrics-dev/pybliometrics) wraps Elsevier's Scopus, ScienceDirect, and SciVal APIs. Its inspected package metadata declares MIT licensing and Python ≥3.10. The project has an established change history; the retrieved stable changelog documents v4.4.1 dated January 1, 2026, and visible branch history showed subsequent work. These are maintenance observations, not a claim that a version was installed/tested. [Package metadata](https://raw.githubusercontent.com/pybliometrics-dev/pybliometrics/master/pyproject.toml), [changelog](https://pybliometrics.readthedocs.io/en/stable/changelog.html)

Its code license does not create access to Scopus/ScienceDirect content. Full functionality depends on product/API entitlement, keys, and institutional IP/VPN or tokens where applicable. Limited non-subscriber functions exist, but do not provide full product access. ScienceDirect and Scopus entitlements can differ. [Client access guide](https://pybliometrics.readthedocs.io/en/stable/access.html)

Elsevier's own authentication guidance states that an API key identifies an application and does not itself grant data/content access; entitlement must be verified. Use the wrapper when an entitled customer needs that coverage or metrics. Keep its identifiers and citation observations separate from OpenAlex/Semantic Scholar. [Elsevier authentication](https://dev.elsevier.com/tecdoc_api_authentication.html)

## 6. fulltext-article-downloader review

**Decision:** evaluate as a controlled Python acquisition adapter, not as the application's identity/provenance authority.

The [project](https://github.com/computron/fulltext-article-downloader) accepts DOI, arXiv, PMC, and OpenReview identifiers and offers Python, CLI, and local stdio MCP entry points. It chains retrieval routes and reports source, outcome, version notes, and attempts. Defaults include publisher-specific routes; optional extras add browser-session cookies and TLS behavior. Start with selected permitted repository/API routes rather than installing/enabling every extra. Paywalled content still depends on entitlement; the package is not a subscription replacement. [README](https://raw.githubusercontent.com/computron/fulltext-article-downloader/main/README.md)

Inspected package metadata declares v0.2.4, Python ≥3.10, BSD-3-Clause code licensing, an optional FastMCP dependency, and test configuration. Visible history included entitlement/PDF-check work in September 2026. The package has tests and benchmark fixtures, but this review did not execute them or validate their coverage. [Package metadata](https://raw.githubusercontent.com/computron/fulltext-article-downloader/main/pyproject.toml), [history](https://github.com/computron/fulltext-article-downloader/commits/main/), [license](https://raw.githubusercontent.com/computron/fulltext-article-downloader/main/LICENSE)

### Selected source-code findings

1. `_verify` passes no expected title for routes in `TRUSTED_TOOLS`; identity checking is therefore not uniform across routes.
2. A supplied custom `tools` list bypasses the publisher lookup that otherwise populates Crossref metadata. Expected-title information may then be absent.
3. A reused cached file is verified without an expected title at that call site.
4. Python `fetch_many(..., tools=...)` supports route restrictions.

These findings came from selected paths, not a complete downloader audit. [Acquisition implementation](https://raw.githubusercontent.com/computron/fulltext-article-downloader/main/fulltext_article_downloader/downloader.py)

The supplied MCP `get_paper` accepts an output directory and route list. Its `get_papers` batch function does not expose a route list. Output directory selection is not an application-owned sandbox boundary in this file. Wrap the Python functions with a fixed storage root and application-enforced routes instead of exposing these raw controls to the research model. [MCP implementation](https://raw.githubusercontent.com/computron/fulltext-article-downloader/main/fulltext_article_downloader/mcp_server.py)

### Adoption conditions

- Pin the selected version/revision and dependencies.
- Use a fixed output root and application-generated filenames.
- Restrict enabled routes explicitly; do not default to all optional browser-related routes.
- Independently verify DOI/title/author/version identity when available.
- Reject supplements, unrelated documents, and abstract-only responses as main-article full text.
- Preserve actual format, source, version notes, attempts, checksums, and failure reasons.
- Add bounded timeouts, size limits, retries, and provider-specific pacing.
- Use a small reviewed benchmark before committing to this dependency.

A PDF signature proves format, not identity. A successful return code is not proof that the complete requested study was obtained. The code license and each downloaded article's rights must remain separate records.

## 7. Incremental implementation sequence

### Step 0 — Shared catalog and provider contracts

Create schemas for research runs, works, publication versions, identifiers, provider records, metadata assertions, locations, assets, passages, claims, and jobs. Preserve original provider IDs and per-field source/time. Keep capability availability separate from the presence of a credential: some anonymous access remains available when a key is absent.

Provider adapters should expose search, detail lookup, enrichment, access resolution, acquisition, and passage search only where supported. Normalize results at the boundary; use deterministic code for budgets, allowed routes, validation, and persistence.

### Step 1 — OpenAlex discovery and Crossref verification

Deliver topic search, inspectable records, exact executed queries, a saved shortlist, and bibliography export. Include agency-aware DOI validation/DataCite singleton fallback as needed. A provider miss must remain distinguishable from an invalid identifier. Test paging, metadata conflicts, identifiers, and persistence with retained fixtures and a small opt-in live smoke test.

**Exit:** topic → verified saved shortlist → bibliography, with provenance and explicit limits.

### Step 2 — Complementary scholarly coverage

Add Semantic Scholar search, selected snippet/graph capabilities, and PubMed/arXiv branches justified by evaluation. Confirm applicable access terms before enabling each capability. Measure marginal relevance/coverage, rather than assuming more providers always improve results. Preserve provider-specific scores and citation metrics.

**Exit:** combined results retain identity/version relationships and survive a failed or unavailable secondary provider.

### Step 3 — OA resolution and document acquisition

Start with suitable existing content/repository locations, use Unpaywall for missing DOI access locations, and evaluate the controlled downloader adapter. Keep jobs resumable and idempotent. Distinguish full-text available, fetched, wrong document, unavailable, entitlement failure, throttled, and parse failure.

**Exit:** every selected source has an honest acquisition state; an unrelated or abstract-only file cannot become successful full text.

### Step 4 — Evidence extraction and comparison

Parse structured XML/TEI when useful, retain original files, and verify section/page/paragraph/table locators. Extract question, study design, population/data, methods, definitions, findings, and limitations with supporting passage IDs. Separate source-authored content, provider summaries, parsed text, and model transformations.

**Exit:** a user can inspect support for each substantive comparison claim, including abstract-only and missing-evidence limits.

### Step 5 — Landscape and citation analysis

Use a defined corpus for counts; semantic top-k results are not a population. Record query, date, document types, deduplication/version rules, incomplete-year handling, and country counting methodology. Distinguish journal volume from citations within the selected corpus. Never add/average citation counts from different indexes.

**Exit:** charts reconcile with executed queries and stated counting rules. Report "not found under these searches" rather than treating an unsuccessful search as proof of a literature gap.

### Step 6 — Shared MCP and broader evidence lanes

Expose stable functions such as `search_papers`, `get_work`, `resolve_open_access`, `fetch_document`, `search_evidence`, and `get_landscape` through the same core used by the UI/API. Tools should return structured bounded results and references, not entire corpora. Web/YouTube integrations should use the other agents' provider findings and preserve evidence type and transcript/content availability.

### Step 7 — Optional expansion

Add pybliometrics for entitled users, DataCite dataset discovery, ORCID/ROR repair, OpenCitations, or specialist repositories only where they improve a validated workflow. DOI metadata fallback does not require implementing the entire later dataset product.

## 8. Contract and evaluation details the developer should preserve

- A federated search cursor must be application-owned and retain each provider's paging state, query/filter identity, and deduplication progress; one raw upstream cursor is insufficient.
- Use true identifiers and explicit relationships before fuzzy title matching. A preprint and published version are not independent corroborating studies.
- Keep source evidence separate from model-generated claims. An abstract or snippet cannot support invented details from unseen methods/results.
- Log exact queries, provider/time, returned IDs, access/usage observations, parse/model versions, and redacted errors.
- Keep API/record retention and content rights provider-specific. Do not create one universal indefinite-cache rule.
- Handle 429/Retry-After, daily budget exhaustion, timeouts, partial success, wrong documents, supplements, scans, malformed XML, and interruptions.
- Use human-reviewed relevance judgments and known supporting passages. Set quantitative targets after a baseline, not by inventing accuracy percentages.

Suggested initial benchmark cases include known DOI/title matches, a DataCite DOI, multiple versions, an unavailable paper, an unrelated PDF, a supplement, abstract-only XML, a biomedical query, and a preprint-heavy technical query.

## 9. Review notes issued for the main handoff

The main document was reviewed without edits. These concrete fixes/gaps were reported to the parent agent; this file does not assert whether they were subsequently applied:

1. Make Semantic Scholar's agreement/commercial-use dependency explicit in the adapter milestone, not only in the source list.
2. Document the 1,000-result relevance-search ceiling and evaluate bulk search for larger defined sets.
3. Put DOI agency/DataCite singleton fallback in the early metadata-validation slice while leaving dataset discovery later.
4. Preserve the Unpaywall search retirement date/410 result and dated published usage limit.
5. Define a federated application cursor instead of passing one provider cursor through a combined result.
6. State that repository review covered selected files, not an exhaustive audit; pin source revisions during adoption.

The listed scholarly search/singleton routes in the reviewed handoff matched the reviewed provider documentation. The missing Semantic Scholar bulk option was an omission, not evidence that the existing relevance endpoint was invalid.

## 10. Continuation instruction

Implement the first useful slice against the actual repository and its instructions. Preserve user code and use this document as researched context rather than proof of installed integrations. Verify only the current endpoints/agreements needed for that slice, record observed behavior, and distinguish fixtures from live results. The first deliverable should demonstrate a saved, verified scholarly shortlist and a correct bibliography before automated full-paper drafting.

