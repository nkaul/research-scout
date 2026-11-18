"""Main-search ownership of independently persisted dataset/repository work."""

import asyncio

from .contracts import now
from .dataset_contracts import DatasetSearchRequest
from .repo_contracts import RepoSearchRequest
from .store import TERMINAL


def initial_jobs(limits, providers, *, agentic):
    return {
        lane: {
            "status": "DISABLED" if not limit else "QUEUED",
            "phase": "disabled" if not limit else "waiting_for_plan" if agentic else "queued",
            "limit": limit,
            "search_id": None,
            "record_count": 0,
            "candidate_count": 0,
            "providers": ["hugging_face", "datacite"]
            if lane == "datasets"
            else ["github"]
            if lane == "repos"
            else [
                provider for provider in providers if (provider == "youtube") == (lane == "videos")
            ],
            "reason": "Disabled by the search resource limits." if not limit else None,
        }
        for lane, limit in limits.items()
    }


def select_canonical(turn, papers):
    limits = turn.get("modality_limits")
    if not limits:
        return papers
    selected, overflow = [], []
    for lane in ("papers", "videos", "datasets", "repos"):

        def kind(paper):
            source = paper["representative"]
            return (
                "videos"
                if source.get("resource_type") == "video" or source["provider"] == "youtube"
                else "datasets"
                if source.get("resource_type") == "dataset"
                else "repos"
                if source.get("resource_type") == "repository"
                else "papers"
            )

        cohort = [paper for paper in papers if kind(paper) == lane]
        selected.extend(cohort[: limits[lane]])
        overflow.extend(cohort[limits[lane] :])
        if lane in {"papers", "videos"}:
            job = turn["resource_jobs"][lane]
            job.update(
                record_count=min(len(cohort), limits[lane]),
                eligible_count=len(cohort),
                overflow_count=max(0, len(cohort) - limits[lane]),
                candidate_limit_per_provider=limits[lane],
                selection_scope="unique eligible canonical resources; separate provider observations retained",
            )
            if job.get("error"):
                continue
            job["providers"] = [
                provider
                for provider in turn["providers"]
                if (provider == "youtube") == (lane == "videos")
            ]
            if not job["limit"]:
                continue
            own = [
                op
                for op in turn.get("_operations", {}).values()
                if op.get("operation") == "hybrid_search" and op.get("provider") in job["providers"]
            ]
            seen = {op["provider"] for op in own}
            quality = (turn.get("retrieval") or {}).get("provider_quality", {})
            review_pending = turn.get("agentic") and any(
                provider not in quality
                or quality[provider]["round"]
                < max(
                    [
                        1,
                        *[
                            entry["round"]
                            for entry in (turn.get("retrieval") or {}).get("query_history", [])
                            if entry.get("provider") == provider
                        ],
                    ]
                )
                for provider in job["providers"]
            )
            bad = any(
                op.get("status") not in {"SUCCEEDED", "EMPTY"} and op.get("status") in TERMINAL
                for op in own
            ) or any(
                quality.get(provider, {}).get("status") == "review_failed"
                for provider in job["providers"]
            )
            active = (
                any(op.get("status") not in TERMINAL for op in own)
                or seen != set(job["providers"])
                or review_pending
            )
            if job["providers"] and not active:
                job.update(
                    status="PARTIAL"
                    if bad and cohort
                    else "FAILED"
                    if bad
                    else "SUCCEEDED"
                    if cohort
                    else "EMPTY",
                    phase="finished",
                )
    turn["result_selection"] = {
        "paper_ids": [paper["paper_id"] for paper in selected],
        "overflow_paper_ids": [paper["paper_id"] for paper in overflow],
        "overflow_count": len(overflow),
        "reason": "Requested resource caps; overflow remains attributable in saved provider runs and source observations.",
    }
    return selected


