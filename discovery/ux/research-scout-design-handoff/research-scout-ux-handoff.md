# Research Scout — UX and Agent Handoff Index

Prepared October 26, 2026.

This is the entry point for the separate Codex workflow doing incremental development. It connects the product research, the two UX/design agents, and the interactive mockup. Every subagent's report is preserved as a standalone Markdown deliverable.

## Read in this order

| File | Author / purpose |
|---|---|
| [research-scout-development-handoff.md](research-scout-development-handoff.md) | Main workflow: comprehensive product, provider, architecture, data, API/MCP, milestone, and acceptance context |
| [agent-site-design-elements.md](agent-site-design-elements.md) | Site design elements agent: modern data-rich app patterns, official references, tokens, controls, and interaction recommendations |
| [agent-research-scout-ux.md](agent-research-scout-ux.md) | UX agent: translates the first agent's research and the product scope into IA, flows, components, responsive behavior, and acceptance criteria |
| [agent-scholarly-providers.md](agent-scholarly-providers.md) | Scholarly provider agent: API/MCP/access findings, IntuitionLabs review, downloader code observations, and institutional API options |
| [agent-search-video-mcp.md](agent-search-video-mcp.md) | Search/video agent: Google/MCP distinctions, web acquisition, YouTube discovery/transcripts, quotas/retention, and integration sequence |
| [agent-incremental-development-plan.md](agent-incremental-development-plan.md) | Planning agent: vertical slices, data/provenance contracts, dataset lane, evaluation, and completion criteria |

The two requested design agents worked in sequence: the design elements agent supplied its findings to the UX agent before the UX brief was finalized. The main workflow then combined both inputs with the Research Scout scope.

## Selected design direction

An original calm research workspace, informed by the operational patterns documented by Linear, Notion, Attio, Geist, shadcn/Radix, MUI, and Raycast.

Applied decisions:

- Cool near-white canvas, white surfaces, dark slate text, and Material UI blue, following the user's October 26 refinement.
- One prominent research question field.
- Four destinations: Discover, Library, Evidence, and Research brief.
- Papers/Web/Videos as source-type tabs, not competing top-level applications.
- Spacious source rows and hairline separators instead of a dashboard of KPI cards.
- A contextual inspector closed by default.
- Explicit Save state; comparison selection is separate and lives in Library.
- Up to three comparison sources with source/passage navigation.
- Clear content access states.
- Restrained outlined icons, labeled primary actions, keyboard controls, native dialogs, and responsive layouts.
- Provider configuration, API/MCP routing, quotas, and agent logs kept out of the primary research flow.

The prototype is a lightweight implementation of this visual and interaction direction. It does not commit the production app to a UI framework. The design agents discuss shadcn/Radix and MUI as later component options.

Current palette (supersedes the original forest/teal recommendation):

| Role | Value |
|---|---|
| Primary action / accent | `#1976d2` |
| Hover / strong blue | `#1565c0` |
| Light blue detail | `#42a5f5` |
| Selected / focus background | `#e3f2fd` |
| Canvas / surface | `#f8fafc` / `#ffffff` |
| Sidebar | `#f2f5f9` |
| Main text / secondary | `#1f2937` / `#64748b` |
| Border | `#e2e8f0` |

