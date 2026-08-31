"""Authorization and state-transition coverage for doctor consultations."""

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

import src.api.v1.chat as chat_api
from src.api.v1.auth import get_current_user, get_editor_user
from src.core.database import get_db
from src.main import app
from src.models.domain import Base, DoctorProfile, OutOfScopeLog, Patient, User
from src.schemas.patient import UserInfo
from src.services.editorial_questions import record_unanswered_patient_question


@pytest_asyncio.fixture
async def consultation_client(tmp_path) -> AsyncIterator[tuple[AsyncClient, dict[str, UserInfo]]]:
    """One isolated database, with the actor selected by the test itself."""
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'consultations.db'}")
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with session_factory() as session:
        session.add_all(
            [
                User(id="u_patient", email="patient@example.com", password="secret", role="patient"),
                User(id="u_patient_2", email="patient-2@example.com", password="secret", role="patient"),
                User(id="u_doctor", email="doctor@example.com", password="secret", role="doctor"),
                User(id="u_doctor_2", email="doctor-2@example.com", password="secret", role="doctor"),
                User(id="u_editor", email="editor@example.com", password="secret", role="editor"),
                Patient(
                    id="p_patient",
                    user_id="u_patient",
                    age=52,
                    primary_condition="hypertension",
                    comorbidities=["type2_diabetes"],
                    diagnosed_at="2024-08",
                    asking_as="self",
                ),
                Patient(
                    id="p_patient_2",
                    user_id="u_patient_2",
                    age=48,
                    primary_condition="type2_diabetes",
                    comorbidities=[],
                    diagnosed_at="2023-05",
                    asking_as="self",
                ),
                DoctorProfile(
                    user_id="u_doctor",
                    display_name="BS. Nguyễn An",
                    specialty="Nội tiết",
                    license_number="GPLH-001",
                    clinic_name="Phòng khám Nội tiết An Tâm",
                    experience_years=12,
                    consultation_focus="Tư vấn đái tháo đường và các chỉ số nội tiết.",
                    is_active=True,
                    is_available=True,
                ),
                DoctorProfile(
                    user_id="u_doctor_2",
                    display_name="BS. Lê Bình",
                    specialty="Tim mạch",
                    license_number="GPLH-003",
                    is_active=True,
                    is_available=True,
                ),
            ]
        )
        await session.commit()

    actors = {
        "patient": UserInfo(user_id="u_patient", email="patient@example.com", role="patient", patient_id="p_patient"),
        "patient_2": UserInfo(user_id="u_patient_2", email="patient-2@example.com", role="patient", patient_id="p_patient_2"),
        "doctor": UserInfo(user_id="u_doctor", email="doctor@example.com", role="doctor", patient_id=None),
        "doctor_2": UserInfo(user_id="u_doctor_2", email="doctor-2@example.com", role="doctor", patient_id=None),
        "editor": UserInfo(user_id="u_editor", email="editor@example.com", role="editor", patient_id=None),
    }
    current = {"actor": actors["patient"]}

    async def override_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    async def override_current_user() -> UserInfo:
        return current["actor"]

    async def override_editor() -> UserInfo:
        return actors["editor"]

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_current_user
    app.dependency_overrides[get_editor_user] = override_editor
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client, current
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_editor_user, None)
        await engine.dispose()