class MainResources:
    def __init__(self, core):
        self.core = core
        self.lock = asyncio.Lock()
        self.tasks = {}

    async def start(self, conversation_id, turn_id):
        async with self.lock:
            turn = await self.core.conversations._turn(conversation_id, turn_id)
            if not turn.get("modality_limits") or turn["status"] in TERMINAL:
                return
            for lane, manager, schema in [
                ("datasets", self.core.datasets, DatasetSearchRequest),
                ("repos", self.core.repos, RepoSearchRequest),
            ]:
                job = turn["resource_jobs"][lane]
                if (
                    not job["limit"]
                    or job.get("search_id")
                    or job["status"] not in {"QUEUED", "RUNNING"}
                ):
                    continue
                try:
                    await self.core.conversations._edit(
                        conversation_id,
                        turn_id,
                        lambda item, lane=lane: item["resource_jobs"][lane].update(
                            phase="admitting"
                        ),
                        "resource.admitting",
                    )
                    request = schema(
                        conversation_id=conversation_id,
                        turn_id=turn_id,
                        limit=job["limit"],
                        idempotency_key=f"main:{conversation_id}:{turn_id}:{lane}",
                    )
                    saved = await manager.create(request, launch=False)
                    current = await self.core.conversations._turn(conversation_id, turn_id)
                    if current["status"] in TERMINAL:
                        await manager.cancel(saved["id"])
                        continue
                    await self.core.conversations._edit(
                        conversation_id,
                        turn_id,
                        lambda item, lane=lane, saved=saved: item["resource_jobs"][lane].update(
                            search_id=saved["id"],
                            status="RUNNING",
                            phase="retrieving",
                            started_at=now(),
                        ),
                        "resource.admitted",
                    )
                    manager.launch(saved["id"])
                    key = (conversation_id, turn_id, lane)
                    self.tasks[key] = asyncio.create_task(
                        self._watch(conversation_id, turn_id, lane, manager, saved["id"])
                    )
                except asyncio.CancelledError:
                    raise
                except Exception as failure:
                    await self.core.conversations._edit(
                        conversation_id,
                        turn_id,
                        lambda item, lane=lane, failure=failure: item["resource_jobs"][lane].update(
                            status="FAILED",
                            phase="finished",
                            error={
                                "code": "RESOURCE_ADMISSION_FAILED",
                                "message": str(failure)
                                if isinstance(failure, ValueError)
                                or getattr(failure, "status", None)
                                else "Independent resource admission failed; no fallback or retry was attempted.",
                            },
                        ),
                        "resource.failed",
                    )

    async def _watch(self, conversation_id, turn_id, lane, manager, identity):
        cursor = None
        while True:
            async with manager.store.changed:
                saved = await manager.get(identity)
                if saved["cursor"] != cursor:
                    cursor = saved["cursor"]

                    def publish(item, saved=saved):
                        job = item["resource_jobs"][lane]
                        job.update(
                            status=saved["status"],
                            phase="finished" if saved["status"] in TERMINAL else "retrieving",
                            record_count=len(saved["records"]),
                            candidate_count=sum(
                                record.get("match", {}).get("status") == "candidate"
                                for record in saved["records"]
                            ),
                            provider_activity=saved["provider_activity"],
                            usage=saved["usage"],
                            warnings=saved["warnings"],
                        )
                        if saved.get("completed_at"):
                            job["completed_at"] = saved["completed_at"]

                    await self.core.conversations._edit(
                        conversation_id, turn_id, publish, "resource.updated"
                    )
                if saved["status"] in TERMINAL:
                    return
                try:
                    await asyncio.wait_for(manager.store.changed.wait(), timeout=5)
                except TimeoutError:
                    pass

    async def wait(self, conversation_id, turn_id):
        work = [
            task
            for (cid, tid, _), task in self.tasks.items()
            if (cid, tid) == (conversation_id, turn_id)
        ]
        if work:
            try:
                await asyncio.gather(*work)
            finally:
                self.tasks = {key: task for key, task in self.tasks.items() if not task.done()}

    async def stop(self, conversation_id, turn_id):
        # Reconcile the persisted create-before-parent-link window, without work replay.
        for lane, manager in [("datasets", self.core.datasets), ("repos", self.core.repos)]:
            async with manager.store.lock:
                owned = [
                    saved["id"]
                    for saved in manager.store.runs.values()
                    if saved.get("_idempotency_key") == f"main:{conversation_id}:{turn_id}:{lane}"
                    and saved["status"] not in TERMINAL
                ]
            for identity in owned:
                await manager.cancel(identity)
            task = self.tasks.get((conversation_id, turn_id, lane))
            if task and not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
            self.tasks.pop((conversation_id, turn_id, lane), None)

    async def finish_literature(self, conversation_id, turn_id, *, failure=None):
        turn = await self.core.conversations._turn(conversation_id, turn_id)
        if not turn.get("modality_limits"):
            return

        def finished(item):
            for lane in ("papers", "videos"):
                job = item["resource_jobs"][lane]
                if not job["limit"]:
                    continue
                own = [
                    op
                    for op in item["_operations"].values()
                    if op.get("operation") == "hybrid_search"
                    and op.get("provider") in job["providers"]
                ]
                bad = (
                    failure
                    or any(op.get("status") not in {"SUCCEEDED", "EMPTY"} for op in own)
                    or any(
                        (item.get("retrieval") or {})
                        .get("provider_quality", {})
                        .get(provider, {})
                        .get("status")
                        == "review_failed"
                        for provider in job["providers"]
                    )
                )
                job.update(
                    status="PARTIAL"
                    if bad and job["record_count"]
                    else "FAILED"
                    if bad
                    else "SUCCEEDED"
                    if job["record_count"]
                    else "EMPTY",
                    phase="finished",
                    candidate_count=sum(
                        len((self.core.store.runs.get(run_id) or {}).get("entities", []))
                        for run_id in item["run_ids"]
                        if (self.core.store.runs.get(run_id) or {}).get("provider")
                        in job["providers"]
                    ),
                )
                if not job["providers"]:
                    job.update(
                        status="BLOCKED",
                        reason="No selected ready provider serves this enabled resource lane.",
                    )
                if failure:
                    job["error"] = {
                        "code": "LITERATURE_INCOMPLETE",
                        "message": "Literature retrieval/review stopped; independent Data/Repos work continued.",
                    }
            for lane in ("datasets", "repos"):
                job = item["resource_jobs"][lane]
                if job["status"] == "QUEUED":
                    job.update(
                        status="BLOCKED",
                        phase="finished",
                        reason="The AI plan did not become usable; no resource query was dispatched.",
                    )

        await self.core.conversations._edit(
            conversation_id, turn_id, finished, "resources.literature_finished"
        )
