# Research Scout architecture illustrations

## Phase 1 / Increment 1

![A user works through Next.js and the Python API. A Deep Agents coordinator delegates once to a discovery specialist, which calls the local application MCP. Shared Python services normalize, deduplicate, cache and retain provenance before the OpenAlex adapter reaches the remote OpenAlex MCP. A separate human review path chooses the shortlist. Local state remains behind services, and bibliography and manifest exports use saved revisions.](increment-1-architecture.png)

**Caption:** Proposed Phase 1 architecture for the OpenAlex-only discovery and shortlist slice. The two agent roles, local application MCP and remote provider MCP have separate responsibilities. Human decisions and deterministic exports use shared services. JSON snapshots are proposed; the database and model configuration remain undecided. The image depicts metadata/abstract discovery, not full-text analysis or a deployed application.

- [PNG illustration](increment-1-architecture.png): 1672 × 941 pixels.
- [Generation and correction prompts](increment-1-architecture-prompt.md).
- [Source hashes and visual review](increment-1-architecture-review.json).
- [Detailed architecture](../architecture.md) and [Increment 1 plan](../increment-1.md).

Created October 26, 2026 using the project's Illustrated Explainers skill and the built-in image-generation tool. The bundled overview image was visually inspected for its paper, ink, blue and purple style. New artwork was generated, then a targeted edit corrected the local MCP connector to pass through shared Python services before the provider adapter. The original generated draft remains in the image tool's output history.

The final PNG was visually inspected by the primary agent and Interim Research for labels, arrow meaning, scope, readability and status. No material semantic errors remained. Repeated request/result arrows are schematic; exact protocols, limits and contracts remain in the linked design documents. No application implementation, provider trial or deployment was performed to create this illustration.
