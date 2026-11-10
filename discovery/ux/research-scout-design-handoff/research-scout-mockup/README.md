# Research Scout — Interactive UX Concept

Prepared October 26, 2026.

This buildless HTML/CSS/JavaScript prototype explores the UX and visual language of Research Scout. It is a design artifact, not the scholarly API implementation.

## Run

Serve the dist/ directory with any static HTTP server. For example:

~~~sh
python3 -m http.server 8765 --directory dist
~~~

Open http://localhost:8765.

Alternatively, open the accompanying `research-scout-mockup.html` in a browser. This self-contained copy embeds the CSS and JavaScript and can be used after the original preview server or chat ends. Edit `dist/` for continued development; the portable file is a generated snapshot.

The downloadable source includes `make-portable.py`. After editing `dist/`, run `python3 make-portable.py` from the mockup folder to regenerate the portable HTML beside that folder. The in-app browser only supports HTTP(S); use a normal browser for the downloaded standalone HTML, or the static server above.

## Files

- dist/index.html: semantic application shell and native dialogs.
- dist/styles.css: responsive light visual system and components.
- dist/app.js: illustrative data and local interactions.
- .openai/hosting.json: private ChatGPT Sites project identity/configuration.

## Working interactions

- Explore paper, web, and video sample sources.
- Filter the local fixtures by question, publication year, study type, and content access.
- Change sorting.
- Save/remove sources with browser-local persistence.
- Open an Overview/Evidence inspector.
- Select up to three saved sources in Library; compare two or three.
- Reopen supporting sample passages from the comparison.
- Generate a prewritten sample brief and export Markdown.
- Use native filter/new-question dialogs and a command menu.
- Use Command/Control K or slash to focus search, N for a new exploration, and Escape to close overlays.

## Deliberate scope

All records, authors, counts, and passages are illustrative. No live providers, model calls, authentication, full-text acquisition, or transcript services are connected. There are no fabricated DOI links.

Save-to-Library and comparison selection are distinct. Source access labels distinguish full text, abstract-only, metadata-only, and transcript-backed content.

The source is intentionally lightweight for a UX review. Production development should reuse the interaction contracts and visual tokens, while implementing the backend increments from the accompanying research handoff.

## Design inputs

Two agents supplied separate design research and UX briefs. A main-workflow synthesis records which recommendations were applied. Additional scholarly, search/video/MCP, and development-plan agent reports are included in the downloadable handoff bundle.

The latest user-selected palette is Material UI blue: `#1976d2` primary, `#1565c0` hover, `#42a5f5` light detail, and `#e3f2fd` selected/focus background. The canvas is `#f8fafc`; surfaces are white. This supersedes the original forest/teal proposal and does not require the MUI React library.

## Preserved Site identity and publication

The private ChatGPT Sites project is `appgprj_6adeeb3625cc8191bfcce1de2fe459e0`, titled Research Scout — Design Preview. Its configuration is retained in `.openai/hosting.json`. No credentials are included.

Registration succeeded, but source synchronization, version saving, and deployment did not complete. Automatic approval review blocked the terminal stdin action used by the supported publishing helper. No hosted URL has been verified. The full local source and portable preview remain usable.

When resuming with the Sites plugin, read its current skill, reuse this project ID, obtain a fresh write credential, and use the supported source/package/deployment workflow for the private audience. Do not register a duplicate Site. See the main UX handoff for exact status and continuation context.

## Hand off to another Codex workflow

Open the extracted bundle folder in VS Code. Start with `research-scout-ux-handoff.md`, then the product development handoff and individual agent reports. Keep this source as the UX reference while implementing the next backend/UI slice. It has no build dependencies and is not a production research client.

Saved-source state stays in each browser's local storage; it is not transferred with the source. The package contains sample fixtures, no production data or API credentials.

## Validation

See the delivered handoff index for the final verification record and known limitations.
