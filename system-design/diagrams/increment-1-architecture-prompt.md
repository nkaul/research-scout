# Revised Phase 1 architecture illustration prompt

October 26, 2026. Built-in image generation; Illustrated Explainers skill.

The previous OpenAlex-only artwork is preserved under `history/2026-10-26-openalex-only/`. Image 1 is the inspected previous PNG, used as the edit target for a full architecture revision; Image 2 is the inspected overview style reference. New provider isolation, hybrid retrieval and progressive delivery requirements supersede the original figure's scope. No application provider/model trial was performed.

## Complete generation request

Use case: infographic-diagram.
Edit target: Image 1 is the previous Research Scout architecture PNG. Preserve its paper-and-ink visual language, friendly human/robot motifs, Research Scout title and blue/purple palette, but REBUILD the composition and architecture to the new contract below. The old OpenAlex-only shared-backend architecture is superseded. Image 2 is an additional STYLE REFERENCE ONLY; never copy its GitHub Manager labels.

Create one publication-quality LANDSCAPE 16:9 illustration, preferably 2560 x 1440 or larger native export if supported. White paper, slightly irregular dark navy outlines, large readable handwritten headings, clean readable body lettering, restrained Material blue/indigo and purple marker washes. Meaningful objects: user/browser, two agent robots, MCP plug, routing switch, provider service workbenches, filter sieve, separate paper observations, revision folders and exported documents. Generous margins and whitespace. No logos, screenshots, dense schemas, gradients, photorealism or 3D.

Exact title: "Research Scout"
Exact subtitle: "Phase 1 Architecture"
Exact status stamp: "PROPOSED • Increment 1"

Viewer question: How does one selected provider's hybrid discovery become usable rows before agent completion, while independently running provider services and human review retain explicit boundaries?

READING PATH: Next.js UI on the left; one softly outlined application-core boundary in the middle; FOUR visibly separate stand-alone Python provider SERVICE cards on the right, OUTSIDE the application core. Do not enclose those four cards in a common backend box. OpenAlex is the most prominent provider card. A lower return lane takes saved observations through progressive events back to the UI, with revision-based exports alongside it. Use a spacious two-row arrangement inside the core to avoid crossed connectors.

LEFT:
Draw a friendly researcher at a browser labeled "Next.js workspace". Browser has a question field, a short scope pill "OpenAlex • Hybrid default", three simple paper rows without invented research titles, and a nearby label "Inspect • save • DOI check". Another short note reads "Rows usable while work continues".
The browser's request arrow enters the CORE API, never a provider, model, filesystem or storage directly.

MIDDLE APPLICATION CORE:
Boundary title: "Provider-agnostic Python core".
At entry, a gateway labeled "API + run controls"; small sublabel "Scope • limits • cancel".
Clearly labeled discovery chain INSIDE this core:
"Deep Agents coordinator" → "Provider-bound specialist" → "Local application MCP" → "Deterministic router".
Use two friendly small robots for the first two, an MCP plug for the third, and a switch/signpost for the router. Arrows are unambiguous. The specialist has no direct provider or storage arrow.
The API starts the coordinator path. A SECOND, separate API path labeled "Human review + DOI checks" reaches deterministic services/router and saved state without going through either agent. Human include/exclude and export are not agent decisions.

RIGHT: FOUR INDEPENDENT PYTHON SERVICES, outside core, with visible separate boundaries:
1. Largest, blue emphasis:
"OpenAlex Python service"
"PRIMARY • official MCP"
Inside this service illustrate TWO same-provider retrieval branches labeled "Lexical" and "Semantic text → provider embedding", with a small sieve labeled "Compatible filters" and their reunion labeled "Same-provider dedupe + rank fusion". This describes provider-side query embedding via the official remote MCP, not a new application vector database. Keep text short and readable.
2. Separate complementary service:
"Semantic Scholar Python service"
"Complementary • explicit run"
"Semantic route: proof needed"
3. Separate service:
"Crossref Python service"
"REST • exact DOI check"
4. Separate service:
"DataCite Python service"
"REST • exact DOI check"

ROUTING ARROWS:
From the deterministic router, draw clearly CONDITIONAL gated/dashed request-and-observation connections to the appropriate provider service. Discovery gates read "If OpenAlex selected" and "If Semantic Scholar selected". The two services never call one another.
Crossref and DataCite paths are conditional ONLY on an explicit human DOI check and its registration agency. Label those two gates "DOI agency: Crossref" and "DOI agency: DataCite"; a nearby short note reads "Explicit DOI check only".
Do not draw arrows from provider to provider. Do not draw all four services as an obligatory sequence or simultaneous fan-out. The lexical+semantic pair inside OpenAlex IS intentional within-provider hybrid retrieval.
One readable scope ribbon says "One discovery provider per run • no automatic fan-out".

LOWER CORE AND RETURN:
Returned provider observations pass through deterministic validation into a paper/folder object labeled "Validate + persist observations", with the qualifier "Separate sources • no silent merge".
From this saved-observation object, a clear arrow passes through "Progressive event stream" and returns LEFT to the Next.js browser. Label this return "Before summary / completion". This delivery does NOT wait for the coordinator's final model message, rank fusion or every source. Do not imply that the upstream API necessarily streams individual records.
A human-save/API connection leads to a folder labeled "Saved revisions". From that folder show exactly two paper exports: "bibliography.md" and "manifest.json", with caption "From saved revisions". No export arrow through an agent or provider.

