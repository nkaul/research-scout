# Phase 1 architecture illustration prompts

October 26, 2026. Generated with the built-in image tool using the project's Illustrated Explainers skill. The local `style-overview.png` was visually inspected to inform the new image's style; original project labels were not reused.

## Initial generation

Use case: infographic-diagram.
Create ONE publication-quality illustrative architecture diagram for a software research project. It is a NEW illustration, not a UI screenshot. Wide landscape 16:9 canvas, generous margins, readable large text and abundant whitespace.

STYLE: friendly technical sketchbook on clean white paper; slightly irregular navy ink outlines; expressive simple human and small robot drawings; indigo and blue handwritten headings; restrained purple emphasis; soft light-blue and lavender marker washes. Match the visual language of a careful paper-and-marker technical explainer. Use meaningful objects (browser, task notebook, two robots, plug/tool gateway, filter/magnifier, paper records, versioned file folders, human review clipboard), rather than a grid of generic service boxes. No brand logos, black background, photorealism, 3D gloss or dense decorative text.

TITLE, exact: "Research Scout"
SUBTITLE, exact: "Phase 1 Architecture"
Visible status stamp, exact: "PROPOSED • Increment 1"

CORE EXPLANATION: A person asks a scholarly question in a Next.js app. A Python backend coordinates one Deep Agents supervisor and one discovery specialist. The specialist calls the LOCAL APPLICATION MCP. Shared Python services enforce scope/limits, normalize/deduplicate/cache and retain provenance. An OpenAlex adapter reaches the REMOTE PROVIDER MCP. Returned candidates are reviewed by the human, who alone selects papers and requests exports. Records and revisions are local; the database is not chosen.

COMPOSITION: clean left-to-right orientation with a large central softly outlined boundary "Python backend". A human at a laptop/browser sits to the LEFT of that boundary. A remote OpenAlex service, visibly OUTSIDE the Python boundary, sits to the RIGHT. All API, runtime, local MCP, shared-service, adapter, persistence and export objects sit inside the Python backend boundary. Use a spacious two-level arrangement inside the boundary so text and connectors do not overlap.

Required browser label: "Next.js workspace". Show a question field and a few paper-result cards without fictitious paper titles. Browser request goes to the "Python API" gateway inside the backend. A clear return arrow from Python API to browser is labeled "Results + progress". By the API include a small visible control/receipt object labeled "Run controls" and below it "Scope • limits • cancel".

Inside the backend's upper middle, put a light lavender group labeled exactly "LangChain Deep Agents". It contains TWO friendly small robot figures:
- "Coordinator"
- "Discovery specialist"
The arrow Coordinator → Discovery specialist is labeled "Delegate once".
The API/run-control entry points to the Coordinator.
The specialist is search-only: its arrow labeled exactly "search_papers" goes to a distinct plug/gateway labeled "Local application MCP". Do not draw an arrow directly from either robot to OpenAlex or storage.

The local application MCP feeds a prominent illustrated service workbench labeled "Shared Python services".
A concise sublabel on the workbench reads "Normalize • dedupe • cache • provenance".
A separate human/API branch also reaches these same shared services, with the clear label "Human review + details". This branch represents explicit user-driven details/include/exclude/export and bypasses the agents; the browser must reach it THROUGH the Python API, never directly.
From Shared Python services, draw a clean arrow to a small boundary adapter labeled "OpenAlex adapter". That adapter connects to the external service labeled exactly "Official OpenAlex MCP". Use a two-way request/result connection or two separated arrows to make returned data clear. The remote edge is labeled "OAuth • Streamable HTTP"; a nearby small note says "Capability proof pending". OpenAlex is the only external research provider shown. Do not include other provider brands or a REST fallback branch.

Below shared services, show an illustrated stack of versioned folders/files, NOT a database cylinder, labeled "Local state interface". Small contents label: "Runs • records • selections • receipts".
Nearby decision note, exact: "JSON snapshots proposed"
Nearby qualifier, exact: "Database undecided".
Connect local state to Shared Python services only, not directly to the browser, robots or remote provider.

The human-review area uses an obvious person/checklist motif and the exact label "Human chooses the shortlist". Do not imply that agents save or approve selections. From shared services, show two exported paper artifacts labeled exactly "bibliography.md" and "manifest.json". Caption those papers "From saved revisions". Their export path must not route through agents or external provider, and must not imply a new search or model call.

A compact outcome ribbon along the lower edge reads, exactly:
"Up to 10 candidates → human shortlist up to 3 → provisional bibliography"
Add a readable scope note:
"Metadata / abstracts only"
And a smaller readable future note:
"Full text + independent DOI checks come later"
Within or beside the Deep Agents group add a short note "Model configuration pending" rather than inventing a model vendor or deployed model.

IMPORTANT: all architecture components are planned. No deployed/production/live-tested claims. Do not add extra agents, PDFs, passage retrieval, vector databases, cloud infrastructure, taxonomy trees, generic hidden services or additional limits. Preserve exact technical labels and filenames. Avoid crossing connector lines. Never connect user/browser directly to storage or provider; never connect specialist directly to saving/export. Make the distinction between the two MCP boundaries unmistakable. Let the diagram be visually elegant and illustrative, not text-heavy.

## Targeted connector correction

Edit this existing Research Scout Phase 1 architecture illustration. Preserve its title, status stamp, handwritten paper-and-ink style, dimensions, palette, all human/robot/browser/file illustrations, all text and all regions except the specific connector correction below.

CRITICAL TECHNICAL CORRECTION: The current vertical arrow from the bottom of "Local application MCP" goes straight into the top of "OpenAlex adapter". That bypass is wrong.
1. Remove that entire direct Local application MCP → OpenAlex adapter vertical connector.
2. Instead, draw a clean elbow connector from the bottom of "Local application MCP", moving down a short distance, then LEFT above the workbench, then DOWN with a clear arrowhead entering the TOP of the "Shared Python services" workbench. Keep the elbow clear of the Deep Agents frame and service labels.
3. The discovery request path must be unmistakably: Discovery specialist → Local application MCP → Shared Python services → OpenAlex adapter → Official OpenAlex MCP.
4. Between the right side of the Shared Python services workbench and the left side of OpenAlex adapter, use ONE clean pair of opposed horizontal arrows to represent requests and returned records. Remove any redundant third connector there.
5. Do not introduce any connector from the specialist or local MCP directly to provider, adapter, state or exports.

Retain the existing Python API → shared-services human review/details branch, browser Results + progress return, shared-services/local-state relation and exports from saved revisions. Make only this targeted connector correction; preserve every other visual detail and all exact text.

