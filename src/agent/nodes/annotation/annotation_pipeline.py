"""Detect and explain unfamiliar medical terms without delaying chat delivery.

The annotation pipeline deliberately runs after the answer SSE ``done`` event.
It does not maintain a fixed medical-word list: a deterministic LLM pass first
finds the specialist language *actually used in the approved answer*. A second,
batched LLM call then explains only terms for which an approved-document excerpt
can be found. This keeps the patient answer fast while avoiding ungrounded
tooltips.
"""

from __future__ import annotations

import asyncio
import json
import re
from collections import OrderedDict
from dataclasses import dataclass
from functools import lru_cache
from hashlib import sha256
from time import monotonic
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from src.agent.prompts.term_detect import term_detect_prompt
from src.agent.prompts.term_explain import term_explain_prompt
from src.core.logging import get_logger
from src.rag.store import VectorStore
from src.services.llm.factory import get_fast_llm

logger = get_logger(__name__)

# These are product limits, not a vocabulary. The detector can inspect more
# candidates than the UI shows, then discard malformed/overlapping candidates
# before choosing the most useful six terms.
MAX_DETECTION_CANDIDATES = 12
MAX_TERMS = 6
DEFINITION_TOP_K = 2
MAX_SOURCE_CHARS = 1_200
ANNOTATION_TIMEOUT = 10.0
VECTOR_SEARCH_TIMEOUT = 3.0
CACHE_MAX_ENTRIES = 256
CACHE_TTL_SECONDS = 86_400.0
_DIFFICULTY_PRIORITY = {"high": 0, "medium": 1, "low": 2}

# Citation markers and Markdown code never represent patient-facing medical
# prose. Replacing matches with equally long whitespace keeps offsets valid.
_SKIP_PATTERN = re.compile(r"\[\d+\]|```.*?```|`[^`]+`", re.DOTALL)
_WHITESPACE_RE = re.compile(r"\s+")
_UNSAFE_ADVICE_RE = re.compile(
    r"\b(?:hãy|nên|cần)\s+(?:uống|dùng|tiêm|ngừng|tăng|giảm)\b|\b(?:liều|kê đơn)\b",
    re.IGNORECASE,
)


class DetectedTerm(BaseModel):
    """The narrow JSON contract returned by the term detector."""

    phrase: str = Field(min_length=1, max_length=160)
    canonical_term: str = Field(min_length=1, max_length=160)
    difficulty: Literal["high", "medium", "low"]


class ExplainedTerm(BaseModel):
    """One explanation returned by the single batched explanation call."""

    id: str = Field(min_length=1, max_length=32)
    source_id: str | None = Field(default=None, max_length=48)
    explanation: str = Field(default="", max_length=280)
    skip: bool = False


@dataclass(frozen=True)
class DefinitionSource:
    """An approved-document excerpt that may support one tooltip."""

    source_id: str
    content: str
    chunk_id: str
    document_id: str | None


@dataclass
class TermAnnotation:
    term: str
    start_offset: int
    end_offset: int
    short_explanation: str
    source_chunk_id: str
    source_document_id: str | None

    def to_dict(self) -> dict:
        return {
            "term": self.term,
            # JavaScript indexes strings in UTF-16 code units. Convert from
            # Python's Unicode-character indexes so hover stays on the right
            # phrase even when an answer contains emoji before the term.
            "start_offset": self.start_offset,
            "end_offset": self.end_offset,
            "short_explanation": self.short_explanation,
            "source_chunk_id": self.source_chunk_id,
            "source_document_id": self.source_document_id,
        }


# Cache only approved-document excerpts and grounded explanations. It avoids
# repeating a vector lookup/LLM call for the same term during a server process;
# it is neither a hardcoded glossary nor a source of truth.
_definition_cache: OrderedDict[str, tuple[float, tuple[DefinitionSource, ...]]] = OrderedDict()
_explanation_cache: OrderedDict[str, tuple[float, str]] = OrderedDict()


def _normalise(value: str) -> str:
    return _WHITESPACE_RE.sub(" ", value).strip().casefold()


def _utf16_offset(value: str, python_offset: int) -> int:
    return len(value[:python_offset].encode("utf-16-le")) // 2


def _cache_get(cache: OrderedDict, key: str):
    value = cache.get(key)
    if value is None:
        return None
    expires_at, payload = value
    if expires_at <= monotonic():
        del cache[key]
        return None
    cache.move_to_end(key)
    return payload


