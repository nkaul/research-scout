from research_scout.conversations import ConversationStore
from research_scout.timing import close_open_spans, copy_branch_span, finish_span, start_span


def test_measured_intervals_keep_overlap_and_never_retime_existing_receipt(monkeypatch):
    stamps = iter(
        [
            "2026-11-14T10:00:00+00:00",
            "2026-11-14T10:00:00.100000+00:00",
            "2026-11-14T10:00:00.250000+00:00",
            "2026-11-14T10:00:00.500000+00:00",
        ]
    )
    monkeypatch.setattr("research_scout.timing.now", lambda: next(stamps))
    turn = {}
    start_span(turn, "a", "provider", "Service wait")
    start_span(turn, "b", "review", "Model wait")
    finish_span(turn, "b", "completed")
    finish_span(turn, "a", "completed")
    first, second = turn["timing_spans"]
    assert first["duration_ms"] == 500 and second["duration_ms"] == 150
    assert sum(span["duration_ms"] for span in turn["timing_spans"]) > 500
    assert finish_span(turn, "a", "completed") == first  # no clock read/rewrite


def test_cancel_closes_local_wait_but_does_not_invent_remote_branch_end():
    turn = {}
    start_span(turn, "model", "planning", "Model wait")
    copy_branch_span(
        turn,
        "r1",
        "semantic",
        {"started_at": "2026-11-14T10:00:00+00:00", "status": "running"},
        provider="openalex",
        round_index=1,
    )
    close_open_spans(turn, "cancelled")
    local, remote = turn["timing_spans"]
    assert local["duration_ms"] >= 0 and local["status"] == "cancelled"
    assert remote["status"] == "cancelled"
    assert "completed_at" not in remote and "duration_ms" not in remote


def test_branch_cache_timings_preserve_original_bounds_and_reject_invalid_data():
    operation = {
        "started_at": "2026-11-14T10:00:00+00:00",
        "completed_at": "2026-11-14T10:00:00.010000+00:00",
        "duration_ms": 10,
        "status": "succeeded",
        "provenance": {"cache_hit": True},
    }
    turn = {}
    copy_branch_span(turn, "r1", "lexical", operation, provider="arxiv", round_index=2)
    copy_branch_span(turn, "r1", "lexical", operation, provider="arxiv", round_index=2)
    assert len(turn["timing_spans"]) == 1
    assert turn["timing_spans"][0]["cache_hit"] is True
    assert turn["timing_spans"][0]["duration_ms"] == 10
    for invalid in (
        {},
        {**operation, "duration_ms": float("nan")},
        {**operation, "started_at": "bad"},
    ):
        empty = {}
        copy_branch_span(empty, "r2", "lexical", invalid, provider="arxiv", round_index=1)
        assert "timing_spans" not in empty


def test_restart_marks_unknown_end_without_counting_downtime_or_faking_legacy():
    base = {"id": "old", "status": "SUCCEEDED", "sources": [], "warnings": []}
    turn = {
        "id": "new",
        "status": "RUNNING",
        "sources": [],
        "warnings": [],
        "timing_spans": [
            {
                "id": "llm:plan",
                "phase": "planning",
                "label": "Model wait",
                "started_at": "2026-11-14T10:00:00+00:00",
                "status": "running",
            }
        ],
        "retrieval": {
            "status": "planning",
            "llm_requests": [
                {
                    "step": "plan",
                    "status": "prepared",
                    "started_at": "2026-11-14T10:00:00+00:00",
                }
            ],
        },
    }
    document = {"status": "RUNNING", "revision": 1, "turns": [base, turn]}
    assert ConversationStore._recover(None, document)
    assert "timing_spans" not in base
    assert turn["timing_spans"][0]["status"] == "interrupted"
    assert "completed_at" not in turn["timing_spans"][0]
    assert "duration_ms" not in turn["timing_spans"][0]
    assert turn["retrieval"]["llm_requests"][0]["status"] == "interrupted"
