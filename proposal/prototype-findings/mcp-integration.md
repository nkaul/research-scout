# Implemented Research Scout MCP boundary

> **Historical source material — copied 25 October 2026.** This document originated in the GitHub Manager Research Scout work of 23 October 2026. Implementation statements, paths, commands, localhost addresses, test counts and budgets describe that original prototype or proposal, not an implementation in this repository. No code, credentials, data stores or spending authorization are transferred. See the [standalone project scope](../README.md) before using this material.


**Implementation record · 23 October 2026.** The local SDK protocol and optional
remote adapter have offline tests. No live GitHub MCP credential probe, new OAuth
grant or paid model request was needed for those tests. The broader
[MCP research proposal](../research/mcp-integration.md) remains a record of design
options; it is not a claim that every proposed endpoint/tool is implemented.

## Two distinct connections

Research Scout uses the official Python MCP SDK `mcp==2.3.0` for a task-local
application server. The host builds this server from four trusted service
closures and connects an official `Client` to it. LangChain `StructuredTool`
objects call that client, so the model-visible tools pass through actual
`tools/list` and `tools/call` protocol operations rather than directly invoking
the Python closures.

The optional `GitHubRemoteMCP` adapter connects separately to GitHub's official
remote endpoint. Local MCP does not imply that GitHub acquisition used MCP. With
the default `RESEARCH_GITHUB_TRANSPORT=rest`, source acquisition uses the existing
OAuth App REST adapter. Selecting `mcp` explicitly uses the remote adapter for
discovery; existing REST checks still verify repository identity/current public
visibility and acquire bounded evidence. An MCP error stops that capability; it
does not switch transports or credentials silently.

## Local task server

`create_research_mcp_server(handlers)` uses the official SDK's low-level `Server`
with an explicit tool manifest, input schemas and result envelope.
`research_mcp_tools(handlers)` is an async context manager yielding the four
LangChain tools:

| Tool | Model input | Effect |
| --- | --- | --- |
| `search_repositories` | Bounded query text | Host-controlled public repository discovery |
| `inspect_repository` | Canonical `owner/repository` name | Read only a task-discovered candidate through the evidence gateway |
| `discover_public_data` | No arguments | Offline links for the task's explicitly selected providers |
| `draft_research` | Bounded findings/implementation with `text` and `source_refs`, plus unknowns | Stage a proposal for the user's review |

The manifest has no save, accept, apply, shell, filesystem, arbitrary HTTP, SQL,
provider-configuration or GitHub-write tool. `draft_research` is declared as a
local draft write, not a read. It cannot approve itself or save the human's
repository selection.

Inputs reject unknown fields and retain the application claim/reference
contracts. Owner ID, task ID, token selection, current session checks and counters
are bound in trusted host closures; they are absent from model arguments. The
host's existing authorization, candidate provenance, budgets and citation checks
remain authoritative. Supplying a handler is not a general authorization grant:
each closure must enforce those checks on every action.