BOTTOM QUALIFIERS, readable:
"Metadata / abstracts only"
"Database + model undecided"
Keep proposed status visible. No full text, PDF parsing, passage evidence, scientific-validity check, deployment/cloud, invented provider access, extra agents, vector database or numerical performance claims. Do not reuse obsolete "up to 10 candidates" or "DOI checks later" labels from the original.
Prefer readable concise labels and correct arrow semantics to decorative detail. All four provider services must visibly remain outside the one application-core boundary.

## Tool inputs

- `referenced_image_paths[0]`: `/Users/nkaul/Documents/repos/research-scout/system-design/diagrams/increment-1-architecture.png`
- `referenced_image_paths[1]`: `/Users/nkaul/Documents/repos/research-scout/.agents/skills/illustrated-explainers/assets/style-overview.png`
- `transparent_background`: `false`

The source snapshot JSON records exact input-document hashes at generation start. Native output dimensions and visual review are recorded separately after inspecting the export.

## Targeted routing correction

Use case: infographic-diagram.
Edit this inspected Research Scout architecture image. Preserve the title, proposed stamp, entire left UI, all four separate provider-service cards, every service/card label, the two OpenAlex hybrid branches, the two agent robots, local MCP, API, human-review path, paper/ink style, colors and all other regions.

Correct ONLY the request/result routing connectors in the narrow gutter between "Deterministic router" and the four provider services, plus the single saved-revision connector described below.

The current image has a concrete routing error: the line labeled "If Semantic Scholar selected" ends inside the OpenAlex card, and an extra "Explicit DOI check only" line ends inside the Semantic Scholar card. Both are wrong.

Remove ALL current purple dashed routing lines between the router and service cards, then draw EXACTLY FOUR clean conditional request/result connections, one per service, with small arrowheads at both ends so responses return through the same selected route:
1. Router ↔ OpenAlex Python service. Gate label "If OpenAlex selected". Endpoint must enter ONLY the OpenAlex service.
2. Router ↔ Semantic Scholar Python service. Gate label "If Semantic Scholar selected". Endpoint must enter ONLY the Semantic Scholar service, which is the second card.
3. Router ↔ Crossref Python service. Gate label "DOI agency: Crossref". Endpoint must enter ONLY Crossref.
4. Router ↔ DataCite Python service. Gate label "DOI agency: DataCite". Endpoint must enter ONLY DataCite.

Place the note "Explicit DOI check only" beside the two lower DOI routes; it must NOT have an independent arrow and must NOT point to Semantic Scholar. Keep all service cards separate and OUTSIDE the application core. Four gated alternatives do not mean four concurrent searches. No service-to-service connections.

Connect the bottom/output of the Deterministic router to "Validate + persist observations" with one clear blue downward/elbow arrow, carrying returned observations after deterministic routing. Keep this connection separate from the forward discovery agent chain. Do not connect any provider directly to the browser or saved revisions. Preserve the existing API-only human review/check/save path.

Finally, the current single arrow between "Saved revisions" and "Validate + persist observations" points left from revisions into observations. Reverse just that arrow: saved observations → Saved revisions → bibliography.md / manifest.json. Preserve the event-stream arrow from persisted observations LEFT to Next.js, before summary/completion.

Do not change any words, illustrations, section layout, palette, card boundaries or other connectors. Keep all labels readable and prevent overlap in the routing gutter.

## Simplified conditional routing correction

Use case: infographic-diagram.
Make ONE SIMPLE correction to the supplied Research Scout architecture. Preserve the paper-and-ink style, all human/robot/browser/file illustrations, every service card, application-core boundary, OpenAlex hybrid retrieval branches, title, status, and all blue data-flow/export/event arrows.

The purple routing arrows in the narrow vertical gutter between the application core and the service cards are misaligned. Simplify instead of drawing more connectors:
- KEEP ONLY the TOP purple dashed bidirectional connection and its label "If OpenAlex selected", which correctly enters the OpenAlex card.
- DELETE the other THREE purple dashed bidirectional connections entirely, and DELETE ALL their gutter labels: "If Semantic Scholar selected", both "DOI agency" labels, and both "Explicit DOI check only" labels.
- Leave that narrow gutter clean and empty below the one retained OpenAlex connection. Do not create any replacement arrows in this gutter. No connector may point to Semantic Scholar, Crossref or DataCite.
- Keep the existing Semantic Scholar service text "Complementary • explicit run" and "Semantic route: proof needed". These text labels define its conditional selection; no arrow is needed.
- Inside the Crossref Python service card add the short line "Explicit check • Crossref agency". It must remain a separate card with "REST • exact DOI check".
- Inside the DataCite Python service card add the short line "Explicit check • DataCite agency". It must remain a separate card with "REST • exact DOI check".
- The current scope ribbon "One discovery provider per run • no automatic fan-out" must remain unchanged. The four provider services must remain separate and outside the application core.

Do not introduce a new provider edge, shared provider box, provider-to-provider arrow, new technical component or extra words. Matched card labels and the exact companion architecture document explain the conditional nonprimary routes. Preserve the correct observation → Saved revisions → bibliography/manifest direction and the progressive event return before summary/completion.

## Actual correction inputs and preservation

The first correction used the inspected `increment-1-architecture-draft.png`; the simplified-routing correction used the inspected `increment-1-architecture-routing-draft.png`. Both are now archived under `history/2026-10-26-provider-services-drafts/` and labeled failed/not current. The selected native output is 1672 × 941 pixels. Exact default tool output paths and review findings are in the JSON review record. The prior OpenAlex-only PNG and all its original prompts/review/index bytes remain in `history/2026-10-26-openalex-only/`.
