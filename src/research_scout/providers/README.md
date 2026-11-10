# Provider operation

Each process owns one scholarly upstream, its credentials, request pacing, journal and cache. Internal Scout service URLs are separate from the official HTTPS upstream variables. `upstream.py` rejects credential-bearing URLs, foreign origins and unsupported endpoint paths before any request headers are constructed.

Discovery is implemented for OpenAlex, Semantic Scholar, Crossref, arXiv, OpenAIRE Graph V3 and Europe PMC. DataCite retains exact DOI metadata, and Unpaywall owns only DOI open-access lookup at `/operations/access`; it never supplies a research abstract or discovery record. Crossref retains its agency/metadata operations alongside discovery and details.

New REST/Atom discovery collects one bounded page of at most twenty records, emits normalized records through the existing NDJSON stream, and reranks that same pool locally. No cursor/page is automatically followed. Native semantic discovery remains specific to OpenAlex. Year constraints are pushed to documented provider date fields where available and rechecked against normalized metadata; unsupported resource-type mappings remain explicit local filters. arXiv's first-submission year comes from Atom `published`, with version-specific `updated` kept separately. Its ordinary-text query uses a versioned literal-term/stopword policy and records the exact executed expression.

OpenAIRE descriptions stay in `description`/`descriptions` and are not relabeled author abstracts. Europe PMC uses `resultType=core` and preserves source-qualified IDs and supplied structured abstracts. Crossref preserves deposited abstracts when supplied, with block/JATS separators retained in plain text. Unknown Europe PMC publication types do not silently pass article filters.

Live lexical pools use a fifteen-minute cache for new operations, or twenty-four hours for arXiv's daily update/cache guidance. Cache provenance includes the original observation time; changed queries/filters/limits have distinct keys. Immutable saved operation replay remains zero-call independently of cache TTL. Provider restart retains the cache and durable rate budgets. OpenAIRE enforces 60 anonymous or 7,200 authenticated requests per UTC hour; Unpaywall enforces 100,000 requests per UTC day, in addition to tighter run grants. arXiv serializes the full request and spaces starts by three seconds.

Unpaywall needs a real `SCOUT_UNPAYWALL_EMAIL`; missing/placeholder contact returns an actionable zero-attempt access gate. The email and optional OpenAIRE token are not persisted in result provenance or error text. Unpaywall locations are separate access observations, with safe links, a twenty-location limit and explicit omitted counts. A new operation may reuse an access observation for twenty-four hours, with its cache timestamp/TTL disclosed; an older pool requires a newly admitted lookup. Saved operation replay remains immutable and zero-call after that TTL. No file content is downloaded.

The live public registry routes require no API key. Crossref uses `SCOUT_CONTACT_EMAIL` for polite client identification when supplied. Semantic Scholar accepts its own `SCOUT_SEMANTIC_SCHOLAR_API_KEY`, shares one-per-second admission across search/details, and stops during an observed 429 cooldown. Requests are not automatically retried.

## OpenAlex authorization

From the repository root:

```sh
.venv/bin/python scripts/connect_openalex.py
```

This explicit command uses the installed MCP SDK's authorization-server discovery, dynamic client handling and PKCE callback at localhost port 8489. `--no-browser` prints the authorization URL for manual opening. It lists the read tools after authorization but does not search. No account is created automatically.

Credentials and discovered OAuth metadata are stored atomically with mode 0600 at `SCOUT_OPENALEX_OAUTH_STORE` (default `.scout/credentials/openalex.local.json`). Original token expiry is preserved across process restarts; refresh uses the discovered token endpoint, rather than assuming a token URL. Provider sessions do not start an interactive sign-in and instead return a reconnect gate when needed. The existing manual `SCOUT_OPENALEX_OAUTH_TOKEN` takes precedence for noninteractive requests and is not refreshable.

## Explicit preflight

```sh
.venv/bin/python scripts/provider_preflight.py --provider crossref
.venv/bin/python scripts/provider_preflight.py --provider crossref --live --output docs/validation/crossref-proof.json
```

Without `--live`, preflight performs only local configuration/health inspection. With `--live`, it exercises the provider's real FastAPI ASGI contract against actual upstreams in an isolated journal namespace: two Crossref requests, one DataCite request, or a two-branch discovery request and at most one detail request. There is no provider fallback or retry. Reports contain status, record identities, branch outcomes and attempt counts, not source passages, credentials or raw exception text. This adapter proof is not a substitute for the actual process/MCP/browser journey.

## Local Semantic Scholar reranking

The service CLI and preflight use the same `SCOUT_LOCAL_ENCODER_FACTORY=module:function` loader for REST candidate pools. Legacy `SCOUT_SEMANTIC_SCHOLAR_ENCODER_*` settings remain fallbacks. `SCOUT_LOCAL_ENCODER_CACHE` reuses the installed pinned ONNX model without sharing any provider credential. A missing dependency/model/factory leaves lexical operation available and exposes an explicit encoder status; no fake semantic result is supplied. The built-in optional sentence-transformer factory is `research_scout.providers.encoders:sentence_transformer`, restricted to symmetric `sentence-transformers/all-MiniLM-L6-v2`, an exact commit revision and an already cached local model. It never downloads at startup or invokes a hosted model. A separately configured local encoder may implement the same contract.

The contract is `configuration`, `encode_query(text)`, and `encode_documents(texts)`. Configuration includes model/revision/dimensions/query and document modes/cosine similarity. Vectors must have finite matching dimensions and nonzero norms. Optional `input_scope` diagnostics disclose model-window truncation in the semantic provenance. Reranking covers only the fetched pool of at most twenty records, not independent semantic discovery across the corpus.

The current local setup uses `research_scout.providers.onnx_encoder:minilm_onnx`. Install `requirements-encoder.lock` in the repo `.venv`, then explicitly run `scripts/setup_local_encoder.py` to cache two publisher-verified artifacts from a fixed MiniLM revision. It uses CPU ONNX inference, compatible 384-dimensional vectors and explicit 256-token truncation diagnostics, without PyTorch, hosted embedding calls or startup downloads. See the [execution record](../../../system-design/integration-execution-2026-11-09.md#local-encoder).

## Readiness

`/health` makes no upstream request. Liveness, access configuration, supported capability, encoder status and observed proof are separate fields. `verified_capabilities` and `last_verified_at` are populated only after successful observed operations in this process and reset to unverified after restart. A successful detail call does not prove keyword/semantic search; the capability list must be reviewed, not only the aggregate readiness label.
