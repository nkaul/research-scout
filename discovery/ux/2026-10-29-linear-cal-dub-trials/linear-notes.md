# Linear-inspired Research Scout trial

Created October 29, 2026. A standalone HTML design study with fictional sources; no application changes or live provider/model requests.

## Reference and interpretation

The user’s `lear.app` reference is interpreted as **Linear.app**, following the earlier discussion of Linear’s app workspace. The direction uses the **light** product interface, rather than the dark marketing presentation.

- [Linear’s 2026 interface refresh](https://linear.app/now/behind-the-latest-design-refresh), March 12, 2026: quieter navigation, predictable headers/actions, restrained icons and warmer neutral surfaces. These principles inform the chrome, action placement and narrow lavender accents here.
- [Linear’s 2024 UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui), March 28, 2024: the sidebar/header relationship, structured split views and consistent alignment inform the source list plus persistent reader.
- [Publisher’s light interface image](https://webassets.linear.app/images/ornj730p/production/900ab5bbf41d4245dcd32122b80ed523c5a00e2f-2352x1344.png), visually reviewed: reference for a quiet left rail, selected row, and generous detail typography. This is a dated published image, not a current authenticated walkthrough.

The original composition translates these references into a Research Scout workspace: project navigation, research question, progressive discovery status, inspectable sources, provenance, human shortlist and source notes. The abstract, relevance text, publications and names are illustrative. OpenAlex is the sole displayed discovery provider. The hybrid-search label represents the approved product direction, not a real search performed by this HTML.

## Trial controls

- Select a source; desktop retains the reader and mobile opens a full-screen source sheet.
- Add/remove shortlist items, with a three-source cap and updated counts.
- Search source titles, authors and topics; filter by open access and publication year.
- Add a note retained for the current page session.
- Open workspace/display settings to change density or hide relevance guidance.
- Replay progressive source arrivals; the active source and notes remain intact.
- Refine the research question and replay illustrative discovery.
- Export the illustrative shortlist as JSON, or copy an illustrative citation when the browser supports clipboard access.
- Focus source search with `/` or `Cmd/Ctrl + K`.

Static project names and profile information show navigation hierarchy, without pretending to be connected application routes. No external runtime assets, fonts, packages or APIs are loaded.

## Review focus

Compare the quiet navigation and precise list/reader relationship with the Cal and Dub trials. This is the densest, most research-focused direction. It deliberately avoids a marketing hero or a grid of oversized cards. Source controls remain compact while reading text is 14px, titles 23–25px, and important metadata at least 12px in the core workspace.

## Local validation

Rendered and visually reviewed the desktop workspace at 1440px, the phone source list and reader at 390px, and the narrow layout at 320px. The narrow layout had no document overflow. Browser checks exercised mobile navigation/settings, density, shortlisting, source notes and progressive discovery; notes persisted while sources arrived, with no JavaScript errors. Root performs the combined review across all three trials.

## Root QA selectors

`[data-source="1"]` selects the first source; `#shortlist-toggle` changes its shortlist membership; `#source-search`, `#open-access`, and `#year-filter` filter results. `#add-note` opens `#source-note`. `#view-settings` opens `#settings-dialog`, `#density` controls density, `#show-insights` hides relevance. `#replay` progressively advances the available count from 3 to 8 over 3.75 seconds. `#close-reader` returns to results on phones. No source arrival replaces the reader DOM or note field.
