"""Authored fictional data: never an actual literature or provider-quality result."""

import asyncio

from .journal import ProviderError
from .normalization import source, unpaywall_access

FIXTURE_DOIS = {
    "crossref": "10.0000/scout.fixture.crossref.001",
    "datacite": "10.0000/scout.fixture.datacite.002",
}


def fixture_records(provider: str) -> dict[str, dict]:
    records = {}
    for number, label, year, kind in (
        (1, "Institutional AI readiness", 2024, "article"),
        (2, "Readiness and organizational capacity", 2025, "article"),
        (3, "Incomplete catalog example", None, "article"),
        (4, "Historical readiness review", 2018, "review"),
        (5, "Organizational preparedness and adoption", 2023, "article"),
        (6, "Survey design and capability assessment", 2022, "article"),
    ):
        rid = f"fixture-{number:03d}"
        records[rid] = source(
            provider,
            rid,
            "fixture",
            title=f"[FICTIONAL FIXTURE] {label}",
            authors=[] if number == 3 else ["Fictional Researcher A", "Fictional Researcher B"],
            year=year,
            venue=None if number == 3 else "Fictional Scout Journal",
            doi=FIXTURE_DOIS["crossref"]
            if number == 1
            else FIXTURE_DOIS["datacite"]
            if number == 2
            else None,
            url=f"https://example.org/research-scout/fixtures/{provider}/{rid}",
            abstract=None
            if number == 3
            else "Authored fictional metadata for testing Research Scout. It is not a paper or research finding.",
            resource_type=kind,
            fictional=True,
        )
    return records


class FixtureAdapter:
    def __init__(self, provider: str, semantic_delay: float = 0.85):
        self.provider, self.semantic_delay = provider, semantic_delay

    async def search(self, branch: str, request: dict) -> tuple[list[dict], dict]:
        query = request["query"].lower().strip()
        await asyncio.sleep(0.04 if branch == "lexical" else self.semantic_delay)
        if query == "fail-provider" or (query == "fail-semantic" and branch == "semantic"):
            raise ProviderError(
                "FIXTURE_PROVIDER_FAILURE", f"Controlled fictional {branch} failure."
            )
        rows = fixture_records(self.provider)
        keys = (
            ["fixture-001", "fixture-002", "fixture-003", "fixture-004"]
            if branch == "lexical"
            else ["fixture-002", "fixture-005", "fixture-006"]
        )
        values = [] if query == "empty" else [rows[key] for key in keys]
        return values[: request["limits"]["per_branch"]], {
            "query": request.get(f"{branch}_query") or request["query"],
            "fictional": True,
            "semantic_execution": "authored_fixture_not_model" if branch == "semantic" else None,
        }

    async def details(self, record_id: str) -> dict:
        record_id = record_id.removeprefix(f"{self.provider}:")
        rows = fixture_records(self.provider)
        if record_id not in rows:
            raise ProviderError("NOT_FOUND", "No such authored fixture record.", 404)
        return rows[record_id]

    async def agency(self, doi: str) -> str | None:
        if doi in FIXTURE_DOIS.values():
            return "crossref" if doi == FIXTURE_DOIS["crossref"] else "datacite"
        return None

    async def metadata(self, doi: str) -> dict:
        if doi != FIXTURE_DOIS[self.provider]:
            raise ProviderError("NOT_FOUND", "No such DOI in the fictional registry fixtures.", 404)
        record = source(
            self.provider,
            doi,
            "fixture",
            title="[FICTIONAL FIXTURE] Registry title differs from discovery",
            authors=["Fictional Registry Author"],
            year=2024,
            venue="Fictional Registry",
            doi=doi,
            url=f"https://example.org/research-scout/fixtures/{self.provider}/record",
            resource_type="article" if self.provider == "crossref" else "Dataset",
            fictional=True,
        )
        return record

    async def access(self, doi: str) -> dict:
        if self.provider != "unpaywall":
            raise ProviderError(
                "CAPABILITY_UNAVAILABLE", "This fixture does not own access lookup.", 400
            )
        record = unpaywall_access(
            {
                "doi": doi,
                "is_oa": True,
                "oa_status": "green",
                "best_oa_location": {
                    "url": "https://example.org/research-scout/fixture-open-copy",
                    "host_type": "repository",
                    "version": "acceptedVersion",
                },
                "oa_locations": [],
            },
            doi,
        )
        record.update(mode="fixture", fictional=True)
        return record
