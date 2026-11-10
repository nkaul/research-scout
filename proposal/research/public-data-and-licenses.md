# Optional public-data discovery and license evidence

> **Historical source material — copied 25 October 2026.** This document originated in the GitHub Manager Research Scout work of 23 October 2026. Implementation statements, paths, commands, localhost addresses, test counts and budgets describe that original prototype or proposal, not an implementation in this repository. No code, credentials, data stores or spending authorization are transferred. See the [standalone project scope](../README.md) before using this material.


**Implemented catalog module; official sources checked 23 October 2026.** The
checks below concern publicly readable documentation and listing metadata. They
are not dataset downloads, production integration tests or a review of every
dataset on a provider.

Research Scout can suggest data alongside repositories when the user explicitly
selects providers. `backend/app/research/data_sources.py` is an offline, deterministic
catalog: it creates allowlisted provider links and, for matching terms, a few
curated listing cards. It makes no HTTP requests and uses no account, API token,
paid call, dataset download or login-wall crawler. There is no silent fallback
from an unavailable integration to a different credential or service.

## Implemented boundary and card meanings

`discover_data_sources(brief, selected_providers=None, limit=8)` returns no cards
without an explicit provider argument, even if the brief contains a historical
provider default. The application passes the current task's selected providers.
Canonical IDs and known display-name aliases are accepted; arbitrary URLs and
hosts are rejected. Results are bounded to at most 12, with one suggestion per
selected provider before extra links. The module uses `data_needs`, falling back
to the brief text, as a query of at most 200 characters; other profile fields are
not added to provider links.

Cards distinguish two kinds:

- `discovery_link`: a catalog/service starting point. No runtime search was made,
  no returned dataset was inspected, `verified_at` is null, and the dataset license
  remains unknown. Enigma and World Bank receive a portal link plus suggested
  query text because the module does not assume an authenticated search URL.
- `curated_dataset`: a named listing with statically reviewed official metadata.
  `verified_at` and `metadata_checked_at` record that documentation check, not a
  download or current availability/fitness test. The three entries are NEXRAD on
  AWS, OpenStreetMap on AWS, and the World Bank GDP (current US$) indicator. Exact
  keyword matches suggest candidates; they do not establish fit to the brief.

Every card carries `access`, a scoped `license` object, `reference_urls`, and an
explicit verification description. These remain discovery suggestions unless a
later admitted task actually inspects and records current evidence. A generated
provider link can contain user query text; following it is a separate user action
that sends that query to the named provider. Creating a card sends nothing.

## Provider capabilities and limits

| Provider | Verified discovery capability | Access and license limits |
| --- | --- | --- |
| AWS Open Data | Official registry, individual listing pages and YAML metadata | Third parties usually own and maintain the datasets. Inspect each resource, license and access method. |
| Kaggle | Dataset catalog and publisher-specified license information | API authentication requires an account. Download access and individual licenses vary; competition rules are separate. |
| Enigma | Current business-data Console and programmatic service | Account/plan/API-key service; potentially charged data retrieval. No anonymous open-data catalog or open license is inferred from the old `enigma.io` name. |
| data.gov | Government metadata catalog linking to publishers | Catalog records may describe restricted data. Publisher access and license terms determine reuse. |
| Hugging Face | Dataset search and dataset cards | Card license metadata is publisher supplied. Gated downloads require user access; a public card does not grant download or reuse rights. |
| World Bank | Indicator pages and documented Indicators API | Default open-data terms have additions and indicator/third-party exceptions. Other products can be restricted. |

### AWS: registry metadata is separate from the data