The client uses `mode="legacy"` deliberately for the local connection. In SDK
v2, automatic in-process connections use a direct typed dispatcher. Legacy mode
instead exercises the official SDK's in-memory JSON-RPC streams and
initialization handshake, making the protocol boundary verifiable without a
socket, subprocess or new HTTP route. This does not claim that a modern HTTP
deployment has been validated. The official SDK documents in-process servers,
client lifecycle and protocol-mode behavior in its
[client documentation](https://py.sdk.modelcontextprotocol.io/client/).

Each task receives a separate server, client and tool set, closed together when
the context exits. Response caching is disabled. Handler results are copied into
a JSON envelope and limited to 96,000 UTF-8 bytes before being returned to the
agent. Unknown tools, invalid arguments, oversized/non-JSON results and handler
failures return safe errors; raw exception text cannot expose credentials or
source content. Cancellation is not converted into a successful tool response.

There is no public app MCP listener, external-client OAuth authorization server,
mounted MCP ASGI endpoint or capability-token issuer in this slice. Those remain
separate deployment/integration work. Browser session/Origin/CSRF protections and
the human save route remain application concerns outside this in-memory link.

## Optional official GitHub remote adapter

`GitHubRemoteMCP(token_getter, expected_user_id, ...)` is opened explicitly as an
async context manager. It uses the SDK `Client` and Streamable HTTP transport,
with `httpx2` required by SDK v2. The endpoint is fixed to
`https://api.githubcopilot.com/mcp/`; callers cannot supply a different host. Its
headers request `X-MCP-Readonly: true` and exactly `get_me`,
`search_repositories`, `get_file_contents`. Discovered write/unknown tools are
discarded, and the local dispatcher rejects calls outside that allowlist. The
official [server configuration guide](https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md)
documents these headers and their limits. Read-only filtering does not narrow the
underlying OAuth grant itself.

The token getter supplies the existing authenticated OAuth App token in memory.
The adapter checks it before calls, verifies `get_me` against the trusted numeric
GitHub account ID, and refuses a changed or ended sign-in. It does not obtain a
new grant, persist a token, open a login browser, refresh tokens, read environment
credentials, or substitute a PAT/GitHub App credential. The official
[host guide](https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md)
describes OAuth App support and registered-client requirements. Actual access
for this application's grant and organization policies still requires a live
compatibility check.

`search_repositories(query)` takes plain query words, forces public-search
qualifiers, requests five results on the first page and disables minimal output.
The constructor's optional trusted `language` setting accepts a single validated
language name and adds the corresponding qualifier after query sanitization.
Model-supplied operators cannot set that field. The method returns an application
envelope with observed rows, incomplete-result status and total count where
available. Numeric-string IDs are normalized; a missing visibility field remains
missing. It cannot become `private: false` merely because the query requested
public results. The application must validate current public metadata before
retaining/exposing evidence. Modern GitHub MCP responses use curated DTOs rather
than complete REST objects, so the adapter accepts structured output or legacy
JSON text without assuming identical field coverage. These distinctions are
documented in the official [tool/source definitions](https://github.com/github/github-mcp-server/blob/main/pkg/github/search.go).

The optional `fetch_readme(full_name, path=..., ref=...)` method requires an exact
host-approved public read in the constructor's `allowed_reads` mapping and an
immutable commit SHA. No traversal, arbitrary path or unpinned branch read is
admitted. This method returns bounded typed content blocks as untrusted data; it
never fetches returned resource URLs. The application's evidence gateway must
still check source identity/version/content and privacy before model context.
The active discovery path does not require this reader: REST evidence acquisition
remains separate.

Each connection has a bounded call count (including identity verification),
timeouts and disabled response caching. Current search orchestration opens a
connection per search, so identity/discovery adds overhead; it is not a persistent
pooled deployment. Source acquisition limits must account for that separately
from model attempts. The SSE event buffer and decoded result are bounded; this
does not claim a transport-wide pre-decode bound on every upstream JSON body.

Authentication, tool absence, incompatible result shapes, account mismatch,
rate/permission denial, timeout and other remote failures produce safe actionable
connection errors. They stop remote work and recommend checking sign-in,
registered-client/scope compatibility and organization policy. The adapter does
not inspect arbitrary OAuth metadata URLs, retry with broader credentials or
automatically fall back to REST.

## What was tested

The eight MCP tests in `backend/tests/research/test_mcp.py` cover:

- Real official SDK initialization, tool listing and tool execution over local
  in-memory JSON-RPC, including strict unknown-field/unknown-tool rejection.
- LangChain tool calls through that client, nested citation contracts, separate
  simultaneous task closures, safe handler errors and oversized output rejection.
- Remote identity/read-scope/credential checks, fixed endpoint/read-only headers,
  result normalization, explicit call limits and safe compatibility failures.
- The real SDK Streamable HTTP client against a mocked legacy endpoint, including
  protocol negotiation, initialization, tool listing, `get_me` and search calls.

All tests are offline. The HTTP fixture proves the selected client/transport API
works with its modeled protocol; it is not evidence of a live GitHub login or
current remote deployment behavior. A live compatibility result must be recorded
separately with observed tool/schema coverage, account identity and failure mode,
without recording tokens or raw private data.
