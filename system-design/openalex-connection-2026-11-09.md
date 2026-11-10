# OpenAlex MCP connection — live acceptance

**November 9, 2026 · America/New_York · OAuth connected and live discovery proved**

The user resumed OpenAlex integration after the earlier deferral. The existing connection command completed OAuth successfully, and the required read tools were advertised. No raw OpenAlex API key was pasted into chat or copied into `.env`.

## Authentication

MCP is the tool protocol; this particular hosted server authenticates clients with OAuth. Research Scout connects to `https://mcp.openalex.org/mcp`, opens the OpenAlex sign-in/consent flow, receives the localhost callback and stores the OAuth grant in the ignored private credential file. OpenAlex links the connection to the user's own account API key and allowance behind the server. An OpenAI key does not authenticate this connection. See [OpenAlex's official connector documentation](https://help.openalex.org/access/connector/).

Existing configuration uses `SCOUT_OPENALEX_MODE=live`, the official `SCOUT_OPENALEX_MCP_URL`, and `SCOUT_OPENALEX_OAUTH_STORE=.scout/credentials/openalex.local.json`. The manual bearer-token setting remains unnecessary for this OAuth-store path. Credentials stay outside source control; original expiry and supported refresh are handled by the existing SDK adapter. The provider reads the store on new connections, so no service restart was needed.

## Measured acceptance

| Check | Actual outcome |
| --- | --- |
| OAuth connection / tool discovery | Completed; `search_works` and `get_work` available. |
| Independent provider preflight | Keyword and native semantic branches both succeeded, two records per branch; one returned-work details request succeeded. Three admitted research-tool calls. |
| Actual exploration UI | User-style search submitted through Next.js → conversation LangGraph → existing Deep Agents child → local application MCP → independent OpenAlex service → official MCP. Run **SUCCEEDED**. |
| Year filtering | Requested 2024–2026 on both branches; all fourteen displayed observations satisfy the range. Resource-type filtering was not exercised in this live case. |
| Attribution / identity | All returned observations are live OpenAlex records, with stable provider-scoped identities and no duplicate displayed source references. |
| Saved reload | Exact saved observations and usage reopened without another research call. A validation-client URL error was recovered by reading the already completed run; discovery was not redispatched. |
| OpenAI usage | Zero OpenAI/hosted-model requests; generation remains disabled. Native semantic embedding belongs to OpenAlex. |
| Focused regressions | Eight OAuth/provider-operation tests passed. No application code was changed for this activation. |

Evidence: [independent live preflight](../docs/validation/2026-11-09-openalex-live-integration.json), [actual UI/agent/MCP proof](../docs/validation/2026-11-09-openalex-live-ui.json), and [desktop screenshot](../docs/validation/images/openalex-2026-11-09/live-discovery-desktop.png). Machine timestamps use UTC and may show November 10 while this local-date record is November 9.

This activation used five admitted MCP research-tool calls: three in preflight and two in the actual application run. OAuth, initialization and catalog/control traffic are separate; provider-internal API attempts or credit accounting are unknown unless reported by OpenAlex. These tests prove the exercised connection/search/filter/detail paths, not literature-wide recall or generated-answer quality.

## Use and reconnect

Refresh **http://127.0.0.1:3100/**, choose **Exploration chat**, leave OpenAlex selected, enter a research topic and select **Explore**. The source cards can be inspected in the existing workspace. Source responses are attributed records; hosted generation remains deferred.

If the grant is revoked or cannot refresh, reconnect explicitly:

```sh
.venv/bin/python scripts/connect_openalex.py
```

OpenAlex authorization is no longer a pending gate. Semantic Scholar keyed-search access, hosted-model selection/generation and bookmark-retention decisions remain separate work.