@pytest.mark.asyncio
async def test_patient_doctor_chat_and_video_signal_are_gated(consultation_client) -> None:
    client, current = consultation_client

    available = await client.get("/api/v1/consultations/doctors")
    assert available.status_code == 200
    doctors = {doctor["doctor_id"]: doctor for doctor in available.json()["doctors"]}
    assert set(doctors) == {"u_doctor", "u_doctor_2"}
    assert doctors["u_doctor"]["license_number"] == "GPLH-001"
    assert doctors["u_doctor"]["is_verified"] is True

    public_profile = await client.get("/api/v1/consultations/doctors/u_doctor")
    assert public_profile.status_code == 200
    assert public_profile.json()["clinic_name"] == "Phòng khám Nội tiết An Tâm"
    assert public_profile.json()["experience_years"] == 12

    requested = await client.post(
        "/api/v1/consultations",
        json={"doctor_id": "u_doctor", "initial_message": "Tôi cần được tư vấn về đường huyết."},
    )
    assert requested.status_code == 201
    consultation_id = requested.json()["consultation_id"]
    assert requested.json()["status"] == "requested"

    # Selecting the same doctor again opens the existing room rather than
    # blocking the patient with a duplicate-request error.
    reopened = await client.post("/api/v1/consultations", json={"doctor_id": "u_doctor"})
    assert reopened.status_code == 200
    assert reopened.json()["consultation_id"] == consultation_id
    assert len(reopened.json()["messages"]) == 1

    # One patient can consult more than one doctor at the same time.
    second_doctor_request = await client.post(
        "/api/v1/consultations",
        json={"doctor_id": "u_doctor_2"},
    )
    assert second_doctor_request.status_code == 201
    assert second_doctor_request.json()["messages"] == []

    # The doctor cannot reply nor call before explicitly accepting the request.
    current["actor"] = UserInfo(user_id="u_doctor", email="doctor@example.com", role="doctor", patient_id=None)
    blocked_reply = await client.post(f"/api/v1/consultations/{consultation_id}/messages", json={"content": "Chào bạn"})
    blocked_call = await client.post(f"/api/v1/consultations/{consultation_id}/calls")
    assert blocked_reply.status_code == 409
    assert blocked_call.status_code == 409

    accepted = await client.post(f"/api/v1/consultations/{consultation_id}/accept")
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "active"
    assert accepted.json()["patient_context"] == {
        "age": 52,
        "conditions": ["hypertension", "type2_diabetes"],
        "diagnosed_at": "2024-08",
    }

    reply = await client.post(f"/api/v1/consultations/{consultation_id}/messages", json={"content": "Chào bạn, tôi đã xem yêu cầu."})
    assert reply.status_code == 201
    assert reply.json()["sender_role"] == "doctor"

    current["actor"] = UserInfo(user_id="u_patient", email="patient@example.com", role="patient", patient_id="p_patient")
    patient_message = await client.post(
        f"/api/v1/consultations/{consultation_id}/messages",
        json={"content": "Tôi vừa đo đường huyết tại nhà."},
    )
    assert patient_message.status_code == 201

    # A patient starts the room; only their doctor sees the authorized offer.
    started = await client.post(f"/api/v1/consultations/{consultation_id}/calls")
    assert started.status_code == 201
    call_id = started.json()["call_id"]
    offer = await client.post(
        f"/api/v1/consultations/{consultation_id}/calls/{call_id}/signals",
        json={"kind": "offer", "payload": {"type": "offer", "sdp": "test-offer"}},
    )
    assert offer.status_code == 201

    current["actor"] = UserInfo(user_id="u_doctor", email="doctor@example.com", role="doctor", patient_id=None)
    notifications = await client.get("/api/v1/consultations/notifications")
    assert notifications.status_code == 200
    assert {item["kind"] for item in notifications.json()["notifications"]} >= {
        "request",
        "patient_message",
        "video_call",
    }
    first_notification = notifications.json()["notifications"][0]
    marked = await client.post(f"/api/v1/consultations/notifications/{first_notification['notification_id']}/read")
    assert marked.status_code == 200
    assert marked.json()["read_at"] is not None

    joined = await client.post(f"/api/v1/consultations/{consultation_id}/calls/{call_id}/join")
    assert joined.status_code == 200
    assert joined.json()["status"] == "active"
    received_offer = await client.get(f"/api/v1/consultations/{consultation_id}/calls/{call_id}/signals?after_id=0")
    assert received_offer.status_code == 200
    assert received_offer.json()["signals"] == [
        {"signal_id": 1, "kind": "offer", "payload": {"type": "offer", "sdp": "test-offer"}, "created_at": received_offer.json()["signals"][0]["created_at"]}
    ]

    # One doctor can separately receive and manage requests from many patients.
    current["actor"] = UserInfo(user_id="u_patient_2", email="patient-2@example.com", role="patient", patient_id="p_patient_2")
    second_patient_request = await client.post(
        "/api/v1/consultations",
        json={"doctor_id": "u_doctor", "initial_message": "Tôi cần tư vấn về việc theo dõi chỉ số."},
    )
    assert second_patient_request.status_code == 201

    current["actor"] = UserInfo(user_id="u_patient", email="patient@example.com", role="patient", patient_id="p_patient")
    ended = await client.post(f"/api/v1/consultations/{consultation_id}/end")
    assert ended.status_code == 200
    assert ended.json()["status"] == "ended"
    cannot_send = await client.post(f"/api/v1/consultations/{consultation_id}/messages", json={"content": "Tin mới"})
    assert cannot_send.status_code == 409


