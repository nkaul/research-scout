# 05 · Forma

**October 28, 2026 · standalone design proposal · not an adopted production redesign**

[Open the HTML concept](prototype-05.html).

Forma treats Research Scout as a personal research library. The layout has three distinct functions: a quiet collection rail, a source index and a spacious reading pane. The research question stays compact above the workspace. A source is already open when the screen appears, so the first useful content is available immediately. This composition deliberately moves away from the earlier large blue composer, newspaper-style masthead and dark operational console.

## Primary-source research and interpretation

The following sources were checked on October 28, 2026. They inform a proposed direction for 2027; they cannot establish what next year's best interface will be.

| Official reference | Relevant guidance | Forma's design interpretation |
| --- | --- | --- |
| [Apple HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) | Sidebars organize app areas and collections; compact navigation can be preferable when space is limited. The guidance discusses a content list between navigation and detail for deeper content. | Separate collection context, source selection and reading. Hide the collection rail on small screens and turn the source index into a horizontally browsable strip. This is an original web layout, not Apple's native split-view implementation. |
| [Apple HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout) | Alignment and grouping communicate hierarchy, and layouts should adapt consistently to their context. | Align the reader's title, author line, content navigation and abstract to a single reading edge. Keep actions in one toolbar rather than scattering them across content cards. |
| [Apple HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color) | Color should have a consistent meaning and essential information should have another representation besides color. | Forest marks actions and human selection; muted green surfaces mark the open source. Saved sources also have a bookmark icon and text. Branch progress is spelled out. Green does not stand for scientific quality. |
| [Adobe Spectrum: Colors](https://spectrum.adobe.com/page/color-system/) | Purposeful color, layered backgrounds, paired foreground/background contrast and text labels for color meaning are explicit principles. | Spend chroma on important controls and selection. Separate stone canvas, sage navigation and white reading surfaces with restrained borders. These custom colors are design-study tokens, not an assertion of Spectrum compliance. |
| [React Aria: Quality](https://react-aria.adobe.com/quality) | Accessible visual design still requires labels, focus visibility, adequate contrast, hit targets and motion preferences. | Use native buttons and text fields, visible labels, three-pixel focus outlines and reduced-motion support. Production integration would still require accessibility testing. |
| [React Aria: ListBox](https://react-aria.adobe.com/ListBox) | Selection and primary/secondary content should be explicit. Interactive children are unsuitable within listbox options. | Source rows are native buttons in an ordered list, with the human shortlist action outside each row. The prototype does not claim to implement React Aria ListBox semantics or its keyboard model. |

Apple's JavaScript documentation shell was available directly; the web search index supplied the official page text used for the Apple summaries. No third-party HIG mirror was used as evidence. React Aria and Spectrum page bodies were read directly. No product screenshots, proprietary icons, external fonts or framework assets were copied.

## Visual decisions

- **Palette:** canvas `#f5f6f1`, navigation `#edf0e9`, white reading surface, ink `#202b24`, supporting text `#5b685e`, forest actions `#214b36` and selected source `#e3ecdf`. These are explicit roles rather than arbitrary shades per component.
- **Typography:** the local system sans-serif supplies all text. The opened source has the largest type; source titles remain readable in the index, and metadata uses at least 12 CSS pixels. No serif headline or external font is required.
- **Shape and depth:** one outlined workbench groups the reading journey. Only selection and actionable controls receive stronger fills. There is no decorative hero illustration, oversized dashboard metric or invented quality indicator.
- **Icons:** an original inline SVG family uses consistent outline strokes. Labels accompany major actions. The bookmark indicates a human choice, the file indicates record type and the notebook opens a personal note.
- **Content:** a single concise notice identifies the study as fictional. Missing abstracts remain missing. Abstract availability is explicitly distinct from having fetched or read a full paper.

## Demonstrated interactions and boundaries

The HTML supports opening a source, all-source/shortlist filtering, adding or removing sources with a three-source cap, separate notes per source and a Markdown demo export. Progressive replay begins with two lexical records and appends two semantic records from the same selected OpenAlex provider. Arrival preserves the selected reader and a focused source-row control. It does not call OpenAlex, other providers, agents or a model. Notes are kept only in memory until reload; export labels the records fictional. No DOI verification, provider blending or scientific assessment is simulated.

The files are self-contained and make no HTTP requests. The original three concepts and production application are unchanged. This study does not select React Aria, Spectrum or any other implementation library. Browser layout/interaction checks are evidence about this mockup, not a full WCAG audit or a participant usability study.

## Author validation

Local Chromium checks at **1440, 390 and 320 CSS pixels** passed with no JavaScript errors, external requests, duplicate IDs or document-level horizontal overflow. At each width, the complete question remained visible; save state, a per-source human note, focus retention during progressive arrival and the Markdown download were exercised successfully. Desktop and mobile screenshots were visually reviewed. Root's consolidated review records the final comparison-gallery evidence separately.
