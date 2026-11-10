# Research Scout — Search, Google, YouTube, and MCP Research Handoff

**Prepared:** October 26, 2026  
**Research reviewed:** October 25–26, 2026  
**Agent scope:** Public-web discovery, Google capabilities, YouTube discovery and content evidence, MCP/API integration, and review of related handoff findings.  
**Status:** Documentation research and architectural review only. No package installation, API-key creation, credentialed API call, MCP connection, deployment, or application implementation was performed by this agent.

## 1. Original context and assignments

The user is planning an incremental Research Scout application that finds research papers, obtains accessible documents, extracts knowledge, and includes public search and YouTube sources. The inspiration was a four-server MCP workflow in Claude Desktop: OpenAlex for landscape analysis, Semantic Scholar for relevance, Unpaywall for open-access locations, PubMed for biomedical discovery, and an LLM for synthesis. The quoted workflow described the servers as local, open, and free; these statements do not establish upstream access rights, unlimited quotas, or the quality of any particular implementation.

This agent received three related assignments:

1. Review official options for web knowledge and YouTube retrieval through APIs or MCP; verify Google grounding restrictions, YouTube metadata/caption capabilities, retention/provenance, and credible provider-owned MCP implementations.
2. Review two subsequently supplied links: [google/mcp](https://github.com/google/mcp) and [Scalekit's YouTube MCP versus API article](https://www.scalekit.com/blog/youtube-mcp-vs-api). Distinguish their actual capabilities from a general public-web or scholarly-search service.
3. Review the saved Research Scout development handoff for web/Google/YouTube/MCP errors and missing material findings, without editing that handoff. Concrete review corrections are preserved in section 12 below.

The initial quote did not supply the exact Semantic Scholar, Unpaywall, or PubMed community MCP repository URLs. This agent did not audit those unspecified implementations. The primary agent and other research agents covered scholarly providers and other supplied repositories separately.

## 2. Recommended architecture

Build a reusable research core with independent provider adapters. Direct API clients, libraries, and verified upstream MCP services can be alternative adapter implementations. The application UI and an optional Research Scout MCP server should call the same core services.

Suggested capability boundaries:

```text
search_papers
resolve_open_access
fetch_document
search_web
read_public_source
search_videos
get_video_details
import_transcript
retrieve_evidence
synthesize_with_citations
```

Keep three stages distinct:

1. **Discovery:** obtain candidate records, URLs, identifiers, and metadata.
2. **Acquisition and extraction:** retrieve content through supported methods, validate its identity/access, parse it, and preserve locators.
3. **Retrieval and synthesis:** retrieve supporting evidence and generate claims linked to the actual content read.

A search result, video description, generated answer, transcript, and research article are different evidence objects. Record those differences instead of flattening them into one generic text field.

For a local prototype, an application-owned STDIO MCP interface can expose a bounded read-oriented tool set. Add Streamable HTTP, user isolation, and hosted deployment when remote or multi-user operation is required. MCP is an interface, not a quota bypass, credential vault, or content-rights grant.

## 3. Google Search grounding is a separate answer feature

Gemini Grounding with Google Search can answer an end user's prompt using Google web search and return citations/search presentation information. It is useful as an optional user-facing grounded-answer capability.

It should **not** feed Research Scout's automated document acquisition or persistent source index. Google's reviewed terms explicitly prohibit collecting components of grounded results for other purposes, including automatically collecting links, building an index from links, or identifying pages to crawl or scrape.

Implementation consequences:

- Do not extract grounding citation URLs into a download queue, crawler, or general evidence catalog.
- Do not insert grounded results, search suggestions, or their links into the application corpus simply because they are returned as structured metadata.
- Keep the feature separate from source acquisition, indexing, and general raw-response storage.
- Implement required grounded-result/search-suggestion presentation together.
- Evaluate any chat-history or other retention exception against the exact documented conditions; an exception for end-user history is not permission for a reusable research corpus.

This corrects the earliest proposed Google-led workflow in the conversation, which had suggested extracting citation URLs and fetching/indexing them automatically.

Sources: [Grounding documentation](https://ai.google.dev/gemini-api/docs/google-search), [Gemini terms, including grounding restrictions](https://ai.google.dev/gemini-api/terms).

## 4. Other Google capabilities and their boundaries

| Capability | Actual role | Research Scout position |
|---|---|---|
| Gemini URL Context | Model analysis of specified accessible URLs and supported content types, including public PDFs | Optional analysis aid; does not replace original-file storage |
| Gemini File Search | Managed semantic retrieval over files imported into a File Search store | Optional later alternative to local indexing |
| Google/Vertex vector search | Similarity/hybrid retrieval over supplied embeddings | Later infrastructure when justified by measured needs |
| Knowledge Graph Search | Entity matching, descriptions, and entity-related links | Optional entity enrichment, not paper/full-text search |
| Drive API | Authorized file downloads and Workspace exports | Later user-document ingestion |
| Developer Knowledge MCP | Search and retrieval from Google's developer documentation corpus | Development aid or explicitly scoped technical source |
| Custom Search JSON API | Legacy web/image search service | Avoid as a new dependency |

Important details:

- URL Context does not support YouTube videos, Google Workspace documents, audio/video files, or paywalled content. Route those sources through the appropriate integration instead.
- A Files API upload followed by a model call is not a persistent File Search library. Create a File Search store and import/index the file.
- Raw Files API uploads expire after 48 hours; imported File Search content persists until deletion. Keep original documents in application-controlled storage.
- Embedding generation and vector indexing are distinct operations. A vector index does not expose Google's public-web index.
- Google advises new enterprise Knowledge Graph use toward its newer enterprise product and warns against a production-critical dependence on the legacy Knowledge Graph API.
- Custom Search JSON API is closed to new customers; existing customers must transition by January 1, 2027.

Sources: [URL Context](https://ai.google.dev/gemini-api/docs/url-context), [File Search](https://ai.google.dev/gemini-api/docs/file-search), [vector search](https://docs.cloud.google.com/vertex-ai/docs/vector-search/overview), [Knowledge Graph](https://developers.google.com/knowledge-graph), [Drive download/export](https://developers.google.com/workspace/drive/api/guides/manage-downloads), [Custom Search notice](https://developers.google.com/custom-search/v1/overview).

## 5. What the google/mcp repository does and does not provide

[google/mcp](https://github.com/google/mcp) is a catalog of Google MCP services, deployment guidance, and examples. It distinguishes managed remote services from open-source implementations that may run locally. It is not one installable server exposing every Google product.

The reviewed official supported-products catalog, updated October 22, 2026, included Google Cloud products, Developer Knowledge, and Google Workspace servers. It did not list a YouTube MCP service or a general Google public-web search endpoint. The matches for YouTube in that catalog were footer links, not a YouTube MCP product.

Workspace Universal Search refers to Workspace content; it is not Google's public search index. Reviewed Workspace remote services, including Drive, Docs, and Universal Search, were marked Developer Preview. Verify current availability and authorization before selecting them for later ingestion.

The repository itself includes a demonstration-project support disclaimer. That should not be generalized to every linked managed service; assess each service through its own official documentation.

### Developer Knowledge MCP

Endpoint:

```text
https://developerknowledge.googleapis.com/mcp
```

Reviewed tools:

- `search_documents`: relevant excerpts from Google developer documentation.
- `get_documents`: full Markdown for matching documentation resources.
- `answer_query`: a structured answer from that documentation corpus.

The service supports API-key and Google credential configurations. It does not search arbitrary scholarly papers, private repositories, or third-party sites. Use it to help implement Research Scout accurately, or enable it as a source only for research explicitly about supported Google technical documentation.

### Deployment implications

Google documents hosting custom MCP servers on Cloud Run with Streamable HTTP. Local STDIO servers cannot simply be deployed unchanged as Cloud Run HTTP services. The hosting guide describes IAM/OIDC/IAP options and local/remote combinations of MCP clients and servers.

Sources: [Google MCP repository](https://github.com/google/mcp), [supported products](https://docs.cloud.google.com/mcp/supported-products), [Developer Knowledge MCP](https://developers.google.com/knowledge/mcp), [Cloud Run MCP hosting](https://docs.cloud.google.com/run/docs/host-mcp-servers).

## 6. Web discovery provider choices

Use one structured search provider whose usage, storage, and attribution terms fit the selected workflow. Fetch destination content through permitted methods and validate it separately. Search access alone does not establish reuse rights in the destination article.

### Brave

Brave maintains a provider-owned MCP server:

```text
https://github.com/brave/brave-search-mcp-server
```

Its documented capabilities include web and video search, with STDIO and HTTP transports. A direct API adapter can also use the web-search service:

```text
https://api.search.brave.com/res/v1/web/search
```

Brave's reviewed API information says storage rights require an appropriate plan. Do not promise that a local open-source wrapper creates an unlimited-free permanent corpus. Evaluate provider cost and storage rights before enabling persistence.

### Third-party Google result providers

SerpApi and SearchAPI are third-party services rather than official Google endpoints. They can be evaluated for cross-platform video discovery if YouTube coverage proves insufficient. Relevant request routes are:

```text
https://serpapi.com/search.json
https://www.searchapi.io/api/v1/search
```

Use the documented engine/query parameters rather than requesting their website homepages and trying to parse JSON. Their returned duration/key-moment fields are source-dependent; do not assume every result supplies them. Avoid adding two overlapping providers before measuring coverage.

Sources: [Brave API](https://brave.com/search/api/), [Brave API reference](https://api-dashboard.search.brave.com/api-reference/web/search/post), [Brave MCP repository](https://github.com/brave/brave-search-mcp-server), [SerpApi Google Videos](https://serpapi.com/google-videos-api), [SearchAPI Google Videos](https://www.searchapi.io/docs/google-videos).

## 7. YouTube discovery and metadata

Use the official YouTube Data API for the first video milestone.

```text
GET https://www.googleapis.com/youtube/v3/search
GET https://www.googleapis.com/youtube/v3/videos
```

Search with `part=snippet`, `type=video`, topic terms, and relevant date/channel filters. Enrich selected video IDs with `videos.list`, requesting only required parts such as `snippet`, `contentDetails`, and `status`. The result can support selectable cards with title, channel, publication time, duration, description, thumbnail reference, and original watch link.

An API key is sufficient for supported unauthenticated reads of public data. Per-user OAuth can wait until the product accesses private/account data or acts on a user's channel. YouTube does not support a general service-account substitute for a YouTube user identity.

Keep creator operations out of the research MVP: uploads, comment replies/moderation, analytics, playlist mutations, and channel management add little value to initial literature discovery.

Sources: [search.list](https://developers.google.com/youtube/data/reference/rest/v3/search/list), [videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list), [API overview](https://developers.google.com/youtube/data/getting-started), [API errors/service accounts](https://developers.google.com/youtube/data/reference/rest/v3/errors).

## 8. YouTube transcripts and content evidence

Search metadata does not establish access to spoken content. Use explicit content states:

```text
metadata_only
transcript_imported
authorized_captions
video_analyzed
```

The official `captions.download` method requires the caller to have permission to edit the video. A caption-track listing does not contain arbitrary public transcript text. Therefore a community server that advertises transcripts needs an implementation/source/access review; do not infer its behavior from the YouTube Data API alone.

For the first evidence milestone, accept user-provided or otherwise authorized transcript files. Preserve language, source, timestamps, and whether text was generated or corrected. A generated video summary must not be labeled a verbatim transcript.

Gemini supports direct public YouTube URL analysis as a separately evaluated preview feature. Reviewed documentation excluded private and unlisted videos and warned that pricing and rate limits can change. Treat its summaries and timestamp references as model outputs requiring evaluation, rather than assuming an authoritative transcript export.

For a research answer, distinguish a lecture/tutorial from the study it discusses. Preserve both identities if the video refers to a paper. Do not allow video popularity or retrieval rank to substitute for evidentiary quality.

Sources: [caption download](https://developers.google.com/youtube/data/reference/rest/v3/captions/download), [Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding).

## 9. YouTube quotas and retention

### Reviewed default quota baseline

The October 2026 official documentation described:

- A separate default bucket of 100 `search.list` calls per day.
- A separate default bucket of 100 `videos.insert` calls per day.
- 10,000 units per day for the remaining methods.
- A cost of 1 per search call in its own bucket, and 1 unit for `videos.list`.
- Additional search pages consume additional calls.
- Daily quotas reset at midnight Pacific Time.

Older advice describing search as 100 units per call should not be hard-coded into this implementation. Quotas belong to the Google Cloud project and are shared across the product's users. An MCP wrapper or managed connector does not create additional Google quota. Read the project's actual quota settings and handle daily exhaustion separately from transient rate limiting.

### Storage requirements

Limited non-authorized YouTube API data must generally be refreshed or deleted within 30 calendar days. Do not treat titles, descriptions, or statistics retrieved without account-owner authorization as immutable permanent snapshots. Other authorized-data classes have their own conditions; apply the specific policy to the specific data.

Implement `refresh_after`, deletion handling, and dependency invalidation. If required source data is removed or expires, reevaluate the dependent index entries and claims. Do not assume every model-derived representation can be retained indefinitely merely because it differs from the raw response.

Sources: [quota calculator](https://developers.google.com/youtube/data/determine_quota_cost), [developer policies](https://developers.google.com/youtube/terms/developer-policies).

## 10. Scalekit article: verified findings and qualifications

The supplied [YouTube MCP versus API article](https://www.scalekit.com/blog/youtube-mcp-vs-api) compares direct API integration with Scalekit's own YouTube connector exposed through Virtual MCP. Its “MCP path” should not be read as a description of every MCP architecture.

The connector's own documentation confirmed 45 tools, including public search, video details, and caption-track listing. Its setup uses the developer's Google OAuth application, with Scalekit managing connected-account tokens. Caption text download was not listed as a prebuilt tool in the reviewed documentation.

Qualifications relevant to Research Scout:

- A local/community MCP server being unsuitable for multiple users is an implementation issue, not a protocol limitation. A self-hosted service can support multiple users with correct authorization and credential/data isolation.
- MCP does not itself issue downstream Google grants, provide an encrypted vault, refresh tokens, or implement revocation handling.
- Public research discovery does not require each user to connect a YouTube account when the supported public-data API methods can use an API key.
- A managed connector does not remove Google's quota or caption-access restrictions.
- Creator/account operations are a different product scope from public research discovery.

Scalekit can be evaluated later if private channel data or account actions become a requirement. It is not necessary for the initial public discovery workflow.

Source: [Scalekit YouTube connector documentation](https://docs.scalekit.com/agentkit/connectors/youtube/). Use Google's official documentation for upstream access and quota behavior.

## 11. Incremental integration order and validation

1. **Paper core first.** Stabilize scholarly discovery, identifiers, a source catalog, open-access resolution, and document evidence through the broader project plan.
2. **One web discovery adapter.** Select a provider based on relevance, cost, storage rights, and attribution. Add controlled destination reading with timeouts, size limits, redirect validation, and original-source provenance.
3. **YouTube discovery/details.** API-key-backed search, bounded pagination, selected-ID enrichment, video cards, and clear `metadata_only` status.
4. **Transcript-backed knowledge.** Authorized/imported transcripts, timestamps, passage retrieval, and citation links to the video position.
5. **MCP exposure.** Reuse working core functions through a small read-oriented MCP surface. Choose STDIO locally and Streamable HTTP when needed remotely.
6. **Optional video analysis.** Evaluate the public YouTube URL model feature for supported questions, cost, timestamp accuracy, and failure behavior.
7. **Later account/document integrations.** Add Workspace ingestion, per-user YouTube OAuth, managed token tooling, or hosted multi-user operation only for concrete use cases.

Suggested acceptance checks:

- A metadata-only video asked about spoken claims produces an access limitation, not invented content.
- Caption listing is never displayed as transcript text.
- Imported transcript evidence has inspectable timestamp/source provenance.
- Search pagination obeys per-run and per-project budgets.
- Quota exhaustion, provider timeout, and unsupported content yield understandable partial results.
- Expired/refreshed/deleted API data causes appropriate cache and dependent-evidence handling.
- Google-grounding results and links cannot enter the acquisition queue or persistent research index.
- App API and MCP calls use the same normalization, access checks, and limits.
- Source text is treated as evidence rather than tool instructions.

Suggested provenance fields:

```text
provider
provider_record_id
canonical_url
actual_retrieval_url
retrieved_at
refresh_after / retention_deadline
authorization_or_access_basis
content_access_status
content_origin
license_or_terms_reference
asset_id and checksum, where applicable
page/section/table or start/end timestamp locator
extraction_method and version
model_provider / model_version for generated transformations
supporting_passage_ids
```

## 12. Concrete review notes for the main handoff

The agent reviewed `research-scout-development-handoff.md` without editing it and returned these fixes. They are preserved here so a later developer can verify that the main document incorporates them:

1. Complete the quota baseline with both the search and upload daily buckets, so “other methods” does not inadvertently include uploads.
2. State YouTube's general 30-calendar-day refresh/delete interval for limited non-authorized API data rather than only saying that retention rules exist.
3. State that Gemini's YouTube URL analysis supports public videos and excludes private/unlisted videos.
4. Document URL Context exclusions for YouTube, Workspace, audio/video, and paywalled content.
5. Preserve the distinction between temporary Files API uploads and persistent imported File Search content, with originals retained in application-controlled storage.

The reviewed handoff already correctly separated Google grounding from harvesting/ingestion. No additional grounding architecture correction was identified.

## 13. Research limits and continuation guidance

These findings come from publicly available official/provider documentation and the supplied links. They are not runtime-tested guarantees. In particular:

- No credentialed search, quota, caption, video-analysis, or storage-rights test was run.
- No MCP implementation was installed or executed.
- The Google MCP catalog and article review establish documented capabilities, not an exhaustive audit of every community server.
- Quotas, preview status, model support, pricing, and terms are dated observations. Recheck only the capabilities being implemented at each increment.
- Provider metadata/content rights, wrapper source-code licenses, and model-output retention are separate issues.
- The approach is a recommendation for an incremental build, not a claim that the application exists.

When continuing in Codex, implement the smallest independently useful slice, record exact dependency versions, retain provider schema/documentation review dates, and distinguish fixture-based checks from live observations. Keep the app useful for source discovery and bibliography work even when generation or optional providers are disabled.

## 14. Primary and supplied source register

### Google and MCP

- [Google MCP repository](https://github.com/google/mcp)
- [Google managed MCP supported products](https://docs.cloud.google.com/mcp/supported-products)
- [Google Developer Knowledge MCP](https://developers.google.com/knowledge/mcp)
- [Host MCP servers on Cloud Run](https://docs.cloud.google.com/run/docs/host-mcp-servers)
- [MCP local-server connection guidance](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
- [Gemini Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search)
- [Gemini additional terms](https://ai.google.dev/gemini-api/terms)
- [Gemini URL Context](https://ai.google.dev/gemini-api/docs/url-context)
- [Gemini File Search](https://ai.google.dev/gemini-api/docs/file-search)
- [Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Google vector search](https://docs.cloud.google.com/vertex-ai/docs/vector-search/overview)
- [Google Knowledge Graph](https://developers.google.com/knowledge-graph)
- [Custom Search JSON API status](https://developers.google.com/custom-search/v1/overview)
- [Google Drive download/export](https://developers.google.com/workspace/drive/api/guides/manage-downloads)

### YouTube

- [YouTube Data API overview](https://developers.google.com/youtube/data/getting-started)
- [YouTube search.list](https://developers.google.com/youtube/data/reference/rest/v3/search/list)
- [YouTube videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list)
- [YouTube captions.download](https://developers.google.com/youtube/data/reference/rest/v3/captions/download)
- [YouTube quota calculator](https://developers.google.com/youtube/data/determine_quota_cost)
- [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies)
- [YouTube API errors](https://developers.google.com/youtube/data/reference/rest/v3/errors)
- [YouTube OAuth guidance](https://developers.google.com/youtube/data/guides/authentication)

### Search and managed connectors

- [Brave Search API](https://brave.com/search/api/)
- [Brave API reference](https://api-dashboard.search.brave.com/api-reference/web/search/post)
- [Brave's MCP server](https://github.com/brave/brave-search-mcp-server)
- [SerpApi Google Videos](https://serpapi.com/google-videos-api)
- [SearchAPI Google Videos](https://www.searchapi.io/docs/google-videos)
- [Supplied Scalekit article](https://www.scalekit.com/blog/youtube-mcp-vs-api)
- [Scalekit YouTube connector documentation](https://docs.scalekit.com/agentkit/connectors/youtube/)
