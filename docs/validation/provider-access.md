# Public provider capability checks

**October 26, 2026 · 3:53 a.m. America/New_York · bounded live metadata probes**

The implemented live provider services were exercised through their FastAPI
applications with `httpx.ASGITransport`. The adapters then made **four anonymous
upstream HTTP attempts**, one per operation, with zero retries, paid/model calls
or interactive authentication. This was an approved Increment 1 validation task.
Fixture test calls and local health checks are separate from that count.

| Provider operation | Public identifier | Actual upstream attempts | Observed outcome |
| --- | --- | ---: | --- |
| Crossref registration agency | `10.1038/nphys1170` | 1 | HTTP 200; agency `crossref`. |
| Crossref metadata | `10.1038/nphys1170` | 1 | HTTP 200; normalized provider observation with DOI, title, author and year fields. |
| DataCite singleton metadata | `10.14454/qdd3-ps68` | 1 | HTTP 200; normalized provider observation; actual resource type retained as `Text`. |
| Semantic Scholar DOI details | `DOI:10.1038/nphys1170` | 1 | HTTP 429; explicit `UPSTREAM_RATE_LIMIT`, with no retry or alternate provider. |
| OpenAlex official MCP | Not attempted | 0 | OAuth configuration and actual tool-schema proof remain pending; no REST substitution. |

The Crossref and DataCite records remain separate. Their successful retrieval
proves these specific adapter operations and normalization paths for the sample
identifiers. It does not prove search quality, scientific validity, full-text
access or general coverage. No abstracts or full papers were fetched as a separate
content-acquisition operation; the report retains only a small metadata/status
summary and no source passages.

Semantic Scholar anonymous access was rate-limited in this environment. A later
explicitly configured access check is still needed; this result is not proof that
the API is unavailable generally. Its semantic discovery path also remains gated
on a proved native capability or a configured compatible local query/document
encoder. No encoder/model was installed or downloaded for these probes.

Python was **3.13.0**. Installed integration versions were FastAPI **0.162.0**,
HTTPX **0.28.1**, MCP SDK **1.30.0** and Pydantic **2.14.1**. The exact sanitized
observations, timestamps, identities and counts are in
[provider-access.json](provider-access.json). No credentials, authorization
headers, raw response bodies or private account files are included. The probe
process explicitly removed provider credential variables from its environment.

Separately, the four fixture provider CLI processes started independently on
local ports 8841–8844, returned their own provider/mode health states and were
stopped. Focused provider tests cover authored fixtures and fake HTTP/MCP
upstreams; those are operational regression evidence, not live provider results.

**Increment 1 is not fully live-validated.** OpenAlex OAuth/native hybrid search,
the live model-driven handoff, compatible optional encoder and broader relevance
evaluation retain their own acceptance gates. The later local fixture browser
journey is recorded separately in the [overall validation report](increment-1.md).

Primary interface references: [OpenAlex connector](https://help.openalex.org/access/connector/),
[Crossref REST/agency routes](https://www.crossref.org/documentation/retrieve-metadata/rest-api/),
[DataCite singleton](https://support.datacite.org/docs/api-get-doi),
[Semantic Scholar API](https://api.semanticscholar.org/api-docs/).
