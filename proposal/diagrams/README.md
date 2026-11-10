# Original architecture and investigation illustrations

These illustrations were created for the GitHub Manager agent-design proposal on 23 October 2026. They were copied byte-for-byte on 25 October 2026 to preserve the established visual style and the ideas behind Research Scout.

| Illustration | View | Editable source | Concepts |
| --- | --- | --- | --- |
| An agent with boundaries | [PNG](01-agent-architecture.png) | [SVG](01-agent-architecture.svg) | Goal, agent control loop, tool gateway, existing GitHub MCP/new application MCP, persisted state and human authority |
| An investigation loop that knows when to ask | [PNG](02-task-lifecycle.png) | [SVG](02-task-lifecycle.svg) | Observe, choose, call bounded tools, recover or pause, human review and deterministic save |

The images retain their original GitHub Manager names and proposed component labels. They are historical explanatory diagrams, not a running Research Scout deployment or finalized standalone architecture. See [standalone scope](../scope-and-next-steps.md) and the [original architecture](../design/architecture.md).

[Original render audit](original-render-audit.json) preserves the earlier artifact checks. It is evidence about those original diagrams, not a new application or comprehension test. Rendering scripts, image-generation tools and dependencies were not copied or executed.

The [copy manifest](../COPY-MANIFEST.json) records source and destination hashes. New diagrams can be adapted after the standalone proposal is reviewed.
