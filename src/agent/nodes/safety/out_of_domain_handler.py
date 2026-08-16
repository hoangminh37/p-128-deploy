"""Node: out_of_domain_handler — xử lý câu hỏi chào hỏi hoặc ngoài phạm vi."""

from __future__ import annotations

from src.agent.state import AgentState
from src.core.logging import get_logger

logger = get_logger(__name__)

OOD_RESPONSE = """Xin chào! Tôi là Trợ lý AI Y tế.

Tôi có thể giải đáp các thắc mắc chung về sức khỏe, bệnh lý, và lối sống lành mạnh dựa trên các tài liệu y khoa uy tín.

Bạn cần tôi giúp gì về sức khỏe hôm nay?"""


async def out_of_domain_handler_node(state: AgentState) -> AgentState:
    """Node xử lý câu chào hỏi hoặc câu hỏi không liên quan đến y tế.

    - Template cố định, KHÔNG gọi LLM
    """
    logger.info("[out_of_domain_handler] Query routed to out_of_domain")

    return {
        **state,
        "response": OOD_RESPONSE,
        "intent": "out_of_domain",
        "support_level": "fully",
        "citations": [],
        "metadata": {**state.get("metadata", {}), "node": "out_of_domain_handler"},
    }
