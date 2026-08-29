#!/usr/bin/env python3
"""Import historical Codex prompts for the current repository into .ai-log.

The importer is deliberately local-only: it reads Codex JSONL transcripts and
appends normalized *user prompts* to the AI-log queue. It never calls the log
server and never changes files under ``~/.codex``. Use ``submit_log.py`` as a
separate, explicit step to upload the queued entries.

Examples:
    # Inspect count and time range only; no prompt text is printed or written.
    python scripts/log_codex_history.py --all --dry-run

    # Queue every previously unseen prompt from Codex sessions opened in this repo.
    python scripts/log_codex_history.py --all
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_SESSIONS_DIR = Path.home() / ".codex" / "sessions"
DEFAULT_LOG_DIR = Path(".ai-log")
PROMPT_LIMIT = 1000


@dataclass(frozen=True)
class SessionMetadata:
    """The small, non-message part of one Codex transcript."""

    session_id: str
    cwd: Path
    started_at: str
    model: str


@dataclass(frozen=True)
class ImportedPrompt:
    """One user prompt that is safe to queue for the existing log sender."""

    entry_id: str
    session_id: str
    timestamp: str
    model: str
    transcript_path: Path
    prompt: str


def git_value(*args: str) -> str:
    """Return a git value for the current repository without leaking stderr."""
    try:
        return subprocess.check_output(
            ["git", *args], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    """Yield valid JSON objects only; a malformed transcript line is skipped."""
    try:
        with path.open(encoding="utf-8") as file:
            for line in file:
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(item, dict):
                    yield item
    except (OSError, UnicodeDecodeError):
        return


def session_metadata(path: Path) -> SessionMetadata | None:
    """Read metadata without extracting any conversation content."""
    session_id = ""
    cwd = ""
    started_at = ""
    model = ""

    for item in read_jsonl(path):
        payload = item.get("payload")
        if not isinstance(payload, dict):
            continue

        if item.get("type") == "session_meta":
            session_id = str(payload.get("session_id") or payload.get("id") or "")
            cwd = str(payload.get("cwd") or "")
            started_at = str(payload.get("timestamp") or "")
        elif item.get("type") == "turn_context" and not model:
            model = str(payload.get("model") or "")

    if not session_id or not cwd:
        return None

    return SessionMetadata(
        session_id=session_id,
        cwd=Path(cwd).expanduser().resolve(strict=False),
        started_at=started_at,
        model=model,
    )


def prompt_id(session_id: str, message_index: int, prompt: str) -> str:
    """Use a deterministic ID so a second backfill cannot duplicate entries."""
    digest = hashlib.sha256(
        f"{session_id}:{message_index}:{prompt}".encode("utf-8")
    ).hexdigest()[:24]
    return f"codex-history-{digest}"


def iter_user_prompts(path: Path, metadata: SessionMetadata) -> Iterator[ImportedPrompt]:
    """Yield only Codex ``user`` text messages, never assistant/tool output."""
    message_index = 0
    for item in read_jsonl(path):
        payload = item.get("payload")
        if (
            item.get("type") != "response_item"
            or not isinstance(payload, dict)
            or payload.get("type") != "message"
            or payload.get("role") != "user"
        ):
            continue

        content = payload.get("content")
        if not isinstance(content, list):
            continue

        text_parts = [
            str(part.get("text") or "").strip()
            for part in content
            if isinstance(part, dict) and part.get("type") == "input_text"
        ]
        prompt = "\n".join(part for part in text_parts if part)
        if not prompt:
            continue

        message_index += 1
        yield ImportedPrompt(
            entry_id=prompt_id(metadata.session_id, message_index, prompt),
            session_id=metadata.session_id,
            timestamp=metadata.started_at,
            model=metadata.model,
            transcript_path=path,
            prompt=prompt[:PROMPT_LIMIT],
        )


def existing_entry_ids(log_dir: Path) -> set[str]:
    """Read identifiers only, from both pending and archived logs."""
    entry_ids: set[str] = set()
    paths = [log_dir / "session.jsonl"]
    archive_dir = log_dir / "archive"
    if archive_dir.exists():
        paths.extend(sorted(archive_dir.glob("*.jsonl")))

    for path in paths:
        for item in read_jsonl(path):
            entry_id = item.get("entry_id")
            if isinstance(entry_id, str) and entry_id:
                entry_ids.add(entry_id)
    return entry_ids


def to_log_entry(prompt: ImportedPrompt, repo: str, branch: str, commit: str, student: str) -> dict[str, str]:
    return {
        "ts": prompt.timestamp,
        "tool": "codex",
        "event": "UserPromptSubmit",
        "entry_id": prompt.entry_id,
        "session_id": prompt.session_id,
        "model": prompt.model,
        "repo": repo,
        "branch": branch,
        "commit": commit,
        "student": student,
        "prompt": prompt.prompt,
        "transcript_path": str(prompt.transcript_path),
        "source": "codex_history_import",
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Queue historical Codex prompts from this repository without contacting the log server."
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="scan all local Codex sessions; required to prevent accidental broad imports",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report counts and date range only; do not write logs",
    )
    parser.add_argument(
        "--sessions-dir",
        type=Path,
        default=DEFAULT_SESSIONS_DIR,
        help="Codex session directory (default: ~/.codex/sessions)",
    )
    parser.add_argument(
        "--log-dir",
        type=Path,
        default=DEFAULT_LOG_DIR,
        help="AI log directory (default: .ai-log)",
    )
    args = parser.parse_args()
    if not args.all:
        parser.error("pass --all explicitly to scan historical sessions")
    return args


def main() -> int:
    args = parse_args()
    repo_root = Path(git_value("rev-parse", "--show-toplevel") or Path.cwd()).resolve()
    sessions_dir = args.sessions_dir.expanduser().resolve(strict=False)
    log_dir = args.log_dir.expanduser().resolve(strict=False)

    if not sessions_dir.is_dir():
        print(f"[ai-log] Codex sessions directory not found: {sessions_dir}", file=sys.stderr)
        return 1

    transcript_paths = sorted(sessions_dir.rglob("*.jsonl"))
    imported_prompts: list[ImportedPrompt] = []
    matching_sessions = 0
    for transcript_path in transcript_paths:
        metadata = session_metadata(transcript_path)
        if metadata is None or metadata.cwd != repo_root:
            continue
        matching_sessions += 1
        imported_prompts.extend(iter_user_prompts(transcript_path, metadata))

    known_ids = existing_entry_ids(log_dir)
    pending_prompts = [prompt for prompt in imported_prompts if prompt.entry_id not in known_ids]
    timestamps = sorted(prompt.timestamp for prompt in imported_prompts if prompt.timestamp)

    print(f"[ai-log] Repository: {repo_root}")
    print(f"[ai-log] Matching Codex sessions: {matching_sessions}")
    print(f"[ai-log] Historical user prompts found: {len(imported_prompts)}")
    print(f"[ai-log] Already imported: {len(imported_prompts) - len(pending_prompts)}")
    print(f"[ai-log] New prompts to queue: {len(pending_prompts)}")
    if timestamps:
        print(f"[ai-log] Session time range: {timestamps[0]} → {timestamps[-1]}")

    if args.dry_run:
        print("[ai-log] Dry run complete. No local logs were changed; nothing was uploaded.")
        return 0

    if not pending_prompts:
        print("[ai-log] Nothing new to queue.")
        return 0

    repo_url = git_value("remote", "get-url", "origin")
    repo = repo_url.rstrip("/").split("/")[-1].removesuffix(".git")
    entries = [
        to_log_entry(
            prompt,
            repo=repo,
            branch=git_value("rev-parse", "--abbrev-ref", "HEAD"),
            commit=git_value("rev-parse", "--short", "HEAD"),
            student=git_value("config", "user.email"),
        )
        for prompt in pending_prompts
    ]

    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "session.jsonl"
    with log_file.open("a", encoding="utf-8") as file:
        for entry in entries:
            file.write(json.dumps(entry, ensure_ascii=False) + "\n")

    print(f"[ai-log] Queued {len(entries)} Codex prompts in {log_file}.")
    print("[ai-log] Nothing was uploaded. Run scripts/submit_log.py as a separate step when ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
