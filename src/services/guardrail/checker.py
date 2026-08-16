"""Guardrail checker — rule-based keyword matching (fast, no LLM)."""

from __future__ import annotations

import re

from src.services.guardrail.keywords import (
    DIAGNOSIS_KEYWORDS,
    EMERGENCY_KEYWORDS,
    GREETING_PATTERNS,
    SMALLTALK_PATTERNS,
)

# Câu chào chỉ tính là chào khi NÓ LÀ TOÀN BỘ câu hỏi. "Chào bác sĩ, tôi bị đau
# đầu 3 ngày nay" là câu hỏi y tế thật, không phải lời chào.
MAX_SMALLTALK_CHARS = 60

_GREET = "|".join(GREETING_PATTERNS)
_TALK = "|".join(SMALLTALK_PATTERNS)

# Lời chào và câu hỏi danh tính đều tuỳ chọn, nhưng phải phủ kín cả câu ("$").
# Nhờ vậy "hi", "bạn là ai", và "Hi bạn là ai" đều khớp, còn "hi, tôi bị sốt
# mấy hôm nay" thì không vì phần đuôi không thuộc nhóm nào.
_SMALLTALK_RE = re.compile(
    rf"^(?:{_GREET})?[\s,.!;:-]*(?:{_TALK})?$",
    flags=re.IGNORECASE,
)

# Dấu câu và emoji hay đi kèm lời chào — gỡ trước khi so khớp.
_TRIM_RE = re.compile(r"^[\s\W_]+|[\s\W_]+$", flags=re.UNICODE)


def check_emergency(query: str) -> bool:
    """Trả về True nếu query chứa từ khóa khẩn cấp.

    Rule-based — không gọi LLM để đảm bảo tốc độ và tính an toàn.
    """
    q = query.lower()
    return any(kw in q for kw in EMERGENCY_KEYWORDS)


def check_diagnosis_request(query: str) -> bool:
    """Trả về True nếu query yêu cầu chẩn đoán hoặc kê toa.

    Rule-based — từ chối 100% theo FR3.4.
    """
    q = query.lower()
    return any(kw in q for kw in DIAGNOSIS_KEYWORDS)


def check_smalltalk(query: str) -> bool:
    """Trả về True nếu query chỉ là chào hỏi / hỏi trợ lý là ai.

    Rule-based nên "hi", "bạn là ai" được trả lời tức thì, không tốn vòng LLM
    nào. Chỉ khớp khi lời chào chiếm TRỌN câu — xem MAX_SMALLTALK_CHARS.
    """
    q = _TRIM_RE.sub("", query.strip().lower())
    if not q or len(q) > MAX_SMALLTALK_CHARS:
        return False
    return bool(_SMALLTALK_RE.match(q))


def classify_guardrail(query: str) -> str | None:
    """Quick pre-check trước khi vào LangGraph.

    Returns:
        "red_flag"  — cần emergency handler
        "diagnosis" — cần refuse handler
        "greeting"  — chào hỏi, trả lời bằng template giới thiệu
        None        — an toàn, tiếp tục pipeline
    """
    # Kiểm tra injection TRƯỚC vì kẻ tấn công có thể nhúng từ khóa y tế
    # vào câu tấn công để qua mặt các filter bên dưới
    if check_prompt_injection(query):
        return "prompt_injection"
    if check_emergency(query):
        return "red_flag"
    if check_diagnosis_request(query):
        return "diagnosis"
    # Kiểm tra chào hỏi SAU hai guardrail trên: "chào bác sĩ, tôi đau ngực"
    # phải ra red_flag chứ không được rơi vào nhánh chào hỏi.
    if check_smalltalk(query):
        return "greeting"
    return None
