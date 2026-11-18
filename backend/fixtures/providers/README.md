# Authored provider fixtures

Fixture mode uses the authored examples in `research_scout.providers.fixtures`,
with `example.org` links, fictional names/titles and deliberately unregistered
`10.0000/scout.fixture.*` identifiers. These are not actual papers, registry
observations, provider relevance results or model outputs.

Normal questions return the small synthetic demonstration set. `empty`,
`fail-semantic` and `fail-provider` exercise controlled outcomes. The lexical
branch starts first; the semantic fixture is delayed to exercise early viewing
and saving. Both label their mode and provenance as fixtures. Fixture accounting
simulates admitted operations; it makes no network or paid model calls.

Live mode has separate journals and real adapters. OpenAlex requires an OAuth
access token in `SCOUT_OPENALEX_OAUTH_TOKEN`, checks actual MCP tool schemas and
never substitutes REST. Semantic Scholar's live semantic branch remains unavailable
unless the service is constructed with a compatible configured local encoder;
no fake embeddings or semantic inference are supplied. Registry checks use their
own public REST endpoints and never call each other.

An explicit `--encoder-factory installed_module:function` may supply that optional
local integration. It must expose `configuration` with model/revision/dimensions,
query/document modes and `similarity="cosine"`, plus `encode_query(text)` and
`encode_documents(texts)`. The service validates vector cardinality, compatible
dimensions, finite/nonzero values and unchanged configuration before computing
cosine rankings over the fetched pool. No model, package or download is selected
or initiated by default; the configured integration must enforce its own runtime
and model resource bounds.
