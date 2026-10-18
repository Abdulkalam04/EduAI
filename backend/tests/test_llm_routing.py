import asyncio
import logging
import time
from collections import OrderedDict, defaultdict, deque
from pathlib import Path
from types import SimpleNamespace

from app.config import settings
from app.services import llm


def _configure_routing(monkeypatch) -> None:
    monkeypatch.setattr(settings, "free_providers", "gemini,groq,mistral")
    monkeypatch.setattr(settings, "model_teacher", "mistral/mistral-medium-3-5")
    monkeypatch.setattr(
        settings,
        "model_teacher_fallbacks",
        "mistral/mistral-small-latest,groq/openai/gpt-oss-120b,gemini/gemini-3-flash-preview",
    )
    monkeypatch.setattr(settings, "model_practice", "mistral/mistral-medium-3-5")
    monkeypatch.setattr(
        settings,
        "model_practice_fallbacks",
        "mistral/mistral-small-latest,gemini/gemini-3-flash-preview,groq/openai/gpt-oss-120b",
    )
    monkeypatch.setattr(settings, "model_reasoning", "mistral/mistral-large-latest")
    monkeypatch.setattr(
        settings,
        "model_reasoning_fallbacks",
        "mistral/mistral-medium-3-5,groq/openai/gpt-oss-120b,gemini/gemini-3-flash-preview",
    )
    monkeypatch.setattr(
        settings, "model_multimodal", "gemini/gemini-3-flash-preview"
    )
    monkeypatch.setattr(
        settings,
        "model_multimodal_fallbacks",
        "mistral/mistral-medium-3-5,gemini/gemini-3.1-flash-lite",
    )
    monkeypatch.setattr(settings, "model_json", "mistral/mistral-small-latest")
    monkeypatch.setattr(
        settings,
        "model_json_fallbacks",
        "mistral/mistral-medium-3-5,gemini/gemini-3-flash-preview,groq/openai/gpt-oss-120b",
    )
    monkeypatch.setattr(settings, "provider_rpm_mistral", 50)
    monkeypatch.setattr(settings, "provider_tpm_mistral", 400000)
    monkeypatch.setattr(llm, "_model_cooldowns", {})
    monkeypatch.setattr(llm, "_model_stats", defaultdict(lambda: deque(maxlen=20)))
    monkeypatch.setattr(llm, "_model_last_success", {})
    monkeypatch.setattr(llm, "_model_registry", None)
    monkeypatch.setattr(llm, "_verified_free_model_ids", frozenset())
    monkeypatch.setattr(llm, "_model_probe_checked_at", {})
    monkeypatch.setattr(llm, "_model_probe_results", {})
    monkeypatch.setattr(llm, "_model_probe_locks", {})
    monkeypatch.setattr(llm, "_provider_request_times", defaultdict(deque))
    monkeypatch.setattr(llm, "_provider_token_usage", defaultdict(deque))
    monkeypatch.setattr(llm, "_model_request_times", {})


def _raw_models(model_ids: list[str]) -> dict[str, dict]:
    return {
        model_id: {
            "id": model_id,
            "name": model_id.split("/")[-1],
            "pricing": {},
            "capabilities": {
                "vision": model_id.startswith("gemini/")
                or model_id == "mistral/mistral-medium-3-5"
            },
        }
        for model_id in model_ids
    }


def test_text_chains_follow_configured_mistral_groq_gemini_order(monkeypatch) -> None:
    _configure_routing(monkeypatch)
    model_ids = [
        "mistral/mistral-medium-3-5",
        "mistral/mistral-small-latest",
        "groq/openai/gpt-oss-120b",
        "gemini/gemini-3-flash-preview",
    ]
    monkeypatch.setattr(llm, "_model_registry", _raw_models(model_ids))
    monkeypatch.setattr(llm, "_verified_free_model_ids", frozenset(model_ids))

    assert llm.model_chain_for("teacher") == model_ids
    assert llm._ordered_auto_chain("teacher") == model_ids


def test_multimodal_chain_keeps_gemini_first_and_skips_nonvision_mistral(
    monkeypatch,
) -> None:
    _configure_routing(monkeypatch)
    model_ids = [
        "gemini/gemini-3-flash-preview",
        "mistral/mistral-medium-3-5",
        "gemini/gemini-3.1-flash-lite",
    ]
    monkeypatch.setattr(llm, "_model_registry", _raw_models(model_ids))
    monkeypatch.setattr(llm, "_verified_free_model_ids", frozenset(model_ids))

    assert llm.model_chain_for("multimodal") == model_ids
    assert llm._ordered_auto_chain("multimodal", has_image=True) == [
        "gemini/gemini-3-flash-preview",
        "mistral/mistral-medium-3-5",
        "gemini/gemini-3.1-flash-lite",
    ]


