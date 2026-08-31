import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, relationship

# JSON_TYPE uses PostgreSQL JSONB when available, with SQLite JSON fallback
JSON_TYPE = JSON().with_variant(JSONB, "postgresql")

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: f"u_{uuid.uuid4().hex[:6].upper()}")
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False)  # "patient", "editor" or "doctor"

    patient_profile = relationship("Patient", back_populates="user", uselist=False)


class DoctorProfile(Base):
    """Verified professional profile managed by the editorial administrator."""

    __tablename__ = "doctor_profiles"

    # The user account is the stable doctor identity. Keeping it as the primary
    # key prevents a second public profile being attached to one login.
    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    display_name = Column(String, nullable=False)
    specialty = Column(String, nullable=False)
    license_number = Column(String, nullable=False, unique=True)
    bio = Column(Text, nullable=True)
    # Public, professional information the patient can inspect before choosing
    # a doctor. None of these fields contains patient data.
    clinic_name = Column(String, nullable=True)
    experience_years = Column(Integer, nullable=True)
    consultation_focus = Column(Text, nullable=True)
    verification_status = Column(String, nullable=False, default="verified")
    verified_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    is_available = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String, primary_key=True, default=lambda: f"p_{uuid.uuid4().hex[:6].upper()}")
    user_id = Column(String, ForeignKey("users.id"), unique=True)
    age = Column(Integer, nullable=False)
    primary_condition = Column(String, nullable=False)
    comorbidities = Column(JSON_TYPE, default=list)
    diagnosed_at = Column(String, nullable=True)
    height_cm = Column(Integer, nullable=True)
    weight_kg = Column(Float, nullable=True)
    asking_as = Column(String, default="self")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="patient_profile")
    conversations = relationship("Conversation", back_populates="patient")
    routine_memory = relationship("PatientRoutineMemory", back_populates="patient", uselist=False)


class PatientRoutineMemory(Base):
    """Thông tin routine do người bệnh tự nêu, tách khỏi hồ sơ bệnh chính thức."""

    __tablename__ = "patient_routine_memories"

    id = Column(String, primary_key=True, default=lambda: f"rm_{uuid.uuid4().hex[:10]}")
    patient_id = Column(String, ForeignKey("patients.id"), unique=True, index=True, nullable=False)
    entries = Column(JSON_TYPE, default=list, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    patient = relationship("Patient", back_populates="routine_memory")


class Consultation(Base):
    """One patient-to-doctor consultation; separate from AI chat history."""

    __tablename__ = "consultations"

    id = Column(String, primary_key=True, default=lambda: f"cs_{uuid.uuid4().hex[:12]}")
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, index=True)
    doctor_user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    # requested -> active -> ended. Messages are one-way from the patient while
    # requested, then become two-way only after the doctor accepts.
    status = Column(String, nullable=False, default="requested")
    requested_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ConsultationMessage(Base):
    """Persisted direct messages between the two authorized consultation parties."""

    __tablename__ = "consultation_messages"

    id = Column(String, primary_key=True, default=lambda: f"cm_{uuid.uuid4().hex[:12]}")
    consultation_id = Column(String, ForeignKey("consultations.id"), nullable=False, index=True)
    sender_user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ConsultationVideoCall(Base):
    """Server-authorized WebRTC call room; media itself never passes through us."""

    __tablename__ = "consultation_video_calls"

    id = Column(String, primary_key=True, default=lambda: f"vc_{uuid.uuid4().hex[:12]}")
    consultation_id = Column(String, ForeignKey("consultations.id"), nullable=False, index=True)
    initiated_by_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    status = Column(String, nullable=False, default="ringing")  # ringing | active | ended
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    answered_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)


