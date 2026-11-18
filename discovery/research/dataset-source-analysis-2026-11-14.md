# Dataset source analysis and matching

November 14, 2026. Analysis subagent review of the earlier Research Scout research, current architecture and current official API documentation. This report recommends the dataset-discovery slice requested by the user. It records documentation checks, not a live endpoint/credential or retrieval-quality acceptance result.

## What the earlier research already decided

The [Project Research Resource Guide](project-research-resource-guide.md#general-datasets-and-research-repositories) distinguishes general repositories, official statistics, domain data, cloud catalogs and benchmarks. The [development handoff](research-scout-development-handoff.md#82-dataset-extension) models a dataset as a separate resource with versions/assets and an optional profile. Its [dataset increment](research-scout-development-handoff.md#increment-8--dataset-discovery-then-controlled-ingestion) explicitly sequences catalog discovery and applicability before selected-file ingestion or analysis.

The current user request brings dataset **discovery** into the present build. It does not imply completion of the earlier ingestion/analysis roadmap. A dataset record should not appear as a paper, a paper DOI must not automatically become a dataset DOI, and access to catalog metadata must not imply permission to fetch or reuse the underlying files.

The first useful result is a Data tab containing attributable candidates, a reason for their possible fit, known access/license/version information, unresolved requirements and links to original records. Schema, variables, missingness and analytical summaries are not computed by reading a catalog.

## Recommended first slice

Use a dataset-discovery specialist with independent provider services for **Hugging Face Hub datasets** and **DataCite Dataset records**. Hugging Face supplies ML-oriented repositories and task metadata; DataCite supplies cross-disciplinary, DOI-identified dataset metadata and registered relationships. This division reuses the existing provider-isolation strategy while keeping dataset discovery separate from the existing DataCite exact-DOI registry role.

Reuse the current saved agentic question's interpreted intent and verified keywords to produce bounded catalog queries. Do not create an additional paid model request merely because the user switches to Data, and do not silently send a raw question when no usable refined context exists. This is a resource-specific retrieval specialist, not a new autonomous agent process for every domain label. The issue/domain is a recorded routing and matching facet.

A sensible first policy is at most two eligible catalog services, a finite candidate limit per provider, recorded query inputs, partial provider outcomes and incremental saved results. A failed/slow dataset provider must not clear or delay existing Papers or Videos. Clicking a tab or reopening saved data should be a saved read; an explicit discovery action admits new catalog requests.

### Hugging Face public catalog

The official SDK constructs dataset listing requests at `GET https://huggingface.co/api/datasets`; bounded parameters include `search`, `limit` and repeated `filter`/`expand` entries. Selective expansion and `full` are alternatives. The SDK example describes `search` as matching dataset names, so it must not be advertised as native semantic retrieval. Use short dataset/task terms and declared metadata, not a full conversational question. [Official SDK source](https://raw.githubusercontent.com/huggingface/huggingface_hub/main/src/huggingface_hub/hf_api.py).

Useful expansion properties are `author`, `cardData`, `description`, `tags`, `sha`, `createdAt`, `lastModified`, `gated` and `private`. Pin the returned repository revision rather than treating its mutable name as an immutable release. Public discovery can be attempted without a new credential; private resources require authorized identity. No dataset-file resolution, execution, preview rows or download is needed for this catalog slice. [Official client API reference](https://huggingface.co/docs/huggingface_hub/package_reference/hf_api).

The dataset card is publisher-authored documentation. Card metadata can declare language, license, size and discovery tags; missing declarations stay unknown. A `pretty_name`/title may be absent, so the repository ID is a valid display fallback. A displayed card is not proof that the data fits the user's population or experiment. [Dataset cards](https://huggingface.co/docs/hub/datasets-cards).

The current Hub rate-limit page lists anonymous API requests at **500 per five minutes per IP**, while explicitly qualifying anonymous/free limits as changeable with platform health. Respect response quota information and handle 429 within existing bounded policies. Public does not mean unlimited. [Hub rate limits](https://huggingface.co/docs/hub/rate-limits).

An official Hugging Face MCP service exists and supports Hub resource exploration, including datasets. Its current setup instructions start with logged-in MCP settings; an anonymous REST adapter is not evidence that the MCP connection is configured. Retain MCP as a separately verified transport option rather than blocking public catalog discovery on new account setup. [Official MCP documentation](https://huggingface.co/docs/hub/agents-mcp).

Gated repositories can require an individual access request and agreement before files are available. Store the returned gate state, distinguish it from metadata visibility, and show that data access is not established. [Gated datasets](https://huggingface.co/docs/hub/main/datasets-gated).

### DataCite public Dataset search

Use `GET https://api.datacite.org/dois` with a query constrained to `types.resourceTypeGeneral:Dataset`. The public API retrieves Findable DOI metadata without authentication; draft/Registered-record access is a separate entitlement. It is a metadata registry, not a universal dataset-file server. [Public REST API](https://support.datacite.org/docs/rest-api).

Combine the type constraint with escaped, provider-specific task/domain terms using the documented query syntax. Example design input: `types.resourceTypeGeneral:Dataset AND ("retrieval augmented generation" OR "context engineering")`. Preserve the generated expression, rather than interpolating untrusted strings as query operators. [Query construction](https://support.datacite.org/docs/queries).

Use a bounded `page[size]` (for example 10), and retain cursor/page identity if later pagination is exposed. The reference permits page sizes up to 1,000, which is a provider maximum rather than an appropriate product default. `resource-type-id` is another documented type filter; the query constraint avoids accepting other work types when this lane requests datasets. [List-DOIs reference](https://support.datacite.org/reference/get_dois).

The documented rate tiers are **500 requests per five minutes per IP** unidentified, **1,000** identified by contact email, and **3,000** authenticated. A local real contact value, if configured, belongs only in ignored configuration; it must not be copied into artifacts. A free public query does not require adding DataCite registration credentials. [DataCite rate limits](https://support.datacite.org/docs/rate-limit).

Record the returned DOI, title/description, creators, publisher, subjects, publication date/year, optional version, declared formats/sizes, rights and geographic/temporal declarations. Rights and coverage fields can be missing. Registry `sizes`/`formats` are publisher assertions, not measured file properties or a computed data dictionary. [DataCite JSON mapping](https://support.datacite.org/docs/datacite-xml-to-json-mapping).

Keep registered `relatedIdentifiers` with their identifier type, relation type and direction. `IsSupplementTo`, `IsCitedBy` and `References` mean different relationships; a relation is not a causal support judgment. `HasVersion`/`IsVersionOf` and previous/new-version links must not be collapsed as duplicate content merely because they connect the same dataset family. [Connecting works](https://support.datacite.org/docs/connecting-to-works), [versioning](https://support.datacite.org/docs/versioning).

### Why not add every repository now

Zenodo is a useful next repository-specific adapter for record/files/version details beyond DOI metadata. Current published search limits are 30 requests/minute, with anonymous result pages capped at 25; authenticated pages can be larger. Bulk harvesting has separate mechanisms. This is a substantive change from older assumptions of generous unrestricted search, so it should remain a bounded, separately tested provider. [Zenodo search limit update](https://blog.zenodo.org/2025/11/25/2025-11-14-search-api-updates/), [developer documentation](https://developers.zenodo.org/).

Dataverse is another suitable next adapter: its search API distinguishes `type=dataset` from files/collections, supports relevance and requested metadata fields, and requires a token for unpublished content. Implement one named installation first; a Dataverse API is not a global search over every installation. [Dataverse Search API](https://guides.dataverse.org/en/latest/api/search.html).

Kaggle, Dryad, Figshare, OpenML and specialist sources remain valuable from the original guide. Each needs its own access, normalization and usefulness acceptance. The existing guide's MCP listing is evidence to investigate, not proof of a configured or compatible connection.

## Problem-area source map

This table is a **routing proposal based on the earlier guide**, not a claim that all sources are now connected. HF/DataCite are the initial catalog recommendation; the other listed sources are future provider candidates. Recheck each service's current entitlement, API/MCP capability and rate policy before enabling it.

| Problem area / user need | Candidate sources from existing research | Matching information that matters |
| --- | --- | --- |
| NLP, RAG, context engineering, agent evaluation | Hugging Face; OpenML/UCI for appropriate structured baselines; Kaggle when access/terms are configured | Actual task, text/language, labels/ground truth, train/evaluation split, benchmark version, contamination risk |
| General scientific data or reproducing a paper | DataCite; Zenodo, Figshare, Dryad, Dataverse, OSF | Dataset resource type, producer, registered paper relationship, release DOI/version, documentation and access |
| Education, social science, public policy | Dataverse, ICPSR, Census, OECD, World Bank; DataCite cross-repository metadata | Population/cohort, geography, survey year, sampling method, variable definitions and restriction level |
| Economics, finance and forecasting | FRED/ALFRED, World Bank, IMF, OECD, Eurostat, Nasdaq Data Link | Frequency, units, release vintage, revisions, geography, time span and reuse rights |
| Clinical, physiological and public-health questions | PhysioNet, WHO, CDC; DataCite and relevant institutional repositories | Patient/cohort eligibility, consent/access restrictions, measurement definitions, dates and task labels |
| Genomics, molecular or structural biology | NCBI GEO, RCSB PDB, PubChem and linked original repositories | Organism, experiment/assay, sample design, raw/processed state, units and batch effects |
| Ecology and biodiversity | GBIF, iNaturalist and DataCite-linked collections | Species/taxonomy, observation period, location uncertainty, observation/media licenses and sampling bias |
| Earth observation, climate and geospatial | NASA Earthdata/CMR, NOAA, Copernicus, USGS, OpenStreetMap | Spatial/temporal extent, resolution, product/processing level, observed versus modeled data and quality flags |
| Agriculture, food, humanitarian and development | FAOSTAT, HDX, World Bank, relevant national agencies | Commodities/classifications, country/region, update period, units, suppression and sensitive geography |
| Official government statistics | Original agency; Data.gov, data.europa.eu and national portals for catalog discovery | Original publisher, dimensions, definitions, geography, coverage period, revisions and license |
| Software-agent benchmark or repository-issue tasks | Hugging Face benchmark repositories, SWE-bench and original maintainers | Issue/task unit, repository/version, environment/harness, split, ground truth, leakage and license |
| Very large cloud-hosted public data | AWS Open Data Registry, BigQuery public catalogs and original producers | Storage location, format, version, size, query/egress costs and permissions; catalog discovery is separate from compute |

World Bank's current Indicators API documentation is distinct from the guide's Data360 MCP reference; one transport must not be represented as the other. [Indicators API](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation). OpenML's task/flow/run concepts are also useful for later reproducible evaluation beyond merely listing dataset titles. [OpenML REST API](https://docs.openml.org/ecosystem/Rest/).

A trial registry, protein entry or geographic feature query is not automatically a dataset release. Keep collections, studies, records, benchmark tasks and downloadable dataset versions distinguishable. Otherwise the Data lane repeats the paper-search relevance problem under a new label.

## Recommended matching contract

Use a recorded dataset request with these independently represented dimensions:

| Dimension | Question / interpretation |
| --- | --- |
| Problem and desired use | Train, evaluate, replicate, analyze, benchmark, or inspect a data source? |
| Domain and task | What actual application and operation are needed, rather than matching the word “model” alone? |
| Modality, schema and labels | Text, table, image, audio, temporal or geospatial data; required columns, labels and data dictionary when declared |
| Population and geography | Required cohort, organisms, region or jurisdiction; unknown stays unknown |
| Time and version | Collection/coverage period separately from publication/update dates; release DOI, provider version or immutable SHA |
| Access and license | Public metadata, gated/restricted data, explicit reuse terms, or unspecified; these are separate facts |
| Practical constraints | Declared format, volume, update cadence and reproducibility links |

First select eligible providers from the problem/task; then retrieve using their actual search capabilities; then rank candidate metadata against the request. Require the domain/task anchors that disambiguate broad language. For the earlier context-generation question, a dataset about pharmacy “context” must not qualify merely because that word overlaps: the requirement is language-model context selection/retrieval or evaluation evidence.

Hard exclusions should come from explicit user constraints or confirmed incompatible metadata. Do not convert missing license, geography, coverage or schema information into a fabricated match. Display an evidence-based applicability reason and unresolved requirements. A topical score is an inferred catalog match, not a calibrated probability, verified data quality or empirical support for the user's hypothesis.

Keep raw/provider-declared metadata separate from computed matching labels. Record which title, tag, description or registered relation supports a reason. Retrieval-only matching may be deterministic over the saved refined intent; do not call it a new LLM judgment or embedding-based semantic search unless that additional stage actually ran and was recorded.

## Identity, provenance and relationships

- Use provider-qualified stable IDs plus exact observed revision/version. For Hugging Face this is the canonical repository ID and returned SHA; for DataCite it is the normalized dataset DOI and declared release/version.
- Group exact dataset identity only when the identifier's role is known. A DOI in a Hugging Face citation may identify a paper, not the dataset, and must not drive dataset deduplication automatically.
- Preserve separate source observations, recorded fetch time, executed query and provider outcome even when one DOI groups them.
- Treat version families as relationships; preserve the specific release selected by the user. A newer record must not rewrite a historical project pin.
- Label paper/dataset links as **registered** when supplied by DataCite, **publisher-declared** when supplied in a card, and **inferred** when produced by text matching. Preserve relation direction and the evidence behind inferred applicability.
- Expose metadata-only, access-gated, unavailable and unknown states separately. No automatic file download, credential enrollment or restricted data transfer belongs to this first slice.

## Acceptance examples

1. An ML/context question uses its saved refined task/keywords, shows actual HF/DataCite catalog queries and yields dataset candidates or an honest empty result; generic biomedical “context” is excluded or explicitly marked unsuitable.
2. A climate or public-policy question does not claim specialist NASA/Census/World Bank retrieval unless those adapters were enabled. It may show general DataCite candidates while recommending the unconnected specialist route.
3. A gated HF result remains discoverable metadata with its gate clearly displayed; no file request or token prompt is triggered by opening it.
4. A DataCite Dataset record keeps license/version/coverage/relationship information when present and explicit unknowns when absent. Non-dataset DOI results stay out of the Data lane.
5. Identical dataset DOI observations can group without merging source fields. Different releases and a paper DOI remain separate.
6. A provider timeout or rate limit leaves other dataset results and existing Papers/Videos visible. Saved reopening makes no new catalog/model request.
7. Switching Data does not create another model charge. If there is no admitted refined question context, the UI explains that prerequisite rather than silently submitting the raw question.
8. No-candidate text says no matching catalog candidates were found under the recorded searches, not that no relevant dataset exists anywhere.

The implementation/validation owner should record which of these cases were actually exercised, distinguish authored fixtures from live public metadata probes, and keep later ingestion/schema profiling as a separate increment.