@pytest.mark.asyncio
async def test_editor_can_create_then_disable_a_doctor(consultation_client) -> None:
    client, _ = consultation_client

    created = await client.post(
        "/api/v1/consultations/admin/doctors",
        json={
            "email": "new-doctor@example.com",
            "temporary_password": "temporary-secret",
            "display_name": "BS. Trần Bình",
            "specialty": "Tim mạch",
            "license_number": "GPLH-002",
            "bio": "Tư vấn bệnh tim mạch.",
            "is_available": True,
        },
    )
    assert created.status_code == 201
    doctor_id = created.json()["doctor_id"]

    disabled = await client.patch(
        f"/api/v1/consultations/admin/doctors/{doctor_id}",
        json={"is_active": False},
    )
    assert disabled.status_code == 200
    assert disabled.json()["is_active"] is False

    updated = await client.patch(
        f"/api/v1/consultations/admin/doctors/{doctor_id}",
        json={
            "email": "renamed-doctor@example.com",
            "display_name": "BS. Trần Bình Mới",
            "specialty": "Nội tim mạch",
            "license_number": "GPLH-002-MOI",
            "bio": "Hồ sơ chuyên môn đã được BTV cập nhật.",
            "clinic_name": "Phòng khám Tim mạch",
            "experience_years": 10,
            "consultation_focus": "Tư vấn theo dõi huyết áp.",
            "is_active": True,
            "is_available": False,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["email"] == "renamed-doctor@example.com"
    assert updated.json()["display_name"] == "BS. Trần Bình Mới"
    assert updated.json()["specialty"] == "Nội tim mạch"
    assert updated.json()["license_number"] == "GPLH-002-MOI"
    assert updated.json()["clinic_name"] == "Phòng khám Tim mạch"
    assert updated.json()["experience_years"] == 10
    assert updated.json()["is_available"] is False


@pytest.mark.asyncio
async def test_editor_can_save_and_reopen_a_question_log_draft(consultation_client) -> None:
    """Draft edits persist without accidentally promoting the item to approved."""
    client, _ = consultation_client

    db_dependency = app.dependency_overrides[get_db]
    async for db in db_dependency():
        db.add(
            OutOfScopeLog(
                id="o_draft_edit",
                question="Tôi cần biết cách theo dõi huyết áp tại nhà.",
            )
        )
        await db.commit()
        break

    created = await client.post("/api/v1/editor/out-of-scope/o_draft_edit/draft")
    assert created.status_code == 201
    draft_id = created.json()["item_id"]
    assert created.json()["status"] == "draft"

    saved = await client.patch(
        f"/api/v1/editor/queue/{draft_id}/draft",
        json={
            "title": "Theo dõi huyết áp tại nhà",
            "content": "Đo vào cùng thời điểm mỗi ngày và ghi lại kết quả để trao đổi khi đi khám.",
            "topics": ["huyết áp", "tự theo dõi", "huyết áp"],
            "conditions": ["hypertension"],
            "source_url": "https://example.org/theo-doi-huyet-ap",
            "issuer": "Bộ Y tế",
            "doc_code": "HD-HA-01",
        },
    )
    assert saved.status_code == 200
    assert saved.json()["status"] == "draft"
    assert saved.json()["title"] == "Theo dõi huyết áp tại nhà"
    assert saved.json()["topics"] == ["huyết áp", "tự theo dõi"]
    assert saved.json()["conditions"] == ["hypertension"]
    assert saved.json()["source_url"] == "https://example.org/theo-doi-huyet-ap"
    assert saved.json()["issuer"] == "Bộ Y tế"
    assert saved.json()["doc_code"] == "HD-HA-01"

    reopened = await client.get(f"/api/v1/editor/queue/{draft_id}")
    assert reopened.status_code == 200
    assert reopened.json()["content"] == saved.json()["content"]

    promoted = await client.post(
        f"/api/v1/editor/queue/{draft_id}/approve",
        json={"content": saved.json()["content"]},
    )
    assert promoted.status_code == 200
    assert promoted.json()["status"] == "approved"

    cannot_edit_after_approval = await client.patch(
        f"/api/v1/editor/queue/{draft_id}/draft",
        json={
            "title": "Tiêu đề khác",
            "content": "Nội dung khác",
            "topics": [],
            "conditions": ["hypertension"],
            "source_url": None,
            "issuer": None,
            "doc_code": None,
        },
    )
    assert cannot_edit_after_approval.status_code == 409


@pytest.mark.asyncio
async def test_editorial_response_reaches_only_the_asking_patient(consultation_client) -> None:
    client, current = consultation_client

    # This is the same persistence service used after a RAG referral, kept out
    # of the agent test so this API contract has no LLM/network dependency.
    db_dependency = app.dependency_overrides[get_db]
    async for db in db_dependency():
        request = await record_unanswered_patient_question(
            db,
            patient_id="p_patient",
            conversation_id=None,
            question="Tôi cần chuẩn bị gì trước khi đi khám?",
        )
        await db.commit()
        request_id = request.id
        break

    pending = await client.get("/api/v1/editor/patient-questions?status=pending")
    assert pending.status_code == 200
    assert pending.json()["requests"][0]["request_id"] == request_id
    assert pending.json()["requests"][0]["question"] == "Tôi cần chuẩn bị gì trước khi đi khám?"
    assert pending.json()["requests"][0]["created_at"].endswith("Z")

    answered = await client.post(
        f"/api/v1/editor/patient-questions/{request_id}/answer",
        json={"answer": "Bạn hãy mang theo giấy tờ và danh sách thuốc đang dùng."},
    )
    assert answered.status_code == 200
    assert answered.json()["status"] == "answered"

    current["actor"] = UserInfo(
        user_id="u_patient",
        email="patient@example.com",
        role="patient",
        patient_id="p_patient",
    )
    inbox = await client.get("/api/v1/patients/notifications")
    assert inbox.status_code == 200
    assert inbox.json()["unread_count"] == 1
    notification = inbox.json()["notifications"][0]
    assert notification["question"] == "Tôi cần chuẩn bị gì trước khi đi khám?"
    assert notification["body"] == "Bạn hãy mang theo giấy tờ và danh sách thuốc đang dùng."
    assert notification["created_at"].endswith("Z")

    read = await client.post(f"/api/v1/patients/notifications/{notification['notification_id']}/read")
    assert read.status_code == 200
    assert read.json()["read_at"] is not None
    assert read.json()["read_at"].endswith("Z")
    assert read.json()["question"] == "Tôi cần chuẩn bị gì trước khi đi khám?"

    current["actor"] = UserInfo(
        user_id="u_patient_2",
        email="patient-2@example.com",
        role="patient",
        patient_id="p_patient_2",
    )
    other_inbox = await client.get("/api/v1/patients/notifications")
    assert other_inbox.status_code == 200
    assert other_inbox.json()["notifications"] == []


@pytest.mark.asyncio
async def test_rag_referral_automatically_creates_editorial_patient_request(
    consultation_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _ = consultation_client

    class ReferralAgent:
        async def ainvoke(self, _state: dict) -> dict:
            return {
                "response": "Thư viện hiện chưa đủ tài liệu.",
                "intent": "doctor_referral",
                "support_level": "no_support",
                "is_red_flag": False,
                "citations": [],
                "routine_updates": [],
                "metadata": {"retrieval_context": {"status": "ok", "returned_count": 0}},
            }

    monkeypatch.setattr(chat_api, "agent", ReferralAgent())
    referral = await client.post(
        "/api/v1/chat",
        json={
            "patient_id": "p_patient",
            "query": "Tôi cần chuẩn bị gì trước khi đi khám?",
        },
    )
    assert referral.status_code == 200
    assert referral.json()["status"] == "referral"

    pending = await client.get("/api/v1/editor/patient-questions?status=pending")
    assert pending.status_code == 200
    assert [item["question"] for item in pending.json()["requests"]] == [
        "Tôi cần chuẩn bị gì trước khi đi khám?"
    ]


@pytest.mark.asyncio
async def test_retrieval_timeout_does_not_create_editorial_patient_request(
    consultation_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _ = consultation_client

    class TimedOutRetrievalAgent:
        async def ainvoke(self, _state: dict) -> dict:
            return {
                "response": "Thư viện hiện chưa đủ tài liệu.",
                "intent": "doctor_referral",
                "support_level": "no_support",
                "is_red_flag": False,
                "citations": [],
                "routine_updates": [],
                "metadata": {"retrieval_context": {"status": "timeout", "returned_count": 0}},
            }

    monkeypatch.setattr(chat_api, "agent", TimedOutRetrievalAgent())
    referral = await client.post(
        "/api/v1/chat",
        json={
            "patient_id": "p_patient",
            "query": "Chỉ số đường huyết bao nhiêu thì gọi là cao?",
        },
    )
    assert referral.status_code == 200
    assert referral.json()["status"] == "referral"

    pending = await client.get("/api/v1/editor/patient-questions?status=pending")
    assert pending.status_code == 200
    assert pending.json()["requests"] == []


@pytest.mark.asyncio
async def test_doctor_can_manage_only_patient_facing_own_profile(consultation_client) -> None:
    client, current = consultation_client
    current["actor"] = UserInfo(
        user_id="u_doctor",
        email="doctor@example.com",
        role="doctor",
        patient_id=None,
    )

    own_profile = await client.get("/api/v1/consultations/me/profile")
    assert own_profile.status_code == 200
    assert own_profile.json()["email"] == "doctor@example.com"
    assert own_profile.json()["license_number"] == "GPLH-001"

    updated = await client.patch(
        "/api/v1/consultations/me/profile",
        json={
            "display_name": "BS. Nguyễn An Mới",
            "bio": "Giới thiệu đã cập nhật.",
            "clinic_name": "Phòng khám mới",
            "experience_years": 13,
            "consultation_focus": "Tư vấn theo dõi đường huyết.",
            "is_available": False,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["display_name"] == "BS. Nguyễn An Mới"
    assert updated.json()["clinic_name"] == "Phòng khám mới"
    assert updated.json()["experience_years"] == 13
    assert updated.json()["is_available"] is False
    # These fields remain verified by BTV, and are never accepted by this API.
    assert updated.json()["specialty"] == "Nội tiết"
    assert updated.json()["license_number"] == "GPLH-001"

    current["actor"] = UserInfo(
        user_id="u_patient",
        email="patient@example.com",
        role="patient",
        patient_id="p_patient",
    )
    forbidden = await client.get("/api/v1/consultations/me/profile")
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_doctor_dashboard_uses_live_consultation_and_notification_counts(consultation_client) -> None:
    client, current = consultation_client

    requested = await client.post(
        "/api/v1/consultations",
        json={"doctor_id": "u_doctor", "initial_message": "Tôi cần tư vấn."},
    )
    assert requested.status_code == 201
    consultation_id = requested.json()["consultation_id"]

    current["actor"] = UserInfo(
        user_id="u_doctor",
        email="doctor@example.com",
        role="doctor",
        patient_id=None,
    )
    waiting_dashboard = await client.get("/api/v1/consultations/dashboard")
    assert waiting_dashboard.status_code == 200
    assert waiting_dashboard.json()["pending_consultation_count"] == 1
    assert waiting_dashboard.json()["active_consultation_count"] == 0
    assert waiting_dashboard.json()["unread_system_notification_count"] == 1
    assert waiting_dashboard.json()["unread_patient_message_count"] == 0
    assert [item["consultation_id"] for item in waiting_dashboard.json()["recent_consultations"]] == [consultation_id]

    accepted = await client.post(f"/api/v1/consultations/{consultation_id}/accept")
    assert accepted.status_code == 200
    current["actor"] = UserInfo(
        user_id="u_patient",
        email="patient@example.com",
        role="patient",
        patient_id="p_patient",
    )
    sent = await client.post(
        f"/api/v1/consultations/{consultation_id}/messages",
        json={"content": "Tôi vừa đo chỉ số tại nhà."},
    )
    assert sent.status_code == 201

    current["actor"] = UserInfo(
        user_id="u_doctor",
        email="doctor@example.com",
        role="doctor",
        patient_id=None,
    )
    active_dashboard = await client.get("/api/v1/consultations/dashboard")
    assert active_dashboard.status_code == 200
    assert active_dashboard.json()["pending_consultation_count"] == 0
    assert active_dashboard.json()["active_consultation_count"] == 1
    assert active_dashboard.json()["unread_patient_message_count"] == 1