class ConsultationVideoSignal(Base):
    """Short-lived WebRTC offer/answer/ICE payloads used only for signaling."""

    __tablename__ = "consultation_video_signals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    call_id = Column(String, ForeignKey("consultation_video_calls.id"), nullable=False, index=True)
    sender_user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)  # offer | answer | candidate | hangup
    payload = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class DoctorNotification(Base):
    """A doctor-owned alert generated by an action from one of their patients."""

    __tablename__ = "doctor_notifications"

    id = Column(String, primary_key=True, default=lambda: f"dn_{uuid.uuid4().hex[:12]}")
    doctor_user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    consultation_id = Column(String, ForeignKey("consultations.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)  # request | patient_message | video_call
    # A short, authorized preview lets the doctor triage without exposing any
    # identity outside the consultation itself.
    content_preview = Column(String, nullable=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=lambda: f"c_{uuid.uuid4().hex[:6].upper()}")
    patient_id = Column(String, ForeignKey("patients.id"))
    title = Column(String, nullable=False)
    last_message_at = Column(DateTime, default=datetime.utcnow)
    message_count = Column(Integer, default=0)

    patient = relationship("Patient", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", order_by="Message.created_at")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=lambda: f"m_{uuid.uuid4().hex[:6].upper()}")
    conversation_id = Column(String, ForeignKey("conversations.id"))
    role = Column(String, nullable=False)  # "user" or "assistant"
    status = Column(String, nullable=True)  # "answered", "partial", etc.
    content = Column(Text, nullable=False)
    citations = Column(JSON_TYPE, default=list)
    support_level = Column(String, nullable=True)
    disclaimer = Column(String, nullable=True)
    meta_data = Column(JSON_TYPE, nullable=True)  # metadata is reserved word in SQLAlchemy Base
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


class EditorQueueItem(Base):
    __tablename__ = "editor_queue"

    id = Column(String, primary_key=True, default=lambda: f"e_{uuid.uuid4().hex[:6].upper()}")
    title = Column(String, nullable=False)
    origin = Column(String, nullable=False)  # "question_log" or "editor_upload"
    topics = Column(JSON_TYPE, default=list)
    status = Column(String, nullable=False, default="draft")  # draft, pending, approved, rejected
    content = Column(Text, nullable=False, default="")
    source_url = Column(String, nullable=True)
    issuer = Column(String, nullable=True)
    doc_code = Column(String, nullable=True)
    conditions = Column(JSON_TYPE, default=list)
    review_note = Column(Text, nullable=True)
    reject_reason = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class OutOfScopeLog(Base):
    __tablename__ = "out_of_scope_logs"

    id = Column(String, primary_key=True, default=lambda: f"o_{uuid.uuid4().hex[:6].upper()}")
    question = Column(String, nullable=False)
    ask_count = Column(Integer, default=1)
    last_asked_at = Column(DateTime, default=datetime.utcnow)
    drafted = Column(Boolean, default=False)
    drafted_item_id = Column(String, nullable=True)


class PatientEditorialQuestion(Base):
    """A patient-specific request created when verified RAG cannot answer.

    ``OutOfScopeLog`` remains an aggregate content-gap metric. This table is
    deliberately separate so an editor can reply to one patient without
    exposing, merging, or losing another patient's request.
    """

    __tablename__ = "patient_editorial_questions"

    id = Column(String, primary_key=True, default=lambda: f"peq_{uuid.uuid4().hex[:12]}")
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, index=True)
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=True, index=True)
    question = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending | answered
    answer = Column(Text, nullable=True)
    answered_at = Column(DateTime, nullable=True)
    answered_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class PatientNotification(Base):
    """A patient-owned inbox item, currently used for editorial responses."""

    __tablename__ = "patient_notifications"

    id = Column(String, primary_key=True, default=lambda: f"pn_{uuid.uuid4().hex[:12]}")
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, index=True)
    editorial_question_id = Column(String, ForeignKey("patient_editorial_questions.id"), nullable=True, index=True)
    kind = Column(String, nullable=False)  # editor_response
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Article(Base):
    __tablename__ = "articles"

    id = Column(String, primary_key=True, default=lambda: f"a_{uuid.uuid4().hex[:6].upper()}")
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    full_content = Column(Text, nullable=True)
    category = Column(String, nullable=False)
    quiz_data = Column(JSON_TYPE, nullable=True)
    origin_source = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class LearningPath(Base):
    __tablename__ = "learning_paths"

    id = Column(String, primary_key=True, default=lambda: f"lp_{uuid.uuid4().hex[:6].upper()}")
    disease_category = Column(String, nullable=False)
    day_number = Column(Integer, nullable=False)
    article_id = Column(String, ForeignKey("articles.id"))

    article = relationship("Article")


class PatientProgress(Base):
    __tablename__ = "patient_progress"

    id = Column(String, primary_key=True, default=lambda: f"pp_{uuid.uuid4().hex[:6].upper()}")
    patient_id = Column(String, ForeignKey("patients.id"), unique=True)
    total_score = Column(Integer, default=0)
    current_streak = Column(Integer, default=0)
    completed_articles = Column(JSON_TYPE, default=list)  # list of article_ids
    last_completed_at = Column(DateTime, nullable=True)

    patient = relationship("Patient")


class QuizSession(Base):
    """Một lượt làm bài trắc nghiệm sinh động (Mini-Quiz Generation).

    ``questions`` giữ NGUYÊN VĂN đề đã sinh, kể cả ``correct_index`` và
    ``explanation`` — hai trường này không bao giờ đi ra khỏi server trước lúc
    nộp bài. Bảng này vì thế vừa là nơi chấm điểm vừa là bản ghi để đối chiếu
    khi người học thắc mắc "sao câu này lại sai".

    Đề được sinh mới mỗi lần gọi nên không đánh unique lên ``source_ref``: cùng
    một bài học có thể làm lại nhiều lần với bộ câu hỏi khác nhau.
    """

    __tablename__ = "quiz_sessions"

    id = Column(String, primary_key=True, default=lambda: f"q_{uuid.uuid4().hex[:6].upper()}")
    patient_id = Column(String, ForeignKey("patients.id"), index=True)
    source = Column(String, nullable=False)  # "article" | "conversation" | "profile"
    source_ref = Column(String, nullable=True)  # article_id hoặc conversation_id
    topic = Column(String, nullable=False)
    questions = Column(JSON_TYPE, default=list)  # [{question, options, correct_index, explanation, difficulty}]
    citations = Column(JSON_TYPE, default=list)
    answers = Column(JSON_TYPE, nullable=True)  # [int] — null khi chưa nộp
    score = Column(Integer, nullable=True)  # null khi chưa nộp
    total = Column(Integer, nullable=False, default=0)
    submitted_at = Column(DateTime, nullable=True)

    patient = relationship("Patient")


try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    Vector = None


class MedicalChunk(Base):
    """Bảng lưu trữ chunk và vector embedding trên PostgreSQL (pgvector)."""

    __tablename__ = "medical_chunks"

    chunk_id = Column(String(120), primary_key=True)
    doc_id = Column(String(120), nullable=False, index=True)
    text = Column(Text, nullable=False)
    embed_text = Column(Text, nullable=False)
    disease = Column(String(120), nullable=True, index=True)
    priority = Column(Float, default=0.0)
    section_path = Column(Text, nullable=True)
    page_start = Column(Integer, nullable=True)
    page_end = Column(Integer, nullable=True)
    table_structure = Column(JSON_TYPE, nullable=True)
    metadata_json = Column(JSON_TYPE, nullable=True)
    embedding = Column(Vector(1024) if Vector is not None else Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
