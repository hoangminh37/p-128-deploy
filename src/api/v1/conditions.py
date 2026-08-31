"""Read-only active condition catalog for patient-facing forms."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.rag.registry import load_registry

router = APIRouter(prefix="/conditions", tags=["conditions"])


class AvailableCondition(BaseModel):
    condition_id: str
    label_vi: str
    label_en: str | None = None


class AvailableConditionList(BaseModel):
    conditions: list[AvailableCondition] = Field(default_factory=list)


@router.get("", response_model=AvailableConditionList)
async def get_available_conditions():
    """Return only conditions that have at least one approved RAG source."""
    registry = load_registry()
    approved_by_condition = {condition_id for document in registry.approved() for condition_id in document.diseases}
    conditions = [
        AvailableCondition(
            condition_id=condition_id,
            label_vi=str(config.get("label_vi") or condition_id),
            label_en=str(config["label_en"]) if config.get("label_en") else None,
        )
        for condition_id, config in registry.diseases.items()
        if condition_id in approved_by_condition and condition_id in registry.active_disease_ids
    ]
    conditions.sort(key=lambda condition: condition.label_vi.casefold())
    return AvailableConditionList(conditions=conditions)
