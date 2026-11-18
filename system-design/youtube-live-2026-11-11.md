# YouTube live connection acceptance

**November 11, 2026 · implemented and live validated.** The user added `SCOUT_YOUTUBE_API_KEY` to the ignored root `.env` and requested that the app load it. The owned launcher was restarted after confirming there were no active conversations. All nine provider services and the Next.js frontend are left running at **http://127.0.0.1:3100/**. No application code or model-budget limits changed.

One bounded live search for **retrieval augmented generation tutorial**, with automatic routing and `resource_type=video`, passed through the existing conversation graph, Deep Agents/application MCP and isolated YouTube provider. The resource filter limited this acceptance check to YouTube. Normal unfiltered questions retain the existing multi-source route; this check does not change that policy.

The search succeeded with **10 live video records**, **one provider attempt**, **zero model requests** and no warnings. The main Search workspace displayed the records under Videos, including titles, channels, source links and available descriptions. These are public search metadata/descriptions, not transcripts or acquired video content.

Desktop (1440 px) and mobile (390 px) inspection found no horizontal overflow or browser errors. Reading the saved description, switching to Videos and reloading preserved usage and made no new search POST requests. The shared model-cost/hold total was unchanged; AI refinement and optional answer generation remain separately blocked by the existing ledger. Web search remains deferred by user direction.

[Open the saved live videos](http://127.0.0.1:3100/?search=8f8fdd99629a4dc89370f8417a3bf5db). [Acceptance receipt](../docs/validation/2026-11-11-youtube-live.json), [desktop screenshot](../docs/validation/2026-11-11-youtube-live-1440.png), [mobile screenshot](../docs/validation/2026-11-11-youtube-live-390.png).

This supersedes the missing-YouTube-key gate in earlier November 10 and November 11 checkpoints. Existing receipts preserve their measured state at the time. The API key stays in the ignored local `.env`; no credential is included in the acceptance receipt.
