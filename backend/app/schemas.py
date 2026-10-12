from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


LevelId = Literal["c1-5", "c6-8", "c9-10", "c11-12", "grad"]
AnswerStyle = Literal["Simple", "Exam Answer", "Detailed"]


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    question: str | None = Field(default=None, min_length=1, max_length=20_000)
    message: str | None = Field(default=None, min_length=1, max_length=20_000)
    model: str | None = Field(default="auto", min_length=1, max_length=256)
    level: LevelId | None = None
    subject: str | None = Field(default=None, max_length=120)
    style: AnswerStyle = "Simple"
    topic: str | None = Field(default=None, max_length=500)
    session_id: str | None = Field(default=None, min_length=1, max_length=128)
    attachment: dict[str, Any] | None = None

    @model_validator(mode="after")
    def require_question_or_message(self) -> "ChatRequest":
        text = self.question if self.question is not None else self.message
        if text is None or not text.strip():
            raise ValueError("question is required")
        return self

    @property
    def prompt_text(self) -> str:
        return (self.question or self.message or "").strip()


class ModelCapabilities(BaseModel):
    vision: bool = False
    reasoning: bool = False
    thinking: bool = False
    long_context: bool = False


class ChatModelCatalogueItem(BaseModel):
    id: str
    provider: str
    label: str
    description: str = ""
    capabilities: ModelCapabilities
    smart: bool = False
    vision_verified: bool = False
    tier: Literal["free", "paid"]
    health: Literal["healthy", "slow", "cooling_down", "unknown"]
    median_ttft_ms: float | None = None
    cooldown_until: str | None = None
    locked: bool = False
    # When True, this model is valid for use in fallback chains but should not
    # appear in the picker UI (e.g. alias duplicates like gemini-flash-lite-latest).
    hidden: bool = False


class ChatModelsResponse(BaseModel):
    models: list[ChatModelCatalogueItem]