The [registry README](https://github.com/awslabs/open-data-registry/blob/main/README.md)
documents a YAML file per listing, including license, documentation and resource
metadata. The [registry's notice](https://registry.opendata.aws/) says datasets
have different maintainers and licenses. The registry repository's software
license therefore cannot be applied to the underlying datasets.

The [sponsorship FAQ](https://aws.amazon.com/opendata/faqs/) distinguishes sponsored
storage/distribution from other AWS services, such as compute and analytics, that
remain chargeable. A registry listing alone does not prove sponsorship or an
identical cost/access model. Scout does not construct S3 requests or start AWS
workloads.

The [NEXRAD listing](https://registry.opendata.aws/noaa-nexrad/) provides specific
NOAA NODD use terms and anonymous S3 access instructions. The module preserves
these as custom reported terms and does not invent an SPDX identifier. The
[OpenStreetMap listing](https://registry.opendata.aws/osm/) links its specific
[data license](https://www.openstreetmap.org/copyright): ODbL, with attribution and
database share-alike conditions. OSM software, documentation and hosted services
have separate terms and policies.

### Kaggle: dataset licenses and competition rules

Kaggle's [dataset documentation](https://www.kaggle.com/docs/datasets) describes
public/private visibility and individual license selection, including custom
terms. Its official [CLI authentication documentation](https://github.com/Kaggle/kaggle-cli/blob/main/docs/README.md#authentication)
requires a Kaggle account and documents supported authentication paths. Its
[competition guide](https://www.kaggle.com/docs/competitions) requires accepting
competition rules before downloads or submissions. Scout does none of these
account actions and does not treat a competition's data as a general open dataset.

### Enigma: a commercial service, not an assumed public-data mirror

Current official [Console documentation](https://documentation.enigma.com/console/)
describes business-data exploration and API keys after selecting a pricing plan.
The [pricing page](https://www.enigma.com/pricing) separates exploration from data
retrieval. A public-facing marketing page and free exploration do not establish
an open-data license. The module links to the service, labels access as commercial,
keeps dataset licensing unknown, and does not crawl Console or call its API.

### data.gov and CKAN: current API distinctions

The [Data.gov user guide](https://data.gov/user-guide/) describes a public catalog
JSON API. The linked [GSA Catalog API documentation](https://resources.data.gov/catalog-api/)
now documents the v4 gateway, an API-key path, and replacement of its prior CKAN
API. These documentation surfaces describe different access routes and should
not be reduced to a blanket claim that all Data.gov APIs require—or never
require—a key. The module only provides a catalog link and calls neither route.

For future metadata adapters, the official [CKAN API guide](https://docs.ckan.org/en/2.11/api/)
documents `package_search`/`package_show` and dataset license metadata. CKAN is
software used by many independently operated portals; its API shape, software
license or public metadata cannot establish a dataset's license. A future CKAN
integration must name and allowlist the actual portal; it must not accept an
arbitrary user-supplied URL.

### Hugging Face and World Bank

Hugging Face's [dataset-card documentation](https://huggingface.co/docs/hub/datasets-cards)
explains the license and context metadata. Its [gated-dataset documentation](https://huggingface.co/docs/hub/datasets-gated)
describes individual account access and authenticated downloads. The module
searches neither files nor private/gated content and never accepts terms for the
user.

World Bank [API documentation](https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures)
describes country/indicator queries. The specific [GDP indicator page](https://data.worldbank.org/indicator/NY.GDP.MKTP.CD)
reports CC BY 4.0. Its [summary terms](https://data.worldbank.org/summary-terms-of-use)
include additional conditions, attribution requirements, and dataset/third-party
exceptions. The card reports that indicator's license and retains these limits;
the generic portal card keeps its dataset license unknown.

## Code licenses and dataset licenses are separate questions

The task brief should collect the intended use and license constraints for each
target: software code/dependencies, data, and any hosted API/service. Commercial
intent is relevant context, not an automated clearance decision. A repository's
MIT or Apache license does not automatically cover bundled datasets, third-party
assets, pretrained models, database rights, trademarks or an API subscription.

`describe_license(identifier, scope="code" | "data")` only classifies a small
exact allowlist of reported identifiers. It uses standardized names from the
[SPDX License List](https://spdx.org/licenses/) to distinguish common permissive,
copyleft, attribution, share-alike and restricted-use categories. Recognition of
an identifier is not verification that it applies to a particular asset. This
helper does not scan license text, resolve a composite SPDX expression, infer an
ambiguous GPL variant, or decide legal compatibility.

Missing licenses, `NONE`, `NOASSERTION`, `no-license`, and unrecognized/custom
terms remain unknown. Unknown means no reuse permission has been established;
it never means permitted. Custom NOAA terms are reported separately. Source
versions, attribution, use restrictions, additional terms and intended
distribution need review before selecting a dataset or incorporating code.

## Validation and extension points

Offline tests cover opt-in, exact provider allowlisting, URL query encoding,
bounded deterministic results, mutable-state isolation, static metadata versus
unverified catalog links, specific license evidence, and unknown/composite
license handling. No live credentials are needed.

A future public-metadata adapter would require a separate admitted capability:
fixed endpoints, bounded metadata only, current terms/access checks, provenance
and physical request accounting. The current catalog does not imply that such an
adapter, authenticated dataset reader, download pipeline, or legal review has
already been implemented.