def test_picker_catalogue_lists_auto_then_mistral_models(monkeypatch) -> None:
    _configure_routing(monkeypatch)
    model_ids = [
        "mistral/mistral-medium-3-5",
        "mistral/mistral-large-latest",
        "mistral/mistral-small-latest",
        "groq/openai/gpt-oss-120b",
        "gemini/gemini-3-flash-preview",
    ]
    monkeypatch.setattr(settings, "chat_model_allowlist", ",".join(model_ids))
    monkeypatch.setattr(settings, "chat_picker_max", 6)
    monkeypatch.setattr(llm, "_model_registry", _raw_models(model_ids))
    monkeypatch.setattr(llm, "_verified_free_model_ids", frozenset(model_ids))
    monkeypatch.setattr(llm, "_catalogue_cache", [])
    monkeypatch.setattr(llm, "_catalogue_cached_at", 0.0)
    monkeypatch.setattr(llm, "get_model_health_state", lambda _model: "healthy")

    catalogue = asyncio.run(llm.get_chat_models_catalogue())

    assert [item.id for item in catalogue] == ["auto", *model_ids]
    assert [item.label for item in catalogue[1:4]] == [
        "Mistral Medium 3.5",
        "Mistral Large 3",
        "Mistral Small 4",
    ]
    assert [item.provider for item in catalogue[1:4]] == ["mistral"] * 3


def test_mistral_provider_budget_and_one_request_per_model_per_second(
    monkeypatch,
) -> None:
    _configure_routing(monkeypatch)
    assert llm._provider_limits("mistral") == (50, 400000)
    model = "mistral/mistral-medium-3-5"
    messages = [{"role": "user", "content": "Short prompt"}]

    async def use_budget_twice() -> float:
        await llm._wait_for_provider_budget(model, messages)
        started = time.monotonic()
        await llm._wait_for_provider_budget(model, messages)
        return time.monotonic() - started

    assert asyncio.run(use_budget_twice()) >= 0.95


def test_429_and_413_fall_through_to_next_configured_model(monkeypatch) -> None:
    _configure_routing(monkeypatch)
    monkeypatch.setattr(llm, "_response_cache", OrderedDict())
    monkeypatch.setattr(llm, "_response_model_cache", {})
    attempted: list[str] = []

    async def create_completion(**kwargs):
        model = kwargs["model"]
        attempted.append(model)
        if model == "mistral/mistral-medium-3-5":
            raise llm.OmniRouteError(
                "provider response",
                status_code=429,
                retry_after=1,
            )
        if model == "mistral/mistral-small-latest":
            raise llm.OmniRouteError(
                "request too large",
                status_code=413,
                error_type="InputTooLarge",
            )
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content="Fallback response"),
                    finish_reason="stop",
                )
            ]
        )

    monkeypatch.setattr(llm, "_create_completion", create_completion)

    answer = asyncio.run(
        llm.chat([{"role": "user", "content": "Help me study"}], task="teacher")
    )

    assert answer == "Fallback response"
    assert attempted == [
        "mistral/mistral-medium-3-5",
        "mistral/mistral-small-latest",
        "groq/openai/gpt-oss-120b",
    ]


def test_groq_is_skipped_for_prompts_over_6000_tokens(monkeypatch) -> None:
    _configure_routing(monkeypatch)
    messages = [{"role": "user", "content": "x" * 24_004}]

    filtered = llm._filter_request_chain(
        [
            "mistral/mistral-medium-3-5",
            "groq/openai/gpt-oss-120b",
            "gemini/gemini-3-flash-preview",
        ],
        messages,
    )

    assert "groq/openai/gpt-oss-120b" not in filtered
    assert "gemini/gemini-3-flash-preview" in filtered


def test_reasoning_tasks_never_hedge(monkeypatch) -> None:
    _configure_routing(monkeypatch)
    monkeypatch.setattr(settings, "chat_hedge_after_ms", 500)

    for task in ("solve", "grading", "code_debug", "viva", "mermaid", "ppt", "notes"):
        assert not llm._hedging_allowed(task)
    assert llm._hedging_allowed("teacher")


