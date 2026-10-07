from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    session: Mapped[ChatSession] = relationship(back_populates="messages")


class StudyDocument(Base):
    __tablename__ = "study_documents"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    title: Mapped[str] = mapped_column(String(512))
    page_count: Mapped[int] = mapped_column(Integer)
    uploaded_at: Mapped[str] = mapped_column(String(32))
    pages_json: Mapped[str] = mapped_column(Text)
    token_estimate: Mapped[int] = mapped_column(Integer)
    sections_json: Mapped[str] = mapped_column(Text)


class VivaSession(Base):
    __tablename__ = "viva_sessions"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    subject: Mapped[str] = mapped_column(String(120))
    topic: Mapped[str] = mapped_column(String(500), default="")
    level: Mapped[str] = mapped_column(String(16))
    adaptive: Mapped[bool] = mapped_column(default=True)
    difficulty: Mapped[int] = mapped_column(Integer, default=1)
    questions_json: Mapped[str] = mapped_column(Text)
    answers_json: Mapped[str] = mapped_column(Text, default="[]")
    report_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )


class PracticePaper(Base):
    __tablename__ = "practice_papers"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    paper_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )


class PracticeAttempt(Base):
    __tablename__ = "practice_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    paper_id: Mapped[str] = mapped_column(String(128), index=True)
    subject: Mapped[str] = mapped_column(String(120))
    chapter: Mapped[str] = mapped_column(String(500))
    total: Mapped[int] = mapped_column(Integer)
    score: Mapped[float] = mapped_column()
    paper_json: Mapped[str] = mapped_column(Text)
    result_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )


class PracticeEvaluation(Base):
    __tablename__ = "practice_evaluations"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    evaluation_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