The primary blue roles follow the [official Material UI palette](https://mui.com/material-ui/customization/palette/). Color choice does not imply that the prototype uses the MUI React library.

## Mockup scope and honesty

The mockup uses fictional, explicitly labeled sample records and passages. No live scholarly search, web crawling, transcript retrieval, or model synthesis is connected.

The UI has working local interactions for searching/filtering sample sources, saving to Library, source inspection, comparison, sample brief creation, and Markdown export. Saves persist in browser local storage. Comparison selection lasts for the current page session.

The mockup should not be used as evidence about academic findings, source availability, citation counts, or model quality.

## Files to reuse

The downloadable [research-scout-design-handoff.zip](research-scout-design-handoff.zip) contains the five agent reports, the main product handoff, this index, a portable HTML preview, and the editable mockup source under `research-scout-mockup/`.

The site is also preserved directly beside this document:

- [research-scout-mockup.html](research-scout-mockup.html): portable, self-contained HTML preview. Download and open in a browser. It embeds the same CSS and JavaScript; there are no external font, image, library, or API dependencies.
- [research-scout-mockup/README.md](research-scout-mockup/README.md): source/run instructions, feature inventory, and publication continuation.
- [research-scout-mockup/dist/index.html](research-scout-mockup/dist/index.html): editable application shell.
- [research-scout-mockup/dist/styles.css](research-scout-mockup/dist/styles.css): editable Material UI blue styling.
- [research-scout-mockup/dist/app.js](research-scout-mockup/dist/app.js): editable sample data and interaction behavior.
- `research-scout-mockup/make-portable.py`: regenerates the self-contained HTML after source edits.
- `research-scout-mockup/.openai/hosting.json`: retained private ChatGPT Sites identity and static deployment configuration; no credentials.
- [research-scout-material-blue-preview.jpg](research-scout-material-blue-preview.jpg): captured rendered preview.

The HTML/CSS/JS files are the source of truth. Regenerate the portable HTML after changing them. The ZIP is a snapshot of this handoff, not a synchronization service.

To continue in VS Code, extract the ZIP and open its folder. From `research-scout-mockup/`, run:

~~~sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
~~~

Then open `http://127.0.0.1:8765/`. Stop the server with Ctrl+C. If that port is occupied, use another port. The original preview server and this Codex chat are not required to recover the mockup.

The source is framework-free and has no build step. Production implementation can translate these components into the chosen stack while preserving the user flow.

Browser-local saved sources are demo state, separate from these source files. They do not automatically transfer to another browser, origin, or machine. API credentials, provider accounts, and production data are not included.

## Mapping UX to incremental development

| UX area | Backend/domain dependency |
|---|---|
| Research question and results | ResearchRun, provider-specific queries, normalized Work records |
| Saved Library | SourceSelection and persistence |
| Access labels | Separate access and acquisition states |
| Source inspector | PublicationVersion, Asset, provider metadata, passages |
| Evidence comparison | Bounded selected sources, source-backed extraction, Claim/Passage links |
| Brief and export | ResearchRunRevision, evidence manifest, verified bibliography |
| Web/video tabs | Source-specific discovery and content-access capabilities |

Build real integrations incrementally. The presence of a mockup screen does not imply its backend milestone is complete.

## Recommended next design/build slice

Implement one complete paper flow:

1. Create a research run from the question.
2. Search OpenAlex and inspect results.
3. Enrich selected bibliographic records through Crossref and applicable DOI agency fallback.
4. Save a shortlist with provenance.
5. Render the results and Library using the mockup's interaction pattern.
6. Export a real bibliography.

Follow with acquisition, evidence locators, and bounded comparison. Add web, video, and dataset sources only as their capabilities become reliable.

## Continuation prompt for the other Codex workflow

~~~text
Read research-scout-ux-handoff.md, the main research-scout-development-handoff.md,
and the individual agent reports. Inspect the existing repository and applicable
instructions before making changes.

Use the interactive mockup as a UX reference, not as a live backend. Preserve its
light minimal visual direction, single-question workflow, source rows, optional
inspector, explicit access labels, and separation of saving from comparison.
Use the latest user-selected Material UI blue palette (#1976d2 primary,
#1565c0 hover, #e3f2fd selected background) and cool light neutrals. Earlier
forest/teal recommendations are superseded. Source files are preserved under
research-scout-mockup/dist/; the standalone HTML is a generated preview copy.
Do not introduce provider configuration or large dashboard sections into the
primary experience.

Implement the next independently useful backend/UI slice from the main handoff.
Reuse existing production code rather than replacing it with the static demo.
Keep fixtures visibly separate from real provider data, preserve provenance,
and validate both the behavior and responsive UI. Update the handoff with what
was implemented, tested, or left unverified.
~~~

## Verification and publication

Checked in the local browser:

- Papers, Web, and Videos source navigation.
- Source inspector Overview and Evidence, including sample passage locators.
- Saved Library and selecting two sources for comparison.
- Two-source comparison and opening supporting passages.
- Research brief creation and citation controls.
- A real Markdown file download through the Export action.
- Collapsed navigation in the narrow panel and the rendered blue palette.
- No horizontal document overflow at the measured 412px, 500px, and 734px CSS viewport widths during spot checks. These are spot checks, not a complete device matrix.
- No captured browser error/warning entries at the final check; JavaScript syntax check passed.
- Portable HTML checked for external asset references; it embeds the original CSS and JavaScript. Opening local `file:` URLs is unsupported in this in-app browser, so direct-file browser execution was not separately verified here. The original multi-file version was browser-tested over localhost.

Implemented but not exhaustively browser-tested: every filter/sort combination, three-source comparison limit, all keyboard/focus paths, and cross-browser accessibility. The prototype is not an accessibility conformance audit.

Known prototype limits: the generated brief is prewritten around the education example; export provides source/evidence Markdown rather than a complete fidelity copy of the rendered brief. Search filters local fixtures and is not semantic retrieval. Browser saves are local; no backend persistence or live providers are implemented.

**Hosted publication is incomplete.** A private Site was registered and its identity retained:

- Title: Research Scout — Design Preview
- Project ID: `appgprj_6adeeb3625cc8191bfcce1de2fe459e0`
- Audience: owner-private
- Static directory: `dist`
- Source commit/push, version save, and deployment: not completed; no hosted URL is verified.

Automatic approval review rejected the terminal `write_stdin` action required to pass the temporary Sites repository credential to the supported publishing helper. This session cannot approve that interactive terminal action. No credential is in the handoff files. Local source and the portable preview are preserved independently of publication.

To resume publication in a workflow that permits the supported helper: read the current Sites skill, use the project ID from `.openai/hosting.json`, obtain a fresh repository write credential for that same Site, synchronize/package the exact source with the supported source helper, and deploy to the confirmed private audience. Do not create a duplicate Site or invent a source commit/version ID. Preserve the returned verified deployment information in this handoff when it succeeds.

## Preservation and delivery checklist

- Five standalone subagent Markdown reports: included.
- Main research/architecture/incremental-development document: included.
- UX synthesis and continuation prompt: this document.
- Editable site source and static assets: included.
- Portable HTML and rendered screenshot: included.
- Private Site identity without credentials: included.
- Combined ZIP: included.
- Live research services and hosted deployment: outstanding and explicitly distinguished from the working local UX concept.