def _cache_set(cache: OrderedDict, key: str, payload: object) -> None:
    cache[key] = (monotonic() + CACHE_TTL_SECONDS, payload)
    cache.move_to_end(key)
    while len(cache) > CACHE_MAX_ENTRIES:
        cache.popitem(last=False)


def _json_array(raw: str) -> list[object]:
    """Extract one JSON array without accepting surrounding model prose."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE).rstrip("`").strip()
    start, end = cleaned.find("["), cleaned.rfind("]")
    if start < 0 or end < start:
        return []
    parsed = json.loads(cleaned[start : end + 1])
    return parsed if isinstance(parsed, list) else []


def _parse_detections(raw: str) -> list[DetectedTerm]:
    try:
        payload = _json_array(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return []

    detections: list[DetectedTerm] = []
    for item in payload[:MAX_DETECTION_CANDIDATES]:
        try:
            detections.append(DetectedTerm.model_validate(item))
        except ValidationError:
            continue
    return detections


async def _detect_terms(answer: str, query: str) -> list[DetectedTerm]:
    """Detect all potentially confusing specialist terms from this answer."""
    if not answer.strip():
        return []

    try:
        result = await (term_detect_prompt | get_fast_llm()).ainvoke({"query": query, "answer": answer})
        detections = _parse_detections(str(result.content))
        logger.info("[term_annotation] detected %d candidates", len(detections))
        return detections
    except Exception as exc:
        logger.warning("[term_annotation] detection failed: %s", exc)
        return []


def _find_phrase_in_answer(answer: str, phrase: str) -> tuple[int, int] | None:
    """Find one visible phrase while accepting harmless whitespace variation."""
    clean = _SKIP_PATTERN.sub(lambda match: " " * len(match.group()), answer)
    parts = [re.escape(part) for part in _WHITESPACE_RE.split(phrase.strip()) if part]
    if not parts:
        return None
    pattern = re.compile(r"(?<!\w)" + r"\s+".join(parts) + r"(?!\w)", re.IGNORECASE)
    match = pattern.search(clean)
    return (match.start(), match.end()) if match else None


def _validate_detections(answer: str, raw_detections: list[DetectedTerm]) -> list[dict]:
    """Validate and select the most difficult terms without a fixed vocabulary.

    The detector may return units and broad phrases before a high-difficulty
    abbreviation that appears later in the answer.  Rank by the detector's
    own difficulty signal first, preserving text order within each level, so a
    six-tooltip UI budget is spent on the concepts patients most need help
    understanding.  This is ranking policy, not a medical-term whitelist.
    """
    valid: list[dict] = []
    used_ranges: list[tuple[int, int]] = []
    seen_concepts: set[tuple[str, int]] = set()

    ranked_detections = sorted(
        enumerate(raw_detections),
        key=lambda entry: (_DIFFICULTY_PRIORITY[entry[1].difficulty], entry[0]),
    )
    for _, item in ranked_detections:
        phrase = item.phrase.strip()
        canonical = item.canonical_term.strip()
        offsets = _find_phrase_in_answer(answer, phrase)
        if offsets is None:
            continue

        start, end = offsets
        concept_key = (_normalise(canonical), start)
        overlaps = any(not (end <= used_start or start >= used_end) for used_start, used_end in used_ranges)
        if concept_key in seen_concepts or overlaps:
            continue

        seen_concepts.add(concept_key)
        used_ranges.append((start, end))
        valid.append(
            {
                "id": f"term_{len(valid) + 1}",
                "phrase": answer[start:end],
                "canonical_term": canonical,
                "difficulty": item.difficulty,
                "start": start,
                "end": end,
            }
        )
    return valid[:MAX_TERMS]


def _excerpt_near_term(content: str, terms: tuple[str, ...]) -> str:
    """Keep enough surrounding context to define the term, not just its mention."""
    lower_content = content.casefold()
    positions = [lower_content.find(term.casefold()) for term in terms if term]
    position = next((index for index in positions if index >= 0), -1)
    if position < 0:
        return content[:MAX_SOURCE_CHARS]

    start = max(0, position - 360)
    end = min(len(content), position + MAX_SOURCE_CHARS - 360)
    return content[start:end].strip()


def _sources_from_answer_chunks(term: str, phrase: str, answer_chunks: list[dict]) -> list[DefinitionSource]:
    terms = tuple(dict.fromkeys(filter(None, (_normalise(term), _normalise(phrase)))))
    ranked: list[tuple[int, str, DefinitionSource]] = []

    for index, chunk in enumerate(answer_chunks):
        content = str(chunk.get("content", "")).strip()
        if not content:
            continue
        normalised_content = _normalise(content)
        matched = sum(1 for value in terms if value and value in normalised_content)
        if not matched:
            continue
        chunk_id = str(chunk.get("chunk_id") or "")
        source = DefinitionSource(
            source_id=f"answer_{index + 1}",
            content=_excerpt_near_term(content, terms),
            chunk_id=chunk_id,
            document_id=chunk.get("document_id") or None,
        )
        # Exact phrase is stronger than merely a canonical alias. Chunk ID is
        # a deterministic tie-breaker, so the same answer uses the same source.
        ranked.append((matched, chunk_id, source))

    ranked.sort(key=lambda item: (-item[0], item[1]))
    return [item[2] for item in ranked[:DEFINITION_TOP_K]]


@lru_cache(maxsize=1)
def _definition_store() -> VectorStore:
    return VectorStore()


def _search_definition_sync(term: str) -> tuple[DefinitionSource, ...]:
    """Use the approved vector store only when answer context lacks a definition."""
    hits = _definition_store().search(
        query=f"Định nghĩa và giải thích thuật ngữ y khoa: {term}",
        top_k=DEFINITION_TOP_K,
        min_similarity=0.25,
    )
    return tuple(
        DefinitionSource(
            source_id=f"library_{index + 1}",
            content=_excerpt_near_term(hit.text, (_normalise(term),)),
            chunk_id=hit.chunk_id,
            document_id=hit.metadata.get("doc_id") or None,
        )
        for index, hit in enumerate(hits)
        if hit.text.strip()
    )


async def _retrieve_definition(
    term: str,
    phrase: str,
    answer_chunks: list[dict],
    search_limit: asyncio.Semaphore,
) -> list[DefinitionSource]:
    sources = _sources_from_answer_chunks(term, phrase, answer_chunks)
    if sources:
        return sources

    key = _normalise(term)
    cached = _cache_get(_definition_cache, key)
    if cached is not None:
        return list(cached)

    try:
        async with search_limit:
            sources = list(
                await asyncio.wait_for(asyncio.to_thread(_search_definition_sync, term), timeout=VECTOR_SEARCH_TIMEOUT)
            )
    except Exception as exc:
        logger.info("[term_annotation] no definition source for %r: %s", term, exc)
        return []

    if sources:
        _cache_set(_definition_cache, key, tuple(sources))
    return sources


def _explanation_cache_key(term: str, source: DefinitionSource) -> str:
    evidence_digest = sha256(source.content.encode("utf-8")).hexdigest()[:16]
    return f"{_normalise(term)}|{source.chunk_id}|{evidence_digest}"


def _explanation_prompt_input(terms_with_sources: list[tuple[dict, list[DefinitionSource]]]) -> tuple[str, str]:
    terms = [
        {
            "id": item["id"],
            "term": item["canonical_term"],
            "displayed_as": item["phrase"],
            "context": item["context_sentence"],
        }
        for item, _ in terms_with_sources
    ]
    evidence_lines: list[str] = []
    for item, sources in terms_with_sources:
        evidence_lines.append(f"TERM {item['id']}")
        for source in sources:
            evidence_lines.append(f"[{source.source_id}] {source.content}")
    return json.dumps(terms, ensure_ascii=False), "\n\n".join(evidence_lines)


def _parse_explanations(raw: str) -> list[ExplainedTerm]:
    try:
        payload = _json_array(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return []

    explanations: list[ExplainedTerm] = []
    for item in payload:
        try:
            explanations.append(ExplainedTerm.model_validate(item))
        except ValidationError:
            continue
    return explanations


def _verify_explanation(explanation: str, source: DefinitionSource) -> bool:
    """Keep tooltip copy short, descriptive and free of treatment instructions."""
    compact = _WHITESPACE_RE.sub(" ", explanation).strip()
    return bool(
        source.content
        and 12 <= len(compact) <= 280
        and len(re.findall(r"[.!?]", compact)) <= 2
        and not _UNSAFE_ADVICE_RE.search(compact)
    )


async def _generate_explanations(
    terms_with_sources: list[tuple[dict, list[DefinitionSource]]],
) -> dict[str, tuple[str, DefinitionSource]]:
    """Generate every uncached tooltip in one deterministic LLM request."""
    resolved: dict[str, tuple[str, DefinitionSource]] = {}
    pending: list[tuple[dict, list[DefinitionSource]]] = []

    for term, sources in terms_with_sources:
        cache_key = _explanation_cache_key(term["canonical_term"], sources[0])
        cached = _cache_get(_explanation_cache, cache_key)
        if cached is not None:
            resolved[term["id"]] = (cached, sources[0])
        else:
            pending.append((term, sources))

    if not pending:
        return resolved

    terms_json, evidence = _explanation_prompt_input(pending)
    try:
        result = await (term_explain_prompt | get_fast_llm()).ainvoke(
            {"terms_json": terms_json, "definition_evidence": evidence}
        )
    except Exception as exc:
        logger.warning("[term_annotation] explanation batch failed: %s", exc)
        return resolved

    pending_by_id = {term["id"]: (term, sources) for term, sources in pending}
    for explanation in _parse_explanations(str(result.content)):
        if explanation.skip or not explanation.explanation or not explanation.source_id:
            continue
        entry = pending_by_id.get(explanation.id)
        if entry is None:
            continue
        term, sources = entry
        source = next((item for item in sources if item.source_id == explanation.source_id), None)
        compact = _WHITESPACE_RE.sub(" ", explanation.explanation).strip()
        if source is None or not _verify_explanation(compact, source):
            continue
        resolved[term["id"]] = (compact, source)
        _cache_set(_explanation_cache, _explanation_cache_key(term["canonical_term"], source), compact)

    return resolved


def _context_sentence(answer: str, start: int, end: int) -> str:
    sentence_start = max(answer.rfind(".", 0, start), answer.rfind("!", 0, start), answer.rfind("?", 0, start))
    sentence_start = 0 if sentence_start < 0 else sentence_start + 1
    sentence_end_matches = [answer.find(boundary, end) for boundary in (".", "!", "?")]
    sentence_end = min((value for value in sentence_end_matches if value >= 0), default=len(answer))
    return answer[sentence_start:sentence_end].strip()[:300]


async def run_annotation_pipeline(
    answer: str,
    query: str,
    answer_chunks: list[dict] | None = None,
) -> list[dict]:
    """Return grounded annotations, or ``[]`` without affecting the chat turn."""
    try:
        return await asyncio.wait_for(_pipeline(answer, query, answer_chunks or []), timeout=ANNOTATION_TIMEOUT)
    except TimeoutError:
        logger.info("[term_annotation] stopped after %.0fs without delaying chat", ANNOTATION_TIMEOUT)
        return []
    except Exception as exc:
        logger.warning("[term_annotation] pipeline error: %s", exc)
        return []


async def _pipeline(answer: str, query: str, answer_chunks: list[dict]) -> list[dict]:
    detected = await _detect_terms(answer, query)
    validated = _validate_detections(answer, detected)
    if not validated:
        return []

    for item in validated:
        item["context_sentence"] = _context_sentence(answer, item["start"], item["end"])

    # Only vector fallbacks are throttled. Local answer-chunk evidence needs no
    # network call and returns immediately; independent fallbacks can overlap.
    search_limit = asyncio.Semaphore(2)
    source_lists = await asyncio.gather(
        *(
            _retrieve_definition(item["canonical_term"], item["phrase"], answer_chunks, search_limit)
            for item in validated
        )
    )
    terms_with_sources = [(item, sources) for item, sources in zip(validated, source_lists, strict=True) if sources]
    if not terms_with_sources:
        return []

    explanations = await _generate_explanations(terms_with_sources)
    annotations: list[dict] = []
    for term, _ in terms_with_sources:
        resolved = explanations.get(term["id"])
        if resolved is None:
            continue
        explanation, source = resolved
        annotations.append(
            TermAnnotation(
                term=term["phrase"],
                start_offset=_utf16_offset(answer, term["start"]),
                end_offset=_utf16_offset(answer, term["end"]),
                short_explanation=explanation,
                source_chunk_id=source.chunk_id,
                source_document_id=source.document_id,
            ).to_dict()
        )

    logger.info("[term_annotation] produced %d grounded annotations", len(annotations))
    return annotations
