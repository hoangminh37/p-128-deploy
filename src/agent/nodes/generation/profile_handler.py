"""Node: profile_handler — trả lời thông tin cá nhân của người bệnh."""

from __future__ import annotations

from langchain_core.prompts import ChatPromptTemplate

from src.agent.state import AgentState
from src.core.logging import get_logger
from src.services.llm.factory import get_fast_llm

logger = get_logger(__name__)

PROFILE_SYSTEM = """Bạn là trợ lý y tế. Người dùng đang hỏi về thông tin sức khỏe cá nhân của chính họ.
Nhiệm vụ: Trả lời câu hỏi dựa trên Hồ sơ bệnh nhân được cung cấp dưới đây.

Hồ sơ bệnh nhân:
{profile}

Quy tắc:
1. Trả lời bằng tiếng Việt, ngắn gọn, thân thiện, xưng hô với người bệnh là "bạn".
2. KHÔNG tự bịa ra thông tin không có trong hồ sơ. Nếu hồ sơ không có thông tin để trả lời, hãy nói rõ là "Hồ sơ của bạn hiện chưa có thông tin về vấn đề này".
3. Trả về TRỰC TIẾP câu trả lời, KHÔNG thêm bất kỳ thẻ XML nào (không dùng <answer>, không dùng <analysis>).
4. KHÔNG chẩn đoán bệnh hay kê toa thuốc mới."""

PROFILE_HUMAN = "Câu hỏi: {query}"


async def profile_handler_node(state: AgentState) -> AgentState:
    """Node xử lý câu hỏi về profile (không cần gọi retrieval)."""
    query = state.get("query", "")
    patient_profile = state.get("patient_profile", {})

    logger.info("[profile_handler] processing profile query")

    # Format patient profile cho prompt
    profile_parts = []
    if patient_profile.get("age"):
        profile_parts.append(f"Tuổi: {patient_profile['age']}")
    if patient_profile.get("gender"):
        profile_parts.append(f"Giới tính: {patient_profile['gender']}")
    if patient_profile.get("primary_condition"):
        profile_parts.append(f"Bệnh chính: {patient_profile['primary_condition']}")
    if patient_profile.get("comorbidities"):
        profile_parts.append(f"Bệnh đồng mắc: {patient_profile['comorbidities']}")
    if patient_profile.get("medications"):
        profile_parts.append(f"Thuốc đang dùng: {', '.join(patient_profile['medications'])}")
    if patient_profile.get("diagnosed_at"):
        profile_parts.append(f"Chẩn đoán lần đầu: {patient_profile['diagnosed_at']}")

    profile_text = "\n".join(profile_parts) if profile_parts else "Không có thông tin hồ sơ chi tiết."

    try:
        llm = get_fast_llm()
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", PROFILE_SYSTEM),
                ("human", PROFILE_HUMAN),
            ]
        )
        chain = prompt | llm
        result = await chain.ainvoke({"profile": profile_text, "query": query})
        response_text = result.content.strip()

    except Exception as exc:
        logger.error("[profile_handler] LLM failed: %s", exc)
        response_text = "Xin lỗi, hiện tại tôi không thể truy xuất hồ sơ của bạn. Vui lòng thử lại sau."

    return {
        **state,
        "response": response_text,
        "intent": "profile",
        "support_level": "fully",
        "citations": [],
        "metadata": {**state.get("metadata", {}), "node": "profile_handler"},
    }
