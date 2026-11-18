"""Additive, persisted observation intervals; overlapping work is never summed.

An interval measures the named local wait/execution scope, not upstream billing.
Old receipts have no intervals and must not be reconstructed from later reads.
"""

from datetime import datetime
from math import isfinite

from .contracts import now


def start_span(turn, span_id, phase, label, **context):
    spans = turn.setdefault("timing_spans", [])
    existing = next((span for span in spans if span["id"] == span_id), None)
    if existing is not None:
        return existing
    span = {
        "id": span_id,
        "phase": phase,
        "label": label,
        "started_at": now(),
        "status": "running",
        **context,
    }
    spans.append(span)
    return span


def finish_span(turn, span_id, status, *, duration_ms=None):
    span = next((s for s in turn.get("timing_spans", []) if s["id"] == span_id), None)
    if span is None or span.get("completed_at"):
        return span
    span.update(completed_at=now(), status=status)
    measured = (
        datetime.fromisoformat(span["completed_at"]) - datetime.fromisoformat(span["started_at"])
    ).total_seconds() * 1000
    span["duration_ms"] = max(0, measured if duration_ms is None else duration_ms)
    return span


def copy_branch_span(turn, run_id, branch, operation, *, provider, round_index):
    """Keep only provider-recorded timing; legacy/fixture events may lack it."""
    started = operation.get("started_at")
    if not isinstance(started, str):
        return
    try:
        if datetime.fromisoformat(started).tzinfo is None:
            return
        completed = operation.get("completed_at")
        if completed and datetime.fromisoformat(completed) < datetime.fromisoformat(started):
            return
        duration = operation.get("duration_ms")
        if duration is not None and (
            type(duration) not in (int, float) or not isfinite(duration) or duration < 0
        ):
            return
    except (TypeError, ValueError):
        return
    span_id = f"branch:{run_id}:{branch}"
    existing = next((s for s in turn.get("timing_spans", []) if s["id"] == span_id), None)
    fields = {
        "id": span_id,
        "phase": "retrieval",
        "label": f"{provider} {branch} branch (provider service)",
        "started_at": started,
        "status": operation.get("status", "running"),
        "provider": provider,
        "round": round_index,
        "run_id": run_id,
        "branch": branch,
        "cache_hit": bool(
            operation.get("provenance", {}).get("cache_hit")
            or operation.get("provenance", {}).get("cached_pool")
        ),
        **{k: operation[k] for k in ("completed_at", "duration_ms") if k in operation},
    }
    if existing is None:
        turn.setdefault("timing_spans", []).append(fields)
    else:
        existing.update(fields)


def close_open_spans(turn, status):
    """The local wait stopped; uncertain remote work remains accounted separately."""
    for span in turn.get("timing_spans", []):
        if not span.get("completed_at"):
            if span["phase"] == "retrieval":
                # A stopped client cannot assert when remote execution ended.
                span["status"] = status
            else:
                finish_span(turn, span["id"], status)
    for entry in turn.get("retrieval", {}).get("llm_requests", []):
        span = next(
            (s for s in turn.get("timing_spans", []) if s["id"] == f"llm:{entry['step']}"),
            None,
        )
        if span and span.get("completed_at") and not entry.get("completed_at"):
            entry.update(
                **{k: span[k] for k in ("started_at", "completed_at", "duration_ms")},
                status=status,
            )


def interrupt_open_spans(turn):
    """Recovery knows work stopped, but not when; do not count process downtime."""
    for span in turn.get("timing_spans", []):
        if not span.get("completed_at"):
            span["status"] = "interrupted"
    for entry in turn.get("retrieval", {}).get("llm_requests", []):
        if entry.get("started_at") and not entry.get("completed_at"):
            entry["status"] = "interrupted"
