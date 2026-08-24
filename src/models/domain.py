import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: f"u_{uuid.uuid4().hex[:6].upper()}")
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False)  # "patient" or "editor"

    patient_profile = relationship("Patient", back_populates="user", uselist=False)


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String, primary_key=True, default=lambda: f"p_{uuid.uuid4().hex[:6].upper()}")
    user_id = Column(String, ForeignKey("users.id"), unique=True)
    age = Column(Integer, nullable=False)
    primary_condition = Column(String, nullable=False)
    comorbidities = Column(JSONB, default=list)
    diagnosed_at = Column(String, nullable=True)
    asking_as = Column(String, default="self")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="patient_profile")
    conversations = relationship("Conversation", back_populates="patient")


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
    citations = Column(JSONB, default=list)
    support_level = Column(String, nullable=True)
    disclaimer = Column(String, nullable=True)
    meta_data = Column(JSONB, nullable=True)  # metadata is reserved word in SQLAlchemy Base
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


class EditorQueueItem(Base):
    __tablename__ = "editor_queue"

    id = Column(String, primary_key=True, default=lambda: f"e_{uuid.uuid4().hex[:6].upper()}")
    title = Column(String, nullable=False)
    origin = Column(String, nullable=False)  # "question_log" or "editor_upload"
    topics = Column(JSONB, default=list)
    status = Column(String, nullable=False, default="draft")  # draft, pending, approved, rejected
    content = Column(Text, nullable=False, default="")
    source_url = Column(String, nullable=True)
    issuer = Column(String, nullable=True)
    doc_code = Column(String, nullable=True)
    conditions = Column(JSONB, default=list)
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


class Article(Base):
    __tablename__ = "articles"

    id = Column(String, primary_key=True, default=lambda: f"a_{uuid.uuid4().hex[:6].upper()}")
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    full_content = Column(Text, nullable=True)
    category = Column(String, nullable=False)
    quiz_data = Column(JSONB, nullable=True)
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
    completed_articles = Column(JSONB, default=list)  # list of article_ids
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
    questions = Column(JSONB, default=list)  # [{question, options, correct_index, explanation, difficulty}]
    citations = Column(JSONB, default=list)
    answers = Column(JSONB, nullable=True)  # [int] — null khi chưa nộp
    score = Column(Integer, nullable=True)  # null khi chưa nộp
    total = Column(Integer, nullable=False, default=0)
    hp_earned = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)

    patient = relationship("Patient")
