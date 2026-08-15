"""Custom exception hierarchy for the Medical AI Agent."""
from __future__ import annotations


class MedicalAgentError(Exception):
    """Base class for all application errors."""


class GuardrailTriggered(MedicalAgentError):
    """Raised when a safety guardrail blocks the request."""

    def __init__(self, reason: str = "guardrail", intent: str = "red_flag") -> None:
        self.reason = reason
        self.intent = intent
        super().__init__(f"Guardrail triggered: {reason} (intent={intent})")


class RetrievalFailed(MedicalAgentError):
    """Raised when the vector store query fails."""

    def __init__(self, detail: str = "") -> None:
        super().__init__(f"Vector store retrieval failed: {detail}")


class LLMError(MedicalAgentError):
    """Raised when an LLM provider call fails."""

    def __init__(self, provider: str, detail: str = "") -> None:
        self.provider = provider
        super().__init__(f"LLM error [{provider}]: {detail}")


class AgentStateError(MedicalAgentError):
    """Raised on invalid state transitions inside the LangGraph pipeline."""

    def __init__(self, detail: str = "") -> None:
        super().__init__(f"Invalid agent state: {detail}")
