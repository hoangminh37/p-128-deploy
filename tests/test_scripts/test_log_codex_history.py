"""Unit tests for the local-only Codex history importer."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

SCRIPT_PATH = Path(__file__).parents[2] / "scripts" / "log_codex_history.py"
SPEC = importlib.util.spec_from_file_location("log_codex_history", SCRIPT_PATH)
assert SPEC and SPEC.loader
history = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = history
SPEC.loader.exec_module(history)


def write_transcript(path: Path, cwd: Path) -> None:
    records = [
        {
            "type": "session_meta",
            "payload": {
                "session_id": "session-p128",
                "cwd": str(cwd),
                "timestamp": "2026-08-29T10:00:00Z",
            },
        },
        {"type": "turn_context", "payload": {"model": "gpt-5.6"}},
        {
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": "Câu hỏi của người dùng"}],
            },
        },
        {
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "assistant",
                "content": [{"type": "text", "text": "Không được import"}],
            },
        },
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(record) + "\n" for record in records), encoding="utf-8")


def test_importer_reads_only_user_text_and_has_stable_id(tmp_path: Path) -> None:
    transcript = tmp_path / "sessions" / "rollout.jsonl"
    repo_root = tmp_path / "P-128"
    repo_root.mkdir()
    write_transcript(transcript, repo_root)

    metadata = history.session_metadata(transcript)

    assert metadata is not None
    prompts = list(history.iter_user_prompts(transcript, metadata))
    assert [prompt.prompt for prompt in prompts] == ["Câu hỏi của người dùng"]
    assert prompts[0].entry_id == history.prompt_id("session-p128", 1, "Câu hỏi của người dùng")
    assert prompts[0].model == "gpt-5.6"


def test_existing_entry_ids_reads_pending_and_archive(tmp_path: Path) -> None:
    log_dir = tmp_path / ".ai-log"
    archive_dir = log_dir / "archive"
    archive_dir.mkdir(parents=True)
    (log_dir / "session.jsonl").write_text('{"entry_id": "pending"}\n', encoding="utf-8")
    (archive_dir / "2026-08-29.jsonl").write_text('{"entry_id": "archived"}\n', encoding="utf-8")

    assert history.existing_entry_ids(log_dir) == {"pending", "archived"}
