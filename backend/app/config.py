from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    omniroute_base_url: str = "http://localhost:20128/v1"
    omniroute_api_key: str = ""
    model_teacher: str = ""
    model_teacher_fallbacks: str = ""
    model_practice: str = ""
    model_practice_fallbacks: str = ""
    model_reasoning: str = ""
    model_reasoning_fallbacks: str = ""
    model_multimodal: str = ""
    model_multimodal_fallbacks: str = ""
    model_json: str = ""
    model_json_fallbacks: str = ""
    allow_paid_model_selection: bool = False
    allow_paid_fallback: bool = False
    model_meta_overrides: str = ""
    # Ordered, comma-separated model IDs shown in the chat picker.
    chat_model_allowlist: str = ""
    # Maximum visible chat models, including Auto. The picker enforces a hard cap of six.
    chat_picker_max: int = 6
    # Legacy switch retained for environment compatibility; this application
    # always refuses paid and personal-login providers.
    free_only: bool = True
    # Trusted providers may be routed when pricing is unknown or explicitly zero.
    free_providers: str = "gemini,groq,mistral"
    # Comma-separated provider prefixes that are considered paid.
    paid_providers: str = "openai,anthropic"
    # Comma-separated model IDs that are valid but hidden from the picker UI.
    # Useful to suppress alias duplicates (e.g. gemini-flash-lite-latest is the
    # same model as gemini-3.5-flash-lite) while still keeping them in fallback chains.
    model_hidden_aliases: str = "gemini/gemini-flash-lite-latest"
    # ──────────────────────────────────────────────────────────────────────────
    chat_hedge_after_ms: int = 0
    chat_hedge_max_parallel: int = 1
    chat_first_token_timeout: float = 10.0
    json_first_token_timeout: float = 20.0
    reasoning_first_token_timeout: float = 30.0
    chat_connect_timeout_seconds: float = 3.0
    reasoning_max_tokens_cap: int = 8192
    provider_rpm_gemini: int = 10
    provider_rpm_groq: int = 20
    provider_tpm_groq: int = 5000
    provider_rpm_mistral: int = 50
    provider_tpm_mistral: int = 400000
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
    reasoning_effort_chat: str = "low"
    chat_history_limit: int = 8
    chat_max_tokens_simple: int = 2000
    chat_max_tokens_exam: int = 2400
    chat_max_tokens_detailed: int = 3000
    long_context_max_tokens: int = 120_000
    max_concurrent_llm: int = 4
    embeddings: str = "none"
    cors_origins: str = "http://localhost:8082,http://localhost,https://localhost"
    cors_origin_regex: str = (
        r"^http://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|"
        r"10\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$"
    )
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'eduai.db').as_posix()}"
    uploads_dir: str = str(BACKEND_DIR / "uploads")
    trust_proxy_headers: bool = False
    app_access_token: str = ""
    supabase_url: str = ""
    supabase_jwt_secret: str = ""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def paid_provider_set(self) -> frozenset[str]:
        """Provider prefixes that are always blocked from model routing."""
        return frozenset(p.strip().lower() for p in self.paid_providers.split(",") if p.strip())

    @property
    def free_provider_set(self) -> frozenset[str]:
        """Provider prefixes trusted for free routing unless pricing is positive."""
        return frozenset(
            p.strip().lower() for p in self.free_providers.split(",") if p.strip()
        )

    @property
    def free_provider_order(self) -> list[str]:
        """Provider prefixes in routing priority order."""
        return list(dict.fromkeys(
            p.strip().lower() for p in self.free_providers.split(",") if p.strip()
        ))

    @property
    def model_hidden_alias_set(self) -> frozenset[str]:
        """Frozenset of model IDs that are valid but hidden from the catalogue picker."""
        return frozenset(m.strip() for m in self.model_hidden_aliases.split(",") if m.strip())

    @property
    def chat_model_allowlist_ids(self) -> list[str]:
        """Allowlisted chat models in configured picker order."""
        return list(dict.fromkeys(
            model.strip()
            for model in self.chat_model_allowlist.split(",")
            if model.strip()
        ))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
