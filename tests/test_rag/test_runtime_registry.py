"""Tests for the BTV-managed runtime condition catalog."""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from src.rag.config import RagSettings
from src.rag.registry import (
    SourceDoc,
    activate_runtime_diseases_with_sources,
    create_runtime_disease,
    load_registry,
    runtime_diseases,
    save_uploads,
    set_runtime_disease_status,
)

BASE_REGISTRY = textwrap.dedent("""
    version: 1
    ranking_policy: recency
    diseases:
      hypertension:
        label_vi: Tăng huyết áp
        label_en: Hypertension
        keywords: hypertension|huyết\\s*áp
    documents: []
""")


@pytest.fixture
def settings(tmp_path: Path) -> RagSettings:
    registry_path = tmp_path / "registry.yaml"
    registry_path.write_text(BASE_REGISTRY, encoding="utf-8")
    (tmp_path / "raw").mkdir()
    return RagSettings(
        registry_path=registry_path,
        runtime_registry_path=tmp_path / "registry_runtime.yaml",
        raw_dir=tmp_path / "raw",
    )


def test_btv_created_disease_is_merged_without_rewriting_base_registry(settings: RagSettings) -> None:
    before = settings.registry_path.read_text(encoding="utf-8")

    created = create_runtime_disease(
        disease_id="asthma",
        label_vi="Hen phế quản",
        label_en="Asthma",
        aliases=["hen", "hen suyễn"],
        created_by="u_editor",
        settings=settings,
    )

    registry = load_registry(settings=settings)
    assert created.status == "waiting_for_sources"
    assert settings.registry_path.read_text(encoding="utf-8") == before
    assert settings.runtime_registry_path is not None and settings.runtime_registry_path.exists()
    assert registry.catalog.label_vi("asthma") == "Hen phế quản"
    assert registry.catalog.detect("Bệnh nhân bị hen suyễn") == ["asthma"]
    assert runtime_diseases(settings)["asthma"].aliases == ["Hen phế quản", "Asthma", "hen", "hen suyễn"]


def test_runtime_condition_is_not_activated_without_successful_source(settings: RagSettings) -> None:
    create_runtime_disease(
        disease_id="asthma",
        label_vi="Hen phế quản",
        label_en=None,
        aliases=[],
        created_by="u_editor",
        settings=settings,
    )

    assert activate_runtime_diseases_with_sources(["hypertension"], settings) == []
    assert runtime_diseases(settings)["asthma"].status == "waiting_for_sources"

    assert activate_runtime_diseases_with_sources(["asthma"], settings) == ["asthma"]
    assert runtime_diseases(settings)["asthma"].status == "active"

    # Vector của bệnh tạm ngừng được giữ lại để có thể bật lại, nhưng registry
    # tuyệt đối không đưa nguồn đó vào allow-list retrieval.
    save_uploads(
        [
            SourceDoc(
                doc_id="asthma-guideline",
                file="asthma-guideline.pdf",
                title="Hướng dẫn hen",
                issuer="Bộ Y tế",
                published="2026",
                lang="vi",
                authority="vn_moh",
                diseases=["asthma"],
                status="approved",
            )
        ],
        settings,
    )
    assert [document.doc_id for document in load_registry(settings=settings).approved()] == ["asthma-guideline"]

    set_runtime_disease_status("asthma", "inactive", settings=settings)
    assert activate_runtime_diseases_with_sources(["asthma"], settings) == []
    assert runtime_diseases(settings)["asthma"].status == "inactive"
    assert load_registry(settings=settings).approved() == []


def test_runtime_condition_rejects_collisions_and_invalid_ids(settings: RagSettings) -> None:
    with pytest.raises(ValueError, match="danh mục nền"):
        create_runtime_disease(
            disease_id="hypertension",
            label_vi="Trùng bệnh",
            label_en=None,
            aliases=[],
            created_by="u_editor",
            settings=settings,
        )

    with pytest.raises(ValueError, match="Mã bệnh"):
        create_runtime_disease(
            disease_id="hen-phe-quan",
            label_vi="Hen phế quản",
            label_en=None,
            aliases=[],
            created_by="u_editor",
            settings=settings,
        )
