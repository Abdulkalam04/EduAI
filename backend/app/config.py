from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    omniroute_base_url: str = "http://localhost:20128/v1"
    omniroute_api_key: str = ""
    model_teacher: str = ""
    model_practice: str = ""
    model_reasoning: str = ""
    model_multimodal: str = ""
    model_json: str = ""
    reasoning_effort_ppt: str = "low"
    reasoning_effort_mcq: str = "low"
    reasoning_effort_flashcard: str = "low"
    reasoning_effort_notes: str = "low"
    reasoning_effort_split: str = "low"
    reasoning_effort_viva_questions: str = "low"
    reasoning_effort_mermaid: str = "low"
    reasoning_effort_evaluation_feedback: str = "low"
    reasoning_effort_practice: str = "low"
    reasoning_effort_solve: str = "high"
    reasoning_effort_grading: str = "high"
    reasoning_effort_code_debug: str = "high"
    long_context_max_tokens: int = 120_000
    max_concurrent_llm: int = 4
    embeddings: str = "none"
    cors_origins: str = (
        "http://localhost:5173,http://localhost:8080,http://localhost:3000,"
        "http://localhost:8081"
    )
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'eduai.db').as_posix()}"
    uploads_dir: str = str(BACKEND_DIR / "uploads")

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
