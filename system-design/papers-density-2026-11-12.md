# Streamlined paper discovery workspace

November 12, 2026. This UI refinement keeps the current Next.js/React implementation, Python services, retrieval policy and provider boundaries.

The execution approach has three parallel parts:

1. Put source/date preferences, result filtering, abstract display, Exploration and retrieval coverage in one control panel beneath the Papers/Videos tabs. Remove the repeated Available heading and generated discovery-summary prose. Keep detailed routing/query/usage audits collapsed.
2. Start each paper card with its title and compact type/provider/year chips, followed by authors and an inline abstract excerpt with an expand icon. Use one action row for the reader, project save, original source, PDF preview/new tab, provider records and Unpaywall. Reports expand directly below that row.
3. Show a small bold title in the right reader. Overview contains available authors, venue and content. Metadata separates useful citation fields from collapsed record identifiers/history and explains disabled actions. Notes distinguish the current run's shortlist from project saving.

Desktop paper results select the first available record through the existing passive saved-read path. This does not move focus or start retrieval. Subsequent row intent takes precedence; progressive updates and closing the reader must not keep selecting the first row. Mobile/touch and the deferred Videos card interaction keep explicit selection. Search-form validation stays outside the reader; reader errors belong to the selected source operation. Existing skeletons, stale-response guards, cache invalidation and historical-source fences remain required.

## Counts, status and provenance

The old “distinct sources” label mixed resource types and did not explain the retrieval outcome. Papers and Videos retain their own tab counts; the shared coverage panel distinguishes resources across tabs from original provider records. A DOI match groups one paper card while preserving each provider's metadata and version. It does not blend title, authors or abstracts across records.

`PARTIAL` is a saved execution outcome, not an abstract completeness or relevance score. In the inspected 69-record search, all four discovery providers succeeded: OpenAlex returned 19 records, Crossref 20, arXiv 20 and YouTube 10. Four Unpaywall DOI lookups returned `NOT_FOUND`; those access-enrichment outcomes caused the saved partial status. The UI must distinguish “discovery complete, some access checks unavailable” from a failed discovery branch. A missing Unpaywall record does not establish that no free copy exists.

Unpaywall supplies DOI-based open-access locations, licenses and versions. It is an access-enrichment observation attached to a paper, rather than another topic-search result. Provider-record and Unpaywall disclosures have separate labels and controls on the same action row.

The current Source contract contains author names and publication venue but no normalized affiliations/institutions. Overview displays the supplied fields. DOI registry comparison requires inclusion in the existing three-resource run shortlist; project saving alone does not enable it. The reader explains this gate and offers the explicit shortlist action. Backend authority is unchanged.

## PDF behavior and component references

The previous PDF iframe set `sandbox`, which can block native PDF rendering even when scripts are allowed. The updated preview uses the browser's native PDF viewer without that incompatible attribute, retains a loader and explicit fallback, and prefers a validated canonical arXiv PDF when supplied. Only provider-reported PDFs or Unpaywall `url_for_pdf` locations are offered. Preview and new-tab controls share the paper action row; viewing is explicit and does not add PDF text to model evidence.

The new-tab action uses an actual PDF link with `_blank`, no `download` attribute and no scripted download. A publisher's `Content-Disposition: attachment` response or the user's browser PDF preference can still force a download. This change does not add a server PDF relay or claim to override those external settings. Native rendering and new-tab behavior are verified with an actual valid PDF fixture rather than an HTML placeholder. [MDN PDF embedding guidance](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/General_embedding_technologies) documents the iframe sandbox limitation; [Content-Disposition](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition) explains server-directed attachment behavior.

Chip styling follows the compact marking/categorization pattern in [Ant Design Tag](https://ant.design/components/tag/). The app uses its existing authored CSS/SVG components, with no new frontend dependency or icon font. Ant Design's [Next.js guide](https://ant.design/docs/react/use-with-next/) was reviewed; adopting the library as a system would also involve its App Router style registry.

Validation evidence is recorded in the [acceptance receipt](../docs/validation/2026-11-12-papers-density-final.json). Video-specific card optimization remains a later iteration; common controls apply to both tabs.
