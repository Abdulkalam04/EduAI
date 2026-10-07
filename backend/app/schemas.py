from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


LevelId = Literal["c1-5", "c6-8", "c9-10", "c11-12", "grad"]
AnswerStyle = Literal["Simple", "Exam Answer", "Detailed"]


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    question: str | None = Field(default=None, min_length=1, max_length=20_000)
    message: str | None = Field(default=None, min_length=1, max_length=20_000)
    level: LevelId | None = None
    subject: str | None = Field(default=None, max_length=120)
    style: AnswerStyle = "Simple"
    topic: str | None = Field(default=None, max_length=500)
    session_id: str | None = Field(default=None, min_length=1, max_length=128)

    @model_validator(mode="after")
    def require_question_or_message(self) -> "ChatRequest":
        text = self.question if self.question is not None else self.message
        if text is None or not text.strip():
            raise ValueError("question is required")
        return self

    @property
    def prompt_text(self) -> str:
        return (self.question or self.message or "").strip()