def test_first_token_timeout_does_not_cool_down_model(monkeypatch) -> None:
    _configure_routing(monkeypatch)
    model = "mistral/mistral-large-latest"
    error = llm.OmniRouteError("first token timeout", error_type="TimeoutError")

    llm._mark_model_failure(model, error)

    assert model not in llm._model_cooldowns
    assert llm._first_token_timeout("teacher") == settings.chat_first_token_timeout
    assert llm._first_token_timeout("json") == settings.json_first_token_timeout
    assert llm._first_token_timeout("solve") == settings.reasoning_first_token_timeout


def test_stream_first_token_uses_task_timeout(monkeypatch) -> None:
    _configure_routing(monkeypatch)
    observed_timeouts: list[float] = []

    async def raw_stream():
        yield SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason=None,
                    delta=SimpleNamespace(content="This response contains enough text."),
                )
            ]
        )

    async def create_stream(**_kwargs):
        return raw_stream()

    async def wait_for(awaitable, timeout):
        observed_timeouts.append(timeout)
        return await awaitable

    monkeypatch.setattr(llm, "_create_stream_with_retry", create_stream)
    monkeypatch.setattr(llm.asyncio, "wait_for", wait_for)

    result = asyncio.run(
        llm._get_stream_first_token(
            "groq/qwen/qwen3.8-27b",
            [{"role": "user", "content": "Reply OK"}],
            task="teacher",
        )
    )

    assert result.first_token
    assert observed_timeouts == [settings.chat_first_token_timeout]


def test_catalogue_probe_is_cached_for_fifteen_minutes(monkeypatch) -> None:
    _configure_routing(monkeypatch)
    model_id = "gemini/gemini-3-flash-preview"
    monkeypatch.setattr(settings, "chat_model_allowlist", model_id)
    monkeypatch.setattr(llm, "_model_registry", _raw_models([model_id]))
    monkeypatch.setattr(llm, "_verified_free_model_ids", frozenset({model_id}))
    monkeypatch.setattr(llm, "_catalogue_cache", [])
    monkeypatch.setattr(llm, "_catalogue_cached_at", 0.0)
    monkeypatch.setattr(llm, "_model_stats", {})
    calls: list[str] = []

    async def probe(model: str) -> None:
        calls.append(model)

    async def registry():
        return _raw_models([model_id])

    monkeypatch.setattr(llm, "_probe_catalogue_model", probe)
    monkeypatch.setattr(llm, "_refresh_model_registry", registry)

    async def refresh() -> None:
        await llm.get_chat_models_catalogue()
        monkeypatch.setattr(llm, "_catalogue_cache", [])
        monkeypatch.setattr(llm, "_catalogue_cached_at", 0.0)
        await llm.get_chat_models_catalogue()

    asyncio.run(refresh())

    assert calls == [model_id]


def test_api_model_probe_reuses_recent_probe_result(monkeypatch) -> None:
    _configure_routing(monkeypatch)
    calls = 0

    async def probe_details(model: str):
        nonlocal calls
        calls += 1
        return True, 0.01, ""

    monkeypatch.setattr(llm, "probe_model_details", probe_details)

    async def run_probes() -> None:
        assert await llm.probe_model("gemini/gemini-3-flash-preview")
        assert await llm.probe_model("gemini/gemini-3-flash-preview")

    asyncio.run(run_probes())

    assert calls == 1


def test_gateway_key_is_redacted_from_logged_error(monkeypatch, caplog) -> None:
    key = "gateway-key-unit-test-value"
    monkeypatch.setattr(settings, "omniroute_api_key", key)

    with caplog.at_level(logging.WARNING, logger=llm.__name__):
        llm.logger.warning("Gateway error: %s", llm._safe_excerpt(key))

    assert key not in caplog.text
    assert "[redacted-token]" in caplog.text


def test_retired_provider_identifiers_are_absent_from_code_and_config() -> None:
    backend = Path(__file__).resolve().parents[1]
    project = backend.parent
    files = [
        *backend.joinpath("app").rglob("*.py"),
        *project.joinpath("src").rglob("*.ts"),
        *project.joinpath("src").rglob("*.tsx"),
        backend / "README.md",
        backend / ".env.example",
    ]
    retired_terms = ("gh" + "models", "GITHUB" + "_MODELS", "github" + "_pat_")

    for path in files:
        text = path.read_text(encoding="utf-8")
        assert not any(term.lower() in text.lower() for term in retired_terms), path
