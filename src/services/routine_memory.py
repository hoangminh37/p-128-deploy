"""Persistent routine memory, sourced only from explicit patient statements."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.models.domain import PatientRoutineMemory

MAX_ENTRIES = 24
MAX_FACT_CHARS = 280
ROUTINE_CATEGORIES = {
    "activity",
    "diet",
    "medication_routine",
    "measurement_routine",
    "self_care",
    "sleep",
}


def _compact(text: str) -> str:
    return " ".join(text.split())


def validate_routine_updates(raw_updates: object, *, source_text: str) -> list[dict[str, str]]:
    """Accept only verbatim facts from the current patient message.

    The LLM may classify a routine, but it cannot invent the stored fact: the
    evidence string must occur in the patient's request and is stored verbatim.
    """
    if not isinstance(raw_updates, list):
        return []

    updates: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for raw in raw_updates:
        if not isinstance(raw, dict):
            continue
        category = raw.get("category")
        evidence = raw.get("evidence")
        if not isinstance(category, str) or not isinstance(evidence, str):
            continue
        category = category.strip().lower()
        fact = _compact(evidence)
        if category not in ROUTINE_CATEGORIES or not 5 <= len(fact) <= MAX_FACT_CHARS:
            continue
        if fact.casefold() not in _compact(source_text).casefold():
            continue
        key = (category, fact.casefold())
        if key not in seen:
            seen.add(key)
            updates.append({"category": category, "fact": fact})
    return updates


def format_routine_memory(entries: list[dict[str, Any]]) -> str:
    """Format stored facts for prompts without exposing internal IDs/timestamps."""
    facts = [
        f"- {entry.get('category', 'routine')}: {entry.get('fact', '')}"
        for entry in entries
        if isinstance(entry, dict) and entry.get("fact")
    ]
    return "\n".join(facts) if facts else "Chưa có routine do người bệnh tự ghi nhận."


async def load_routine_memory(db: AsyncSession, patient_id: str) -> list[dict[str, Any]]:
    result = await db.execute(select(PatientRoutineMemory).filter(PatientRoutineMemory.patient_id == patient_id))
    memory = result.scalars().first()
    if not memory or not isinstance(memory.entries, list):
        return []
    return [entry for entry in memory.entries if isinstance(entry, dict)][-MAX_ENTRIES:]


async def record_routine_updates(
    db: AsyncSession,
    *,
    patient_id: str,
    raw_updates: object,
    source_text: str,
) -> int:
    """Merge deduplicated entries; caller owns the surrounding transaction."""
    updates = validate_routine_updates(raw_updates, source_text=source_text)
    if not updates:
        return 0

    result = await db.execute(select(PatientRoutineMemory).filter(PatientRoutineMemory.patient_id == patient_id))
    memory = result.scalars().first()
    if memory is None:
        memory = PatientRoutineMemory(patient_id=patient_id, entries=[])
        db.add(memory)
        entries: list[dict[str, Any]] = []
    else:
        entries = [entry for entry in memory.entries if isinstance(entry, dict)] if isinstance(memory.entries, list) else []

    now = datetime.now(UTC).isoformat()
    existing = {
        (str(entry.get("category", "")), _compact(str(entry.get("fact", ""))).casefold()): entry
        for entry in entries
    }
    added = 0
    for update in updates:
        key = (update["category"], update["fact"].casefold())
        if key in existing:
            existing[key]["last_confirmed_at"] = now
            continue
        entry = {
            "id": f"routine_{uuid4().hex[:10]}",
            "category": update["category"],
            "fact": update["fact"],
            "source": "patient_stated",
            "recorded_at": now,
            "last_confirmed_at": now,
        }
        entries.append(entry)
        existing[key] = entry
        added += 1

    entries.sort(key=lambda entry: str(entry.get("last_confirmed_at", "")))
    memory.entries = entries[-MAX_ENTRIES:]
    memory.updated_at = datetime.now(UTC)
    return added
