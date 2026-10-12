import asyncio
import base64
import contextvars
from dataclasses import dataclass
import email.utils
import inspect
import json
import logging
import math
import re
import statistics
import threading
import time
from collections import OrderedDict, defaultdict, deque
from collections.abc import AsyncGenerator, Callable, Sequence
from datetime import datetime, timezone
from typing import Any, Literal, TypeVar

import httpx
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    OpenAIError,
    RateLimitError,
)
from pydantic import BaseModel, ValidationError

from app.config import settings
from app.schemas import ChatModelCatalogueItem, ModelCapabilities

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)
_CACHE_LIMIT = 128
_response_cache: OrderedDict[str, str] = OrderedDict()
_response_model_cache: dict[str, str] = {}
_llm_semaphore = asyncio.Semaphore(max(1, settings.max_concurrent_llm))
_REASONING_OPEN = ("<think>", "<analysis>", "<reasoning>")
_REASONING_CLOSE = ("</think>", "</analysis>", "</reasoning>")
_HEALTH_CACHE_TTL = 15.0
_HEALTH_TIMEOUT_SECONDS = 5.0
_health_lock = asyncio.Lock()
_health_checked_at = 0.0
_health_result = (False, "not checked")
_last_completion_success_at = -float("inf")
_models_cache_ttl = 15.0
_models_checked_at = 0.0
_models_result: tuple[bool, list[str]] = (False, [])
_models_reason = "not checked"
_models_lock = asyncio.Lock()
_model_registry: dict[str, Any] | None = None
_model_registry_checked_at = 0.0
_model_registry_lock = asyncio.Lock()
_verified_free_model_ids: frozenset[str] = frozenset()
_MODEL_REGISTRY_CACHE_TTL = 30.0
_MODEL_COOLDOWN_DEFAULT_SECONDS = 60.0
_MODEL_COOLDOWN_MAX_SECONDS = 600.0
_model_state_lock = threading.RLock()
_model_cooldowns: dict[str, float] = {}
_model_last_success: dict[str, float] = {}
_unsupported_reasoning_effort: set[str] = set()
_request_model_callback: contextvars.ContextVar[Callable[[str], None] | None] = (
    contextvars.ContextVar("request_model_callback", default=None)
)

@dataclass
class ModelRequestRecord:
    timestamp: float
    ttft_ms: float | None
    duration_ms: float
    success: bool
    status_code: int | None

_model_stats: dict[str, deque[ModelRequestRecord]] = defaultdict(lambda: deque(maxlen=20))
_recent_429_timestamps: deque[float] = deque(maxlen=50)

_CHAT_MODEL_DESCRIPTIONS = {
    "gemini/gemini-3.5-flash-lite": "Quick everyday explanations for common school questions.",
    "gemini/gemini-flash-lite-latest": "Quick everyday explanations for common school questions.",
    "gemini/gemini-3.1-flash-lite": (
        "Compact answers for routine school questions; multi-step work may take longer."
    ),
    "gemini/gemini-3.6-flash": "General-purpose explanations for multi-step questions.",
    "gemini/gemini-3.7-flash": "General-purpose explanations for multi-step questions.",
    "gemini/gemini-3.8-flash": "General-purpose explanations for multi-step questions.",
    "gemini/gemini-2.5-flash": "Balanced speed and detail for everyday school subjects.",
    "gemini/gemini-2.5-pro": "Detailed explanations for challenging school and science questions.",
    "groq/llama-3.3-70b-versatile": "General-purpose answers across school subjects.",
    "groq/meta-llama/llama-4-scout-17b-16e-instruct": (
        "Quick answers for everyday questions and image-based prompts."
    ),
    "groq/qwen/qwen3-32b": "Step-by-step explanations for school maths and science.",
    "groq/qwen/qwen3.6-27b": "Step-by-step explanations for school maths and science.",
    "groq/qwen/qwen3.8-27b": "Step-by-step explanations for school maths and science.",
    "groq/openai/gpt-oss-safeguard-20b": (
        "Quick, concise answers for routine school questions."
    ),
}

_SCHOOL_CORRECTNESS_VERIFIED_MODELS: frozenset[str] = frozenset(
    {
        "gemini/gemini-3.5-flash-lite",
        "gemini/gemini-3.1-flash-lite",
        "groq/openai/gpt-oss-safeguard-20b",
    }
)
_VISION_VERIFIED_MODELS: frozenset[str] = frozenset(
    {"gemini/gemini-3.5-flash-lite"}
)

_CONNECT_TIMEOUT_SECONDS = float(settings.chat_connect_timeout_seconds or 3.0)
_http_limits = httpx.Limits(
    max_keepalive_connections=20,
    max_connections=40,
    keepalive_expiry=30.0,
)
_http_client = httpx.AsyncClient(
    timeout=httpx.Timeout(
        180.0,
        connect=_CONNECT_TIMEOUT_SECONDS,
        pool=_CONNECT_TIMEOUT_SECONDS,
    ),
    limits=_http_limits,
)
_client = AsyncOpenAI(
    base_url=settings.omniroute_base_url,
    api_key=settings.omniroute_api_key or "not-configured",
    max_retries=0,
    http_client=_http_client,
)

_TASK_ROLE: dict[str, str] = {
    "teacher": "teacher",
    "practice": "practice",
    "ppt": "json",
    "mcq": "json",
    "flashcard": "json",
    "split": "json",
    "viva_questions": "reasoning",
    "evaluation_feedback": "reasoning",
    "grading": "reasoning",
    "code_debug": "reasoning",
    "notes": "multimodal",
    "chat": "teacher",
    "tutor": "teacher",
    "general": "teacher",
    "multimodal": "multimodal",
    "solve": "reasoning",
    "reasoning": "reasoning",
    "viva": "reasoning",
    "code": "reasoning",
    "mermaid": "reasoning",
    "json": "json",
    "vision": "multimodal",
    "image": "multimodal",
    "document": "multimodal",
    "long_document": "multimodal",
}

_TASK_REASONING_SETTINGS: dict[str, str] = {
    "ppt": "reasoning_effort_ppt",
    "mcq": "reasoning_effort_mcq",
    "flashcard": "reasoning_effort_flashcard",
    "notes": "reasoning_effort_notes",
    "split": "reasoning_effort_split",
    "viva_questions": "reasoning_effort_viva_questions",
    "mermaid": "reasoning_effort_mermaid",
    "evaluation_feedback": "reasoning_effort_evaluation_feedback",
    "practice": "reasoning_effort_practice",
    "solve": "reasoning_effort_solve",
    "grading": "reasoning_effort_grading",
    "code_debug": "reasoning_effort_code_debug",
    "chat": "reasoning_effort_chat",
    "teacher": "reasoning_effort_chat",
}


class OmniRouteError(RuntimeError):
    """Raised when OmniRoute cannot provide a completion."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        error_type: str = "OmniRouteError",
        response_excerpt: str = "",
        retry_after: float | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_type = error_type
        self.response_excerpt = response_excerpt
        self.retry_after = retry_after


class JsonCallError(ValueError):
    def __init__(
        self,
        step: str,
        error: Exception,
        response_excerpt: str,
        raw_response: str = "",
    ) -> None:
        self.step = step
        self.error_type = type(error).__name__
        self.response_excerpt = response_excerpt
        self.raw_response = raw_response
        reason = response_excerpt or "The model returned an empty response."
        super().__init__(
            f"{step} failed JSON validation ({self.error_type}): {reason}"
        )


def _safe_excerpt(text: str) -> str:
    text = re.sub(r"(?i)bearer\s+\S+", "Bearer [redacted]", text)
    text = re.sub(r"sk-[A-Za-z0-9_-]{8,}", "[redacted-key]", text)
    return re.sub(r"\s+", " ", text).strip()[:200]


def _format_omniroute_error(
    error: OpenAIError, model: str | None = None
) -> tuple[str, int | None, str]:
    if isinstance(error, APIConnectionError):
        return (
            f"Cannot connect to OmniRoute at {settings.omniroute_base_url}. Is it running?",
            None,
            "",
        )
    if isinstance(error, APITimeoutError):
        return ("OmniRoute timed out", None, "")

    status_code = error.status_code if isinstance(error, APIStatusError) else None
    response_body = (
        error.response.text if isinstance(error, APIStatusError) else str(error)
    )
    excerpt = _safe_excerpt(response_body)

    if status_code == 503 and "queue budget" in response_body.lower():
        return (
            "OmniRoute's AI provider queue is full. Wait briefly, then retry, or select a different model in OmniRoute.",
            status_code,
            excerpt,
        )
    if status_code in (401, 403):
        return ("OmniRoute rejected the API key", status_code, excerpt)
    if status_code == 404:
        return (
            f"Model not found in OmniRoute: {model or 'unknown'}",
            status_code,
            excerpt,
        )
    if status_code == 429:
        return (
            "Rate limit reached on the AI provider. Try again in a moment.",
            status_code,
            excerpt,
        )
    if status_code is not None:
        return (f"OmniRoute returned HTTP {status_code}: {excerpt}", status_code, excerpt)

    return (
        f"Cannot connect to OmniRoute at {settings.omniroute_base_url}. Is it running?",
        None,
        excerpt,
    )

_NEVER_ALLOWED_MODEL_PROVIDERS = frozenset(
    {
        "anthropic",
        "openai",
        "ddgw",
        "auto",
        "agy",
        "antigravity",
        "aug",
        "copilot",
        "cxa",
        "dva",
        "gc",
        "gh",
        "github",
        "github-copilot",
        "grok",
        "grok-build",
        "grok-cli",
        "no-think",
        "zc",
    }
)


def _is_forbidden_model(model_id: str) -> bool:
    normalized = model_id.strip().lower()
    provider = normalized.split("/", 1)[0].strip() if "/" in normalized else "omniroute"
    return (
        provider not in settings.free_provider_set
        or provider in settings.paid_provider_set | _NEVER_ALLOWED_MODEL_PROVIDERS
        or normalized.startswith("eduai-")
    )


def _reject_forbidden_model(model_id: str) -> None:
    if _is_forbidden_model(model_id):
        provider = model_id.strip().split("/", 1)[0]
        raise OmniRouteError(
            f"Model provider '{provider}' is disabled in this free application.",
            status_code=400,
            error_type="ForbiddenModelProvider",
        )


def model_for(task: str) -> str:
    role = _TASK_ROLE.get(task.strip().lower(), "teacher")
    configured = {
        "teacher": settings.model_teacher,
        "practice": settings.model_practice,
        "reasoning": settings.model_reasoning,
        "multimodal": settings.model_multimodal,
        "json": settings.model_json,
    }
    for model in (configured[role], settings.model_teacher):
        model = model.strip()
        if model and model in _verified_free_model_ids:
            return model
    return ""


def model_chain_for(task: str) -> list[str]:
    role = _TASK_ROLE.get(task.strip().lower(), "teacher")
    primary = model_for(role)
    fallbacks = getattr(settings, f"model_{role}_fallbacks").split(",")
    return list(
        dict.fromkeys(
            model
            for model in [primary, *(m.strip() for m in fallbacks)]
            if model and model in _verified_free_model_ids
        )
    )


def record_model_request(
    model: str,
    *,
    ttft_ms: float | None,
    duration_ms: float,
    success: bool,
    status_code: int | None = None,
) -> None:
    if ttft_ms is not None and (not math.isfinite(ttft_ms) or ttft_ms < 0):
        ttft_ms = None
    now = time.monotonic()
    with _model_state_lock:
        if status_code == 429:
            _recent_429_timestamps.append(now)
        _model_stats[model].append(
            ModelRequestRecord(
                timestamp=now,
                ttft_ms=ttft_ms,
                duration_ms=duration_ms,
                success=success,
                status_code=status_code,
            )
        )


def get_median_ttft_ms(model: str) -> float | None:
    with _model_state_lock:
        records = _model_stats.get(model)
        if not records:
            return None
        valid = [
            r.ttft_ms
            for r in records
            if r.success
            and r.ttft_ms is not None
            and math.isfinite(r.ttft_ms)
            and r.ttft_ms >= 0
        ]
        if not valid:
            return None
        return round(float(statistics.median(valid)), 1)


def is_hedging_safe() -> bool:
    now = time.monotonic()
    with _model_state_lock:
        count_429 = sum(1 for t in _recent_429_timestamps if now - t <= 60.0)
        return count_429 < 3


def get_model_health_state(model: str) -> Literal["healthy", "slow", "cooling_down", "unknown"]:
    now = time.monotonic()
    with _model_state_lock:
        cooldown_until = _model_cooldowns.get(model, 0.0)
        if cooldown_until > now:
            return "cooling_down"
        records = _model_stats.get(model)
        if not records:
            return "unknown"
        valid_ttft = [r.ttft_ms for r in records if r.success and r.ttft_ms is not None]
        if valid_ttft and statistics.median(valid_ttft) > 4000.0:
            return "slow"
        recent_successes = [r for r in records if r.success and (now - r.timestamp) <= 300.0]
        if recent_successes:
            return "healthy"
        return "unknown"


def _mark_model_timeout_cooldown(model: str, seconds: float = 60.0) -> None:
    with _model_state_lock:
        _model_cooldowns[model] = time.monotonic() + seconds


def _ordered_model_chain(chain: Sequence[str]) -> list[str]:
    now = time.monotonic()
    with _model_state_lock:
        available = [model for model in chain if _model_cooldowns.get(model, 0) <= now]
        if available:
            def sort_key(m: str) -> tuple[float, int]:
                median = get_median_ttft_ms(m)
                ttft_val = median if median is not None else 99999.0
                return (ttft_val, chain.index(m) if m in chain else 999)
            sorted_avail = sorted(available, key=sort_key)
            return sorted_avail + [model for model in chain if model not in available]
        return sorted(chain, key=lambda model: _model_cooldowns.get(model, 0))


def model_health(model: str) -> dict[str, Any]:
    now = time.monotonic()
    with _model_state_lock:
        cooldown_until = _model_cooldowns.get(model, 0.0)
        last_success = _model_last_success.get(model)
    return {
        "coolingDown": cooldown_until > now,
        "cooldownSeconds": max(0, round(cooldown_until - now, 1)),
        "lastSuccess": (
            datetime.fromtimestamp(last_success, timezone.utc).isoformat()
            if last_success is not None
            else None
        ),
        "health": get_model_health_state(model),
        "medianTtftMs": get_median_ttft_ms(model),
    }


def set_request_model_callback(callback: Callable[[str], None] | None) -> contextvars.Token:
    return _request_model_callback.set(callback)


def reset_request_model_callback(token: contextvars.Token) -> None:
    _request_model_callback.reset(token)


def recent_completion_success() -> bool:
    return time.monotonic() - _last_completion_success_at <= 120.0


def _mark_model_success(model: str, started_at: float) -> None:
    global _last_completion_success_at
    now = time.monotonic()
    duration_ms = (time.perf_counter() - started_at) * 1000
    with _model_state_lock:
        _model_cooldowns.pop(model, None)
        _model_last_success[model] = time.time()
        _last_completion_success_at = now
    callback = _request_model_callback.get()
    if callback is not None:
        callback(model)
    logger.info(
        "llm_model_served model=%s latency_ms=%.2f",
        model,
        duration_ms,
    )


def _retry_after_seconds(error: OmniRouteError) -> float:
    if error.retry_after is not None:
        return min(_MODEL_COOLDOWN_MAX_SECONDS, max(0.0, error.retry_after))
    return _MODEL_COOLDOWN_DEFAULT_SECONDS


def _parse_retry_after(error: OpenAIError) -> float | None:
    if not isinstance(error, APIStatusError):
        return None
    value = error.response.headers.get("retry-after")
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            return max(
                0.0,
                email.utils.parsedate_to_datetime(value).timestamp() - time.time(),
            )
        except (TypeError, ValueError, OverflowError):
            return None


def _mark_model_failure(model: str, error: OmniRouteError) -> None:
    now = time.monotonic()
    if error.status_code == 429:
        with _model_state_lock:
            _recent_429_timestamps.append(now)
    if error.status_code not in {429} and not (
        error.status_code is not None and error.status_code >= 500
    ) and error.error_type not in {"TimeoutError", "APITimeoutError"}:
        return
    with _model_state_lock:
        _model_cooldowns[model] = time.monotonic() + _retry_after_seconds(error)


def _can_fallback(error: OmniRouteError) -> bool:
    return (
        error.status_code == 404
        or error.status_code == 429
        or (error.status_code is not None and error.status_code >= 500)
        or error.error_type in {"APITimeoutError", "APIConnectionError", "TimeoutError"}
    )


def reasoning_effort_for(task: str) -> str | None:
    setting_name = _TASK_REASONING_SETTINGS.get(task.strip().lower())
    if setting_name is None:
        return None
    effort = getattr(settings, setting_name).strip().lower()
    return effort or None


class CompletionTruncated(ValueError):
    def __init__(self, content: str, completion_tokens: int | None) -> None:
        self.content = content
        self.completion_tokens = completion_tokens
        super().__init__("OmniRoute truncated the completion at its token limit")


def _cache_key(
    model: str,
    messages: Sequence[dict[str, Any]],
    temperature: float,
    max_tokens: int | None,
) -> str:
    serialized = json.dumps(
        [model, messages, temperature, max_tokens],
        sort_keys=True,
        ensure_ascii=False,
        default=str,
    )
    return serialized


def _retryable(error: Exception) -> bool:
    if isinstance(error, (APIConnectionError, APITimeoutError, RateLimitError)):
        return True
    if isinstance(error, APIStatusError):
        if error.status_code == 503 and "queue budget" in error.response.text.lower():
            return False
        return error.status_code == 429 or error.status_code >= 500
    return False


def _retry_delay(error: Exception, retry_index: int) -> float:
    default_delay = 0.25 * (2**retry_index)
    if isinstance(error, APIStatusError) and error.status_code == 429:
        headers = getattr(error.response, "headers", None)
        if headers:
            retry_after = headers.get("retry-after") or headers.get("Retry-After")
            if retry_after:
                try:
                    delay = float(retry_after)
                    if delay >= 0:
                        return min(20.0, delay)
                except (ValueError, TypeError):
                    pass
    return default_delay


async def _create_completion(**kwargs: Any) -> Any:
    diagnostic_step = kwargs.pop("diagnostic_step", None)
    model = str(kwargs.get("model", ""))
    raw_model = await _require_verified_free_model(model)
    if kwargs.get("max_tokens") is not None:
        kwargs["max_tokens"] = _effective_max_tokens(
            model,
            kwargs["max_tokens"],
            raw_model,
        )
    with _model_state_lock:
        if model in _unsupported_reasoning_effort:
            kwargs.pop("reasoning_effort", None)
    fallback_retried = False
    retry_count = 0
    attempt = 0
    while attempt < 4:
        attempt += 1
        queued_at = time.perf_counter()
        started_at: float | None = None
        queue_ms = 0.0
        try:
            async with _llm_semaphore:
                started_at = time.perf_counter()
                queue_ms = (started_at - queued_at) * 1000
                response = await _client.chat.completions.create(**kwargs)
            choices = getattr(response, "choices", ())
            choice = choices[0] if choices else None
            usage = getattr(response, "usage", None)
            completion_tokens = getattr(usage, "completion_tokens", None)
            completion_details = getattr(usage, "completion_tokens_details", None)
            reasoning_tokens = getattr(completion_details, "reasoning_tokens", None)
            if isinstance(usage, dict):
                completion_tokens = usage.get("completion_tokens")
                completion_details = usage.get("completion_tokens_details")
                if isinstance(completion_details, dict):
                    reasoning_tokens = completion_details.get("reasoning_tokens")
            message = getattr(choice, "message", None)
            content = getattr(message, "content", None)
            logger.info(
                "llm_completion step=%s requested_model=%s response_model=%s "
                "requested_max_tokens=%s completion_tokens=%s reasoning_tokens=%s "
                "requested_reasoning_effort=%s content_chars=%s finish_reason=%s "
                "duration_ms=%.2f queue_ms=%.2f "
                "attempt=%d",
                diagnostic_step or "unspecified",
                kwargs.get("model", "unknown"),
                getattr(response, "model", "unknown"),
                kwargs.get("max_tokens", "default"),
                completion_tokens if completion_tokens is not None else "unknown",
                reasoning_tokens if reasoning_tokens is not None else "unknown",
                kwargs.get("reasoning_effort", "default"),
                len(content) if isinstance(content, str) else "unknown",
                getattr(choice, "finish_reason", "unknown"),
                (time.perf_counter() - started_at) * 1000 if started_at else 0.0,
                queue_ms,
                attempt,
            )
            if getattr(choice, "finish_reason", None) == "length":
                raise CompletionTruncated(
                    content if isinstance(content, str) else "",
                    completion_tokens,
                )
            return response
        except OpenAIError as error:
            elapsed_ms = (
                (time.perf_counter() - started_at) * 1000 if started_at else 0.0
            )
            queue_ms = (
                (started_at - queued_at) * 1000 if started_at else 0.0
            )
            status_code = error.status_code if isinstance(error, APIStatusError) else None
            error_message = (
                error.response.text
                if isinstance(error, APIStatusError)
                else str(error)
            )
            effort_rejected = (
                status_code in {400, 422}
                and "reasoning_effort" in kwargs
                and any(
                    term in error_message.lower()
                    for term in ("reasoning_effort", "reasoning effort", "unknown parameter", "unsupported parameter")
                )
            )
            if effort_rejected and not fallback_retried:
                kwargs.pop("reasoning_effort")
                with _model_state_lock:
                    _unsupported_reasoning_effort.add(model)
                fallback_retried = True
                logger.warning(
                    "OmniRoute rejected reasoning_effort; retrying once without it "
                    "step=%s requested_model=%s status_code=%s error_type=%s",
                    diagnostic_step or "unspecified",
                    kwargs.get("model", "unknown"),
                    status_code,
                    type(error).__name__,
                )
                continue
            if not _retryable(error) or retry_count >= 2:
                response_body = (
                    error.response.text if isinstance(error, APIStatusError) else str(error)
                )
                excerpt = _safe_excerpt(response_body)
                logger.warning(
                    "OmniRoute completion failed step=%s status_code=%s error_type=%s response_excerpt=%r",
                    diagnostic_step or "unspecified",
                    status_code,
                    type(error).__name__,
                    excerpt if diagnostic_step else "[omitted]",
                )
                logger.info(
                    "llm_completion_failed step=%s requested_model=%s status_code=%s "
                    "error_type=%s duration_ms=%.2f queue_ms=%.2f attempt=%d",
                    diagnostic_step or "unspecified",
                    kwargs.get("model", "unknown"),
                    status_code,
                    type(error).__name__,
                    elapsed_ms,
                    queue_ms,
                    attempt,
                )
                reason, code, excerpt = _format_omniroute_error(
                    error, kwargs.get("model")
                )
                raise OmniRouteError(
                    reason,
                    status_code=code,
                    error_type=type(error).__name__,
                    response_excerpt=excerpt,
                    retry_after=_parse_retry_after(error),
                ) from error
            logger.info(
                "llm_completion_retry step=%s requested_model=%s status_code=%s "
                "error_type=%s duration_ms=%.2f queue_ms=%.2f attempt=%d",
                diagnostic_step or "unspecified",
                kwargs.get("model", "unknown"),
                error.status_code if isinstance(error, APIStatusError) else None,
                type(error).__name__,
                elapsed_ms,
                queue_ms,
                attempt,
            )
            await asyncio.sleep(_retry_delay(error, retry_count))
            retry_count += 1
    raise RuntimeError("Unreachable retry state")


async def chat(
    messages: Sequence[dict[str, Any]],
    task: str = "teacher",
    temperature: float = 0.4,
    *,
    timeout: float | None = None,
    max_tokens: int | None = None,
    diagnostic_step: str | None = None,
    model: str | None = None,
) -> str:
    await _refresh_model_registry()
    requested_model = model or model_for(task)
    if model and model.strip().lower() != "auto":
        await _require_verified_free_model(model.strip())
    key = _cache_key(requested_model, messages, temperature, max_tokens)
    cacheable = task.strip().lower() != "practice"
    if cacheable and key in _response_cache:
        _response_cache.move_to_end(key)
        cached_model = _response_model_cache.get(key, requested_model)
        callback = _request_model_callback.get()
        if callback is not None:
            callback(cached_model)
        return _response_cache[key]

    chain = _ordered_model_chain([model] if model and model.strip() and model.strip().lower() != "auto" else model_chain_for(task))
    reasoning_effort = reasoning_effort_for(task)
    last_error: OmniRouteError | None = None
    for model in chain:
        completion_options: dict[str, Any] = {
            "model": model,
            "messages": list(messages),
            "temperature": temperature,
        }
        if timeout is not None:
            completion_options["timeout"] = timeout
        if max_tokens is not None:
            completion_options["max_tokens"] = max_tokens
        with _model_state_lock:
            effort_supported = model not in _unsupported_reasoning_effort
        if reasoning_effort and effort_supported:
            completion_options["reasoning_effort"] = reasoning_effort
        if diagnostic_step:
            completion_options["diagnostic_step"] = diagnostic_step
        started_at = time.perf_counter()
        try:
            response = await _create_completion(**completion_options)
        except CompletionTruncated as error:
            last_error = OmniRouteError(
                "The model exhausted its completion-token budget before finishing.",
                status_code=502,
                error_type="CompletionTruncated",
            )
            _mark_model_failure(model, last_error)
            logger.info(
                "llm_model_fallback model=%s error_type=%s completion_tokens=%s",
                model,
                type(error).__name__,
                error.completion_tokens if error.completion_tokens is not None else "unknown",
            )
            continue
        except OmniRouteError as error:
            last_error = error
            _mark_model_failure(model, error)
            if not _can_fallback(error):
                raise
            logger.info(
                "llm_model_fallback model=%s status_code=%s error_type=%s",
                model,
                error.status_code,
                error.error_type,
            )
            continue
        result = response.choices[0].message.content or ""
        if not result.strip():
            last_error = OmniRouteError(
                "The model returned an empty completion.",
                status_code=502,
                error_type="EmptyCompletion",
            )
            _mark_model_failure(model, last_error)
            logger.info(
                "llm_model_fallback model=%s status_code=%s error_type=%s",
                model,
                last_error.status_code,
                last_error.error_type,
            )
            continue
        _mark_model_success(model, started_at)
        break
    else:
        if last_error is not None:
            raise last_error
        raise OmniRouteError("No model is configured for this task.")

    if cacheable:
        _response_cache[key] = result
        _response_model_cache[key] = model
        _response_cache.move_to_end(key)
        while len(_response_cache) > _CACHE_LIMIT:
            oldest, _ = _response_cache.popitem(last=False)
            _response_model_cache.pop(oldest, None)
    return result


async def stream(
    messages: Sequence[dict[str, Any]],
    task: str = "teacher",
    temperature: float = 0.4,
    *,
    max_tokens: int | None = None,
    reasoning_effort: str | None = None,
) -> AsyncGenerator[str, None]:
    await _refresh_model_registry()
    chain = _ordered_model_chain(model_chain_for(task))
    effort = reasoning_effort if reasoning_effort is not None else reasoning_effort_for(task)
    last_error: OmniRouteError | None = None
    for model in chain:
        last_error = None
        pending = ""
        in_reasoning = False
        sent_text = False
        started_at = time.perf_counter()

        def extract_final_text(text: str, final: bool = False) -> str:
            nonlocal pending, in_reasoning
            pending += text
            output: list[str] = []
            while pending:
                if in_reasoning:
                    matches = [
                        (pending.find(marker), marker)
                        for marker in _REASONING_CLOSE
                        if pending.find(marker) >= 0
                    ]
                    if not matches:
                        if final:
                            pending = ""
                        else:
                            keep = max(len(marker) for marker in _REASONING_CLOSE) - 1
                            pending = pending[-keep:] if keep else ""
                        break
                    position, marker = min(matches)
                    pending = pending[position + len(marker) :]
                    in_reasoning = False
                    continue
                matches = [
                    (pending.find(marker), marker)
                    for marker in _REASONING_OPEN
                    if pending.find(marker) >= 0
                ]
                if matches:
                    position, marker = min(matches)
                    output.append(pending[:position])
                    pending = pending[position + len(marker) :]
                    in_reasoning = True
                    continue
                if final:
                    output.append(pending)
                    pending = ""
                else:
                    keep = max(len(marker) for marker in _REASONING_OPEN) - 1
                    emit_length = max(0, len(pending) - keep)
                    output.append(pending[:emit_length])
                    pending = pending[emit_length:]
                break
            return "".join(output)

        stream_options: dict[str, Any] = {
            "model": model,
            "messages": list(messages),
            "temperature": temperature,
        }
        if max_tokens is not None:
            stream_options["max_tokens"] = max_tokens
        with _model_state_lock:
            effort_supported = model not in _unsupported_reasoning_effort
        if effort and effort_supported:
            stream_options["reasoning_effort"] = effort
        try:
            async with _llm_semaphore:
                response = await _create_stream_with_retry(**stream_options)
                callback = _request_model_callback.get()
                if callback is not None:
                    callback(model)

                first_event = None
                try:
                    first_event = await asyncio.wait_for(
                        anext(response),
                        timeout=float(settings.chat_first_token_timeout),
                    )
                except asyncio.TimeoutError:
                    await _close_stream(response)
                    timeout_error = OmniRouteError(
                        f"Model {model} did not return a first token within {settings.chat_first_token_timeout}s.",
                        status_code=None,
                        error_type="TimeoutError",
                    )
                    _mark_model_failure(model, timeout_error)
                    logger.warning(
                        "llm_model_first_token_timeout model=%s timeout_seconds=%s",
                        model,
                        settings.chat_first_token_timeout,
                    )
                    last_error = timeout_error
                    if not _can_fallback(timeout_error):
                        raise timeout_error
                    continue
                if first_event is not None:
                    delta = first_event.choices[0].delta
                    content = delta.content
                    if isinstance(content, str) and content:
                        final_text = extract_final_text(content)
                        if final_text:
                            sent_text = True
                            yield final_text
                    async for event in response:
                        choice = event.choices[0]
                        if getattr(choice, "finish_reason", None) == "length":
                            last_error = OmniRouteError(
                                "The model exhausted its completion-token budget before finishing.",
                                status_code=502,
                                error_type="CompletionTruncated",
                            )
                            break
                        delta = choice.delta
                        content = delta.content
                        if isinstance(content, str) and content:
                            final_text = extract_final_text(content)
                            if final_text:
                                sent_text = True
                                yield final_text
                if last_error is not None:
                    raise last_error
                remaining = extract_final_text("", final=True)
                if remaining:
                    sent_text = True
                    yield remaining
                if not sent_text:
                    last_error = OmniRouteError(
                        "The model returned an empty completion.",
                        status_code=502,
                        error_type="EmptyCompletion",
                    )
                    _mark_model_failure(model, last_error)
                    continue
            _mark_model_success(model, started_at)
            return
        except OmniRouteError as error:
            last_error = error
        except OpenAIError as error:
            reason, code, excerpt = _format_omniroute_error(error, model)
            last_error = OmniRouteError(
                reason,
                status_code=code,
                error_type=type(error).__name__,
                response_excerpt=excerpt,
                retry_after=_parse_retry_after(error),
            )
        if last_error is None:
            raise RuntimeError("Streaming model failed without an error.")
        _mark_model_failure(model, last_error)
        if sent_text or not _can_fallback(last_error):
            raise last_error
        logger.info(
            "llm_model_fallback model=%s status_code=%s error_type=%s streaming=true",
            model,
            last_error.status_code,
            last_error.error_type,
        )
    if last_error is not None:
        raise last_error
    raise OmniRouteError("No model is configured for this task.")


async def _create_stream_with_retry(**kwargs: Any) -> Any:
    model = str(kwargs.get("model", ""))
    raw_model = await _require_verified_free_model(model)
    if kwargs.get("max_tokens") is not None:
        kwargs["max_tokens"] = _effective_max_tokens(
            model,
            kwargs["max_tokens"],
            raw_model,
        )
    with _model_state_lock:
        if model in _unsupported_reasoning_effort:
            kwargs.pop("reasoning_effort", None)
    fallback_retried = False
    retry_count = 0
    attempt = 0
    while attempt < 4:
        attempt += 1
        try:
            return await _client.chat.completions.create(stream=True, **kwargs)
        except OpenAIError as error:
            status_code = (
                error.status_code if isinstance(error, APIStatusError) else None
            )
            error_message = (
                error.response.text
                if isinstance(error, APIStatusError)
                else str(error)
            )
            effort_rejected = (
                status_code in {400, 422}
                and "reasoning_effort" in kwargs
                and any(
                    term in error_message.lower()
                    for term in (
                        "reasoning_effort",
                        "reasoning effort",
                        "unknown parameter",
                        "unsupported parameter",
                    )
                )
            )
            if effort_rejected and not fallback_retried:
                kwargs.pop("reasoning_effort")
                with _model_state_lock:
                    _unsupported_reasoning_effort.add(model)
                fallback_retried = True
                logger.warning(
                    "OmniRoute stream rejected reasoning_effort; retrying once without it "
                    "requested_model=%s status_code=%s error_type=%s",
                    kwargs.get("model", "unknown"),
                    status_code,
                    type(error).__name__,
                )
                continue
            retry_limit = (
                1
                if isinstance(error, (APIConnectionError, APITimeoutError))
                else 2
            )
            if not _retryable(error) or retry_count >= retry_limit:
                logger.warning(
                    "OmniRoute stream setup failed (%s)", type(error).__name__
                )
                reason, code, excerpt = _format_omniroute_error(
                    error, kwargs.get("model")
                )
                raise OmniRouteError(
                    reason,
                    status_code=code,
                    error_type=type(error).__name__,
                    response_excerpt=excerpt,
                    retry_after=_parse_retry_after(error),
                ) from error
            await asyncio.sleep(_retry_delay(error, retry_count))
            retry_count += 1
    raise RuntimeError("Unreachable retry state")


def _extract_json(text: str) -> str:
    cleaned = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", text, flags=re.IGNORECASE)
    starts = [pos for pos in (cleaned.find("{"), cleaned.find("[")) if pos >= 0]
    if not starts:
        raise ValueError("No JSON object or array found in the response")
    start = min(starts)
    opening = cleaned[start]
    closing = "}" if opening == "{" else "]"
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(cleaned)):
        char = cleaned[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == opening:
            depth += 1
        elif char == closing:
            depth -= 1
            if depth == 0:
                return cleaned[start : index + 1]
    raise ValueError("The JSON response contains an incomplete object or array")


async def json_call(
    messages: Sequence[dict[str, Any]],
    response_model: type[T],
    task: str = "json",
    *,
    step: str | None = None,
    timeout: float | None = None,
    max_tokens: int | None = None,
    validator: Callable[[T], None] | None = None,
    repair_invalid: bool = True,
) -> T:
    request_messages = list(messages)
    request_messages.append(
        {"role": "system", "content": "Return ONLY valid JSON. Do not include markdown."}
    )
    chat_options: dict[str, Any] = {}
    if timeout is not None:
        chat_options["timeout"] = timeout
    if max_tokens is not None:
        chat_options["max_tokens"] = max_tokens
    if step:
        chat_options["diagnostic_step"] = step
    raw = await chat(
        request_messages,
        task=task,
        temperature=0.2,
        **chat_options,
    )
    for attempt in range(2 if repair_invalid else 1):
        try:
            result = response_model.model_validate_json(_extract_json(raw))
            if validator:
                validator(result)
            return result
        except (ValidationError, ValueError, json.JSONDecodeError) as error:
            if attempt == (1 if repair_invalid else 0):
                if step:
                    excerpt = _safe_excerpt(raw)
                    logger.warning(
                        "Model JSON step failed step=%s status_code=%s error_type=%s response_excerpt=%r",
                        step,
                        None,
                        type(error).__name__,
                        excerpt,
                    )
                    raise JsonCallError(step, error, excerpt, raw) from error
                raise ValueError(f"Could not validate JSON response: {error}") from error
            request_messages.append(
                {
                    "role": "assistant",
                    "content": raw,
                }
            )
            request_messages.append(
                {
                    "role": "user",
                    "content": (
                        f"Repair your previous response. Return ONLY valid JSON matching "
                        f"{response_model.__name__}. Validation error: {error}"
                    ),
                }
            )
            raw = await chat(
                request_messages,
                task=task,
                temperature=0.2,
                **chat_options,
            )
    raise RuntimeError("Unreachable JSON repair state")


async def vision(images: Sequence[bytes | str], prompt: str) -> str:
    parts: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for image in images:
        if isinstance(image, bytes):
            encoded = base64.b64encode(image).decode("ascii")
            data_url = f"data:image/png;base64,{encoded}"
        elif image.startswith("data:"):
            data_url = image
        else:
            data_url = f"data:image/png;base64,{image}"
        parts.append({"type": "image_url", "image_url": {"url": data_url}})
    return await chat(
        [{"role": "user", "content": parts}], task="multimodal", temperature=0.2
    )


async def check_models() -> tuple[bool, str]:
    global _health_checked_at, _health_result
    now = time.monotonic()
    if now - _health_checked_at < _HEALTH_CACHE_TTL:
        return _health_result
    async with _health_lock:
        now = time.monotonic()
        if now - _health_checked_at < _HEALTH_CACHE_TTL:
            return _health_result
        try:
            async with asyncio.timeout(_HEALTH_TIMEOUT_SECONDS):
                reachable, _ = await list_models()
            failure_reason = _models_reason
        except TimeoutError:
            reachable = False
            failure_reason = "timeout"
        if reachable:
            _health_result = (True, "ok")
        elif time.monotonic() - _last_completion_success_at <= 120.0:
            _health_result = (True, "recent completion")
        else:
            _health_result = (False, failure_reason)
            logger.info("OmniRoute gateway health check failed reason=%s", failure_reason)
        _health_checked_at = time.monotonic()
        return _health_result


async def list_models() -> tuple[bool, list[str]]:
    global _models_checked_at, _models_result, _models_reason
    now = time.monotonic()
    if now - _models_checked_at < _models_cache_ttl:
        return _models_result[0], list(_models_result[1])
    async with _models_lock:
        now = time.monotonic()
        if now - _models_checked_at < _models_cache_ttl:
            return _models_result[0], list(_models_result[1])
        started_at = time.perf_counter()
        try:
            async with asyncio.timeout(_HEALTH_TIMEOUT_SECONDS):
                response = await _client.models.list(
                    timeout=_HEALTH_TIMEOUT_SECONDS
                )
            _models_result = (True, [item.id for item in response.data])
            _models_reason = "ok"
            logger.info(
                "omniroute_models_list_succeeded latency_ms=%.2f",
                (time.perf_counter() - started_at) * 1000,
            )
        except TimeoutError:
            _models_result = (False, [])
            _models_reason = "timeout"
            logger.info("OmniRoute models list failed reason=timeout")
        except OpenAIError as error:
            _models_result = (False, [])
            _models_reason = (
                f"HTTP {error.status_code}"
                if isinstance(error, APIStatusError)
                else "connection"
                if isinstance(error, APIConnectionError)
                else "provider error"
            )
            logger.info(
                "OmniRoute models list failed reason=%s error_type=%s",
                _models_reason,
                type(error).__name__,
            )
        _models_checked_at = time.monotonic()
        return _models_result[0], list(_models_result[1])


async def probe_model_details(model_id: str) -> tuple[bool, float, str]:
    if not model_id:
        return False, 0.0, "model is not configured"
    started_at = time.perf_counter()
    try:
        async with asyncio.timeout(20):
            response = await _create_completion(
                model=model_id,
                messages=[{"role": "user", "content": "Reply OK."}],
                temperature=0,
                max_tokens=16,
                timeout=20,
            )
        elapsed = time.perf_counter() - started_at
        choices = getattr(response, "choices", ())
        choice = choices[0] if choices else None
        message = getattr(choice, "message", None)
        content = getattr(message, "content", None)
        if not isinstance(content, str) or not content.strip():
            finish_reason = getattr(choice, "finish_reason", "unknown")
            return (
                False,
                elapsed,
                f"HTTP 200 empty completion (finish_reason={finish_reason})",
            )
        return True, elapsed, ""
    except TimeoutError:
        elapsed = time.perf_counter() - started_at
        return False, elapsed, "timeout"
    except CompletionTruncated:
        return (
            False,
            time.perf_counter() - started_at,
            "HTTP 200 completion truncated at its token limit",
        )
    except OmniRouteError as error:
        _mark_model_failure(model_id, error)
        return False, time.perf_counter() - started_at, error.response_excerpt or str(error)


async def probe_model(model_id: str) -> bool:
    success, _, _ = await probe_model_details(model_id)
    return success


# ---------------------------------------------------------------------------
# Model Catalogue, Auto Routing, Hedging, and Chat Streaming
# ---------------------------------------------------------------------------

_KNOWN_FRIENDLY_NAMES: dict[str, str] = {
    # === Actively used free models ===
    "gemini/gemini-3.5-flash-lite": "Gemini Flash Lite",
    # gemini-flash-lite-latest is an alias of gemini-3.5-flash-lite—shown as one entry.
    "gemini/gemini-flash-lite-latest": "Gemini Flash Lite",
    "gemini/gemini-3.6-flash": "Gemini 3.6 Flash",
    "gemini/gemini-3.7-flash": "Gemini 3.7 Flash",
    "gemini/gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini/gemini-3.8-flash": "Gemini 3.8 Flash",
    "gemini/gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite",
    "gemini/gemini-2.5-pro": "Gemini 2.5 Pro",
    # === Groq models (hidden until Groq key is fixed) ===
    "groq/llama-3.3-70b-versatile": "Llama 3.3 70B",
    "groq/meta-llama/llama-4-scout-17b-16e-instruct": "Llama 4 Scout 17B",
    "groq/qwen/qwen3-32b": "Qwen3 32B",
    "groq/qwen/qwen3.6-27b": "Qwen3.6 27B",
    "groq/qwen/qwen3.8-27b": "Qwen3.8 27B",
    "groq/allam-2-7b": "Allam 2 7B",
    "groq/openai/gpt-oss-safeguard-20b": "GPT-OSS Safeguard 20B (Groq)",
    # === Paid models — tracked for accurate tier labelling but blocked by free_only ===
    "openai/gpt-4.1-mini": "GPT-4.1 Mini",
    "openai/gpt-4o-mini": "GPT-4o Mini",
    "openai/gpt-4o": "GPT-4o",
    "openai/o1-mini": "o1 Mini",
    "openai/o3-mini": "o3 Mini",
}

_KNOWN_MODEL_ALIAS_CANONICAL: dict[str, str] = {
    "gemini/gemini-flash-lite-latest": "gemini/gemini-3.5-flash-lite",
}


_NON_CHAT_PATTERN = re.compile(
    r"(?i)(embed|embedding|tts|whisper|dall-e|imagen|flux|diffusion|moderation|realtime|transcription|speech|audio-preview|rerank|bge-)"
)


def _friendly_model_label(model_id: str, raw_name: str | None = None) -> str:
    if model_id in _KNOWN_FRIENDLY_NAMES:
        return _KNOWN_FRIENDLY_NAMES[model_id]
    if raw_name and raw_name.strip():
        clean = raw_name.strip()
        if clean.lower().startswith("agy/"):
            clean = clean[4:].strip()
        return clean
    parts = model_id.split("/")
    name_part = parts[-1] if len(parts) > 1 else model_id
    clean_name = name_part.replace("-", " ").replace("_", " ").title()
    return clean_name


def _is_chat_capable(model_id: str, raw_model: Any = None) -> bool:
    if _NON_CHAT_PATTERN.search(model_id):
        return False
    if raw_model is not None:
        output_modalities = (
            raw_model.get("output_modalities")
            if isinstance(raw_model, dict)
            else getattr(raw_model, "output_modalities", None)
        )
        if isinstance(output_modalities, list) and output_modalities and "text" not in output_modalities:
            return False
        capabilities = (
            raw_model.get("capabilities")
            if isinstance(raw_model, dict)
            else getattr(raw_model, "capabilities", None)
        )
        if isinstance(capabilities, dict) and capabilities.get("embeddings") is True:
            return False
    return True


def _is_paid_provider(model_id: str) -> bool:
    """Return True if this model's provider is in the configured paid provider list."""
    if "/" not in model_id:
        return False
    provider = model_id.split("/")[0].lower()
    return provider in settings.paid_provider_set


def _has_paid_pricing(raw_model: Any) -> bool:
    pricing = (
        raw_model.get("pricing")
        if isinstance(raw_model, dict)
        else getattr(raw_model, "pricing", None)
    )
    if isinstance(pricing, dict):
        values = pricing.values()
    elif isinstance(pricing, (list, tuple)):
        values = pricing
    else:
        return False
    for price in values:
        if isinstance(price, bool):
            continue
        if isinstance(price, (int, float)) and price > 0:
            return True
        if isinstance(price, str):
            try:
                if float(price.strip()) > 0:
                    return True
            except ValueError:
                continue
        if isinstance(price, dict) and _has_paid_pricing({"pricing": price}):
            return True
        if isinstance(price, (list, tuple)) and _has_paid_pricing({"pricing": price}):
            return True
    return False


def _free_model_decision(model_id: str, raw_model: Any) -> tuple[bool, str]:
    normalized = model_id.strip()
    if _is_forbidden_model(normalized):
        provider = normalized.split("/", 1)[0].strip().lower()
        return False, f"provider '{provider}' is not trusted"
    if raw_model is None:
        return False, "model is not listed by OmniRoute"
    if not _is_chat_capable(normalized, raw_model):
        return False, "model is not chat-capable"
    if _has_paid_pricing(raw_model):
        return False, "pricing explicitly greater than zero"
    pricing = (
        raw_model.get("pricing")
        if isinstance(raw_model, dict)
        else getattr(raw_model, "pricing", None)
    )
    if pricing is None:
        return True, "trusted provider; pricing unknown"
    if isinstance(pricing, dict) and not pricing:
        return True, "trusted provider; pricing unknown"
    return True, "trusted provider; no positive pricing listed"


async def _refresh_model_registry(*, force: bool = False) -> dict[str, Any]:
    global _model_registry, _model_registry_checked_at, _verified_free_model_ids

    now = time.monotonic()
    if (
        not force
        and _model_registry is not None
        and now - _model_registry_checked_at < _MODEL_REGISTRY_CACHE_TTL
    ):
        return _model_registry

    async with _model_registry_lock:
        now = time.monotonic()
        if (
            not force
            and _model_registry is not None
            and now - _model_registry_checked_at < _MODEL_REGISTRY_CACHE_TTL
        ):
            return _model_registry

        try:
            async with asyncio.timeout(5.0):
                response = await _client.models.list(timeout=5.0)
            raw_models = getattr(response, "data", [])
        except (TimeoutError, OpenAIError, httpx.HTTPError) as exc:
            _model_registry = {}
            _verified_free_model_ids = frozenset()
            _model_registry_checked_at = time.monotonic()
            logger.warning(
                "Unable to verify OmniRoute model pricing; free routing is disabled: %s",
                type(exc).__name__,
            )
            raise OmniRouteError(
                "Cannot verify model availability and pricing with OmniRoute.",
                status_code=503,
                error_type="ModelRegistryUnavailable",
            ) from exc

        registry = {model.id: model for model in raw_models if hasattr(model, "id")}
        _model_registry = registry
        _verified_free_model_ids = frozenset(
            model_id
            for model_id, raw_model in registry.items()
            if _free_model_decision(model_id, raw_model)[0]
        )
        _model_registry_checked_at = time.monotonic()
        return registry


async def _require_verified_free_model(model_id: str) -> Any:
    normalized = model_id.strip()
    registry = await _refresh_model_registry()
    raw_model = registry.get(normalized)
    accepted, reason = _free_model_decision(normalized, raw_model)
    if not accepted:
        raise OmniRouteError(
            f"Model '{normalized}' refused: {reason}.",
            status_code=400,
            error_type="RefusedModel",
        )
    return raw_model


async def validate_configured_model_roles() -> None:
    try:
        registry = await _refresh_model_registry()
    except OmniRouteError:
        registry = {}
        registry_available = False
    else:
        registry_available = True

    role_names = ("teacher", "practice", "reasoning", "multimodal", "json")
    rejected_roles: list[str] = []
    for role in role_names:
        configured = [
            model.strip()
            for model in (
                getattr(settings, f"model_{role}"),
                *getattr(settings, f"model_{role}_fallbacks").split(","),
            )
            if model.strip()
        ]
        accepted_models: list[str] = []
        for model_id in dict.fromkeys(configured):
            raw_model = registry.get(model_id)
            if registry_available:
                accepted, reason = _free_model_decision(model_id, raw_model)
            else:
                accepted, reason = False, "OmniRoute model registry unavailable"
            logger.info(
                "model_config decision=%s model=%s reason=%s",
                "accepted" if accepted else "refused",
                model_id,
                reason,
            )
            if accepted:
                accepted_models.append(model_id)
        if not accepted_models:
            rejected_roles.append(role)

    if rejected_roles:
        raise RuntimeError(
            "No accepted free model is configured for role(s): "
            f"{', '.join(rejected_roles)}. Configure at least one available "
            "model from FREE_PROVIDERS with no positive pricing for each role."
        )


def _get_model_meta(model_id: str, raw_model: Any = None) -> dict[str, Any]:
    if raw_model is None:
        raw_model = _model_registry.get(model_id)
    overrides: dict[str, Any] = {}
    if settings.model_meta_overrides:
        try:
            parsed = json.loads(settings.model_meta_overrides)
            if isinstance(parsed, dict) and model_id in parsed:
                overrides = parsed[model_id]
        except Exception:
            pass

    provider = model_id.split("/")[0].lower() if "/" in model_id else "omniroute"
    accepted, _ = _free_model_decision(model_id, raw_model)
    tier = "free" if accepted else "paid"

    raw_caps = (
        raw_model.get("capabilities", {})
        if isinstance(raw_model, dict)
        else getattr(raw_model, "capabilities", {})
        if raw_model
        else {}
    )
    if not isinstance(raw_caps, dict):
        raw_caps = {}
    raw_input_mods = (
        raw_model.get("input_modalities", [])
        if isinstance(raw_model, dict)
        else getattr(raw_model, "input_modalities", [])
        if raw_model
        else []
    )
    raw_ctx_len = (
        raw_model.get("context_length", 0)
        if isinstance(raw_model, dict)
        else getattr(raw_model, "context_length", 0)
        if raw_model
        else 0
    )
    raw_name = (
        raw_model.get("name")
        if isinstance(raw_model, dict)
        else getattr(raw_model, "name", None)
        if raw_model
        else None
    )

    is_vision = bool(
        raw_caps.get("vision")
        or (isinstance(raw_input_mods, list) and "image" in raw_input_mods)
        or re.search(r"(?i)(vision|vl|flash|gpt-4o|claude-3|gemini|llama-4-scout)", model_id)
    )
    is_reasoning = bool(
        raw_caps.get("reasoning")
        or raw_caps.get("thinking")
        or raw_caps.get("supportsThinking")
        or re.search(r"(?i)(deepseek-r1|o1|o3|reasoner|thinking|qwq)", model_id)
    )
    is_thinking = bool(
        raw_caps.get("thinking")
        or raw_caps.get("supportsThinking")
        or re.search(r"(?i)(deepseek-r1|o1|o3|reasoner|thinking|qwq)", model_id)
    )
    is_long_context = bool(
        (isinstance(raw_ctx_len, (int, float)) and raw_ctx_len >= 64000)
        or re.search(r"(?i)(gemini|1m|128k|long)", model_id)
    )

    label = _friendly_model_label(model_id, raw_name)
    result = {
        "id": model_id,
        "provider": provider,
        "label": label,
        "description": _CHAT_MODEL_DESCRIPTIONS.get(
            model_id,
            "General-purpose answers for everyday school questions.",
        ),
        "smart": model_id in _SCHOOL_CORRECTNESS_VERIFIED_MODELS,
        "vision_verified": model_id in _VISION_VERIFIED_MODELS,
        "capabilities": {
            "vision": is_vision,
            "reasoning": is_reasoning,
            "thinking": is_thinking,
            "long_context": is_long_context,
        },
        "tier": tier,
    }
    if "label" in overrides:
        result["label"] = overrides["label"]
    if "provider" in overrides:
        result["provider"] = overrides["provider"]
    if "capabilities" in overrides and isinstance(overrides["capabilities"], dict):
        result["capabilities"].update(overrides["capabilities"])

    return result


def _effective_max_tokens(
    model_id: str,
    max_tokens: int,
    raw_model: Any = None,
) -> int:
    """Reserve room for hidden reasoning tokens on models that support thinking."""
    if max_tokens <= 0:
        return max_tokens
    capabilities = (
        raw_model.get("capabilities", {})
        if isinstance(raw_model, dict)
        else getattr(raw_model, "capabilities", {})
    )
    if not isinstance(capabilities, dict):
        capabilities = {}
    if capabilities.get("thinking") or capabilities.get("supportsThinking") or re.search(
        r"(?i)(deepseek-r1|o1|o3|reasoner|thinking|qwq)", model_id
    ):
        return min(max_tokens * 2, 8192)
    return max_tokens


async def _close_stream(stream: Any) -> None:
    closer = getattr(stream, "aclose", None)
    if not callable(closer):
        closer = getattr(stream, "close", None)
    if callable(closer):
        result = closer()
        if inspect.isawaitable(result):
            await result


_catalogue_cache: list[ChatModelCatalogueItem] = []
_catalogue_cached_at: float = 0.0
_catalogue_cache_lock = asyncio.Lock()
_CATALOGUE_CACHE_TTL = 60.0


async def _probe_catalogue_model(model_id: str) -> None:
    try:
        first_token = await _get_stream_first_token(
            model_id,
            [{"role": "user", "content": "Reply with OK."}],
            temperature=0,
            max_tokens=16,
        )
        async for _ in _consume_stream(first_token):
            pass
    except OmniRouteError as error:
        logger.info(
            "Chat catalogue health probe failed model=%s status_code=%s error=%s",
            model_id,
            error.status_code,
            error.response_excerpt or str(error),
        )


def _refresh_catalogue_dynamic_state(items: list[ChatModelCatalogueItem]) -> list[ChatModelCatalogueItem]:
    now = time.monotonic()
    refreshed: list[ChatModelCatalogueItem] = []
    for item in items:
        if item.id == "auto":
            refreshed.append(item)
            continue
        cooldown_until_ts = _model_cooldowns.get(item.id, 0.0)
        cooldown_iso = (
            datetime.fromtimestamp(time.time() + (cooldown_until_ts - now), timezone.utc).isoformat()
            if cooldown_until_ts > now
            else None
        )
        health = get_model_health_state(item.id)
        if health == "healthy":
            refreshed.append(
                item.model_copy(
                    update={
                        "health": health,
                        "median_ttft_ms": get_median_ttft_ms(item.id),
                        "cooldown_until": cooldown_iso,
                        "locked": False,
                    }
                )
            )
    return refreshed


async def get_chat_models_catalogue() -> list[ChatModelCatalogueItem]:
    global _catalogue_cache, _catalogue_cached_at
    now = time.monotonic()
    if now - _catalogue_cached_at < _CATALOGUE_CACHE_TTL and _catalogue_cache:
        return _refresh_catalogue_dynamic_state(_catalogue_cache)

    async with _catalogue_cache_lock:
        now = time.monotonic()
        if now - _catalogue_cached_at < _CATALOGUE_CACHE_TTL and _catalogue_cache:
            return _refresh_catalogue_dynamic_state(_catalogue_cache)

        auto_item = ChatModelCatalogueItem(
            id="auto",
            provider="auto",
            label="Auto (Fastest working model)",
            capabilities=ModelCapabilities(vision=True, reasoning=False, long_context=True),
            tier="free",
            health="healthy",
            median_ttft_ms=None,
            cooldown_until=None,
            locked=False,
        )
        allowlist = settings.chat_model_allowlist_ids
        max_entries = min(6, max(1, settings.chat_picker_max))
        if not allowlist or max_entries == 1:
            _catalogue_cache = [auto_item]
            _catalogue_cached_at = now
            return [auto_item]

        try:
            models_by_id = await _refresh_model_registry()
        except OmniRouteError as exc:
            logger.warning("Failed to fetch models from OmniRoute for catalogue: %s", exc)
            _catalogue_cache = [auto_item]
            _catalogue_cached_at = now
            return [auto_item]

        catalogue_items = [auto_item]

        hidden_aliases = settings.model_hidden_alias_set | _KNOWN_MODEL_ALIAS_CANONICAL.keys()

        eligible: list[tuple[str, dict[str, Any]]] = []
        for mid in allowlist:
            raw_obj = models_by_id.get(mid)
            if (
                raw_obj is None
                or mid in hidden_aliases
                or _is_forbidden_model(mid)
                or not _is_chat_capable(mid, raw_obj)
            ):
                continue
            meta = _get_model_meta(mid, raw_obj)
            if mid in _verified_free_model_ids and meta["tier"] == "free":
                eligible.append((mid, meta))

        unprobed = [
            mid
            for mid, _ in eligible
            if get_model_health_state(mid) == "unknown"
            and _model_cooldowns.get(mid, 0.0) <= time.monotonic()
        ]
        if unprobed:
            await asyncio.gather(*(_probe_catalogue_model(mid) for mid in unprobed))

        for mid, meta in eligible:
            if get_model_health_state(mid) != "healthy":
                continue
            cooldown_until_ts = _model_cooldowns.get(mid, 0.0)
            cooldown_iso = (
                datetime.fromtimestamp(time.time() + (cooldown_until_ts - now), timezone.utc).isoformat()
                if cooldown_until_ts > now
                else None
            )
            catalogue_items.append(
                ChatModelCatalogueItem(
                    id=mid,
                    provider=meta["provider"],
                    label=meta["label"],
                    description=meta["description"],
                    capabilities=ModelCapabilities(**meta["capabilities"]),
                    smart=meta["smart"],
                    vision_verified=meta["vision_verified"],
                    tier="free",
                    health="healthy",
                    median_ttft_ms=get_median_ttft_ms(mid),
                    cooldown_until=cooldown_iso,
                    locked=False,
                    hidden=False,
                )
            )
            if len(catalogue_items) >= max_entries:
                break

        _catalogue_cache = catalogue_items
        _catalogue_cached_at = now
        return _refresh_catalogue_dynamic_state(_catalogue_cache)


async def validate_chat_model(model: str | None) -> tuple[bool, str, ChatModelCatalogueItem | None]:
    if not model or model.strip().lower() == "auto":
        return True, "", None
    m_clean = model.strip()

    if _is_forbidden_model(m_clean):
        return False, f"Model '{m_clean}' is disabled in this free application.", None

    try:
        await _require_verified_free_model(m_clean)
    except OmniRouteError:
        return False, f"Model '{m_clean}' is not verified as free.", None

    catalogue = await get_chat_models_catalogue()
    found = next((item for item in catalogue if item.id == m_clean), None)
    if not found:
        return False, f"Model '{m_clean}' is unknown or not supported for chat.", None
    if found.health != "healthy":
        return False, f"Model '{m_clean}' is not currently healthy.", found
    return True, "", found


def _ordered_auto_chain(
    task: str = "teacher",
    eligible_models: set[str] | None = None,
    has_image: bool = False,
    is_long_doc: bool = False,
) -> list[str]:
    now = time.monotonic()
    chain = model_chain_for(task)
    if eligible_models is not None:
        chain = list(dict.fromkeys([*chain, *settings.chat_model_allowlist_ids]))
        chain = [
            model
            for model in chain
            if model in eligible_models
            or (
                model in (
                    settings.model_hidden_alias_set
                    | _KNOWN_MODEL_ALIAS_CANONICAL.keys()
                )
                and _KNOWN_MODEL_ALIAS_CANONICAL.get(model) in eligible_models
            )
        ]
    chain = [
        model
        for model in chain
        if model in _verified_free_model_ids
        and _get_model_meta(model, _model_registry.get(model))["tier"] == "free"
        and (not has_image or _get_model_meta(model, _model_registry.get(model))["capabilities"]["vision"])
        and (
            not is_long_doc
            or _get_model_meta(model, _model_registry.get(model))["capabilities"]["long_context"]
        )
    ]
    non_reasoning = [
        m for m in chain
        if not _get_model_meta(m, _model_registry.get(m))["capabilities"]["reasoning"]
    ] or chain

    free_candidates = [
        m for m in non_reasoning
        if _get_model_meta(m, _model_registry.get(m))["tier"] == "free"
    ]
    available_free = [m for m in free_candidates if _model_cooldowns.get(m, 0.0) <= now]
    if available_free:
        primary_pool = available_free
        secondary_pool = [m for m in free_candidates if m not in available_free]
    else:
        primary_pool = free_candidates
        secondary_pool = []

    def sort_key(m: str) -> tuple[int, float, int]:
        cooling = 1 if _model_cooldowns.get(m, 0.0) > now else 0
        median = get_median_ttft_ms(m)
        ttft_val = median if median is not None else 99999.0
        chain_idx = chain.index(m) if m in chain else 999
        return (cooling, ttft_val, chain_idx)

    ordered_primary = sorted(primary_pool, key=sort_key)
    ordered_secondary = sorted(secondary_pool, key=sort_key)
    return list(dict.fromkeys(ordered_primary + ordered_secondary))


def pick_auto_model(task: str = "teacher") -> str:
    chain = _ordered_auto_chain(task)
    return chain[0] if chain else model_for(task)


@dataclass
class FirstTokenStream:
    first_token: str
    stream: Any
    model: str
    ttft_ms: float
    extract_fn: Any


async def _get_stream_first_token(
    model: str,
    messages: Sequence[dict[str, Any]],
    temperature: float = 0.4,
    max_tokens: int | None = None,
    task: str = "teacher",
) -> FirstTokenStream:
    started_at = time.perf_counter()
    pending = ""
    in_reasoning = False

    def extract_final_text(text: str, final: bool = False) -> str:
        nonlocal pending, in_reasoning
        pending += text
        output: list[str] = []
        while pending:
            if in_reasoning:
                matches = [
                    (pending.find(marker), marker)
                    for marker in _REASONING_CLOSE
                    if pending.find(marker) >= 0
                ]
                if not matches:
                    if final:
                        pending = ""
                    else:
                        keep = max(len(marker) for marker in _REASONING_CLOSE) - 1
                        pending = pending[-keep:] if keep else ""
                    break
                position, marker = min(matches)
                pending = pending[position + len(marker) :]
                in_reasoning = False
                continue
            matches = [
                (pending.find(marker), marker)
                for marker in _REASONING_OPEN
                if pending.find(marker) >= 0
            ]
            if matches:
                position, marker = min(matches)
                output.append(pending[:position])
                pending = pending[position + len(marker) :]
                in_reasoning = True
                continue
            if final:
                output.append(pending)
                pending = ""
            else:
                keep = max(len(marker) for marker in _REASONING_OPEN) - 1
                emit_length = max(0, len(pending) - keep)
                output.append(pending[:emit_length])
                pending = pending[emit_length:]
            break
        return "".join(output)

    effort = reasoning_effort_for(task)
    stream_options: dict[str, Any] = {
        "model": model,
        "messages": list(messages),
        "temperature": temperature,
    }
    if max_tokens is not None:
        stream_options["max_tokens"] = max_tokens
    with _model_state_lock:
        effort_supported = model not in _unsupported_reasoning_effort
    if effort and effort_supported:
        stream_options["reasoning_effort"] = effort

    raw_stream = None
    try:
        raw_stream = await _create_stream_with_retry(**stream_options)
        first_token = ""
        finish_reason: str | None = None
        while not first_token:
            try:
                first_event = await asyncio.wait_for(
                    anext(raw_stream),
                    timeout=float(settings.chat_first_token_timeout),
                )
            except StopAsyncIteration as exc:
                error_type = (
                    "CompletionTruncated"
                    if finish_reason == "length"
                    else "EmptyCompletion"
                )
                raise OmniRouteError(
                    "The model returned no user-visible text.",
                    status_code=502,
                    error_type=error_type,
                ) from exc
            finish_reason = getattr(first_event.choices[0], "finish_reason", None)
            delta = first_event.choices[0].delta
            content = getattr(delta, "content", None)
            if isinstance(content, str) and content:
                first_token = extract_final_text(content)
            if finish_reason is not None and not first_token:
                error_type = (
                    "CompletionTruncated"
                    if finish_reason == "length"
                    else "EmptyCompletion"
                )
                raise OmniRouteError(
                    "The model returned no user-visible text.",
                    status_code=502,
                    error_type=error_type,
                )

        ttft_ms = (time.perf_counter() - started_at) * 1000
        return FirstTokenStream(
            first_token=first_token,
            stream=raw_stream,
            model=model,
            ttft_ms=ttft_ms,
            extract_fn=extract_final_text,
        )
    except asyncio.TimeoutError:
        if raw_stream is not None:
            await _close_stream(raw_stream)
        duration_ms = (time.perf_counter() - started_at) * 1000
        _mark_model_timeout_cooldown(model, 60.0)
        record_model_request(
            model,
            ttft_ms=None,
            duration_ms=duration_ms,
            success=False,
            status_code=None,
        )
        raise OmniRouteError(
            f"Model {model} did not return a first token within {settings.chat_first_token_timeout}s.",
            error_type="TimeoutError",
        )
    except Exception as exc:
        if raw_stream is not None:
            await _close_stream(raw_stream)
        duration_ms = (time.perf_counter() - started_at) * 1000
        status_code = getattr(exc, "status_code", None)
        record_model_request(
            model,
            ttft_ms=None,
            duration_ms=duration_ms,
            success=False,
            status_code=status_code,
        )
        if isinstance(exc, OmniRouteError):
            _mark_model_failure(model, exc)
            raise
        if isinstance(exc, OpenAIError):
            reason, code, excerpt = _format_omniroute_error(exc, model)
            err = OmniRouteError(
                reason,
                status_code=code,
                error_type=type(exc).__name__,
                response_excerpt=excerpt,
                retry_after=_parse_retry_after(exc),
            )
            _mark_model_failure(model, err)
            raise err from exc
        raise


async def _consume_stream(first_stream: FirstTokenStream) -> AsyncGenerator[str, None]:
    yield first_stream.first_token
    started_at = time.perf_counter()
    extract_fn = first_stream.extract_fn
    raw_stream = first_stream.stream
    model = first_stream.model
    try:
        async for event in raw_stream:
            choice = event.choices[0]
            if getattr(choice, "finish_reason", None) == "length":
                raise OmniRouteError(
                    "The model exhausted its completion-token budget before finishing.",
                    status_code=502,
                    error_type="CompletionTruncated",
                )
            delta = choice.delta
            content = getattr(delta, "content", None)
            if isinstance(content, str) and content:
                token = extract_fn(content)
                if token:
                    yield token
        final = extract_fn("", final=True)
        if final:
            yield final
        _mark_model_success(model, started_at)
        total_duration = (time.perf_counter() - started_at) * 1000 + first_stream.ttft_ms
        record_model_request(
            model,
            ttft_ms=first_stream.ttft_ms,
            duration_ms=total_duration,
            success=True,
            status_code=200,
        )
    except Exception as exc:
        logger.warning("Stream error for %s: %s", model, exc)
        raise
    finally:
        await _close_stream(raw_stream)


async def _stream_auto(
    messages: Sequence[dict[str, Any]],
    task: str = "teacher",
    temperature: float = 0.4,
    max_tokens: int | None = None,
    fallback_from: str | None = None,
    has_image: bool = False,
    is_long_doc: bool = False,
) -> tuple[AsyncGenerator[str, None], str, str | None, float]:
    await _refresh_model_registry()
    eligible_models: set[str] | None = set(_verified_free_model_ids)
    if settings.chat_model_allowlist_ids:
        catalogue = await get_chat_models_catalogue()
        eligible_models = {
            item.id
            for item in catalogue
            if item.id != "auto"
            and item.tier == "free"
            and item.health == "healthy"
            and (not has_image or item.capabilities.vision)
            and (not is_long_doc or item.capabilities.long_context)
        }
    chain = _ordered_auto_chain(
        task,
        eligible_models,
        has_image=has_image,
        is_long_doc=is_long_doc,
    )
    if not chain:
        raise OmniRouteError("No model is configured for this task.")

    m1 = chain[0]
    m2 = chain[1] if len(chain) > 1 else None

    hedge_after_ms = int(settings.chat_hedge_after_ms)
    hedge_enabled = hedge_after_ms > 0 and m2 is not None and is_hedging_safe()

    if not hedge_enabled:
        last_err: Exception | None = None
        for model in chain:
            try:
                first_stream = await _get_stream_first_token(
                    model,
                    messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    task=task,
                )
                return _consume_stream(first_stream), model, fallback_from, first_stream.ttft_ms
            except Exception as exc:
                last_err = exc
                continue
        if last_err:
            raise last_err
        raise OmniRouteError("No model could answer the request.")

    t1 = asyncio.create_task(
        _get_stream_first_token(
            m1,
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
            task=task,
        )
    )

    done, pending = await asyncio.wait(
        [t1],
        timeout=hedge_after_ms / 1000.0,
    )

    if t1 in done:
        if not t1.cancelled() and t1.exception() is None:
            first_stream = t1.result()
            return _consume_stream(first_stream), m1, fallback_from, first_stream.ttft_ms
        logger.info("Auto primary model %s failed early, falling through to %s", m1, m2)
        try:
            first_stream = await _get_stream_first_token(
                m2,
                messages,
                temperature=temperature,
                max_tokens=max_tokens,
                task=task,
            )
            return _consume_stream(first_stream), m2, fallback_from, first_stream.ttft_ms
        except Exception:
            for m in chain[2:]:
                try:
                    first_stream = await _get_stream_first_token(
                        m,
                        messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        task=task,
                    )
                    return _consume_stream(first_stream), m, fallback_from, first_stream.ttft_ms
                except Exception:
                    continue
            raise

    logger.info(
        "Hedge triggered: %s did not produce token in %dms. Launching hedge model %s in parallel.",
        m1,
        hedge_after_ms,
        m2,
    )
    t2 = asyncio.create_task(
        _get_stream_first_token(
            m2,
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
            task=task,
        )
    )

    done, pending = await asyncio.wait(
        [t1, t2],
        return_when=asyncio.FIRST_COMPLETED,
    )

    completed = list(done)[0]
    other = list(pending)[0] if pending else None

    if not completed.cancelled() and completed.exception() is None:
        winner = completed.result()
        if other and not other.done():
            other.cancel()
        elif other and other.done() and other.exception() is None:
            try:
                loser = other.result()
                asyncio.create_task(_close_stream(loser.stream))
            except Exception:
                pass

        logger.info("Hedge winner: %s (ttft=%.1fms)", winner.model, winner.ttft_ms)
        return _consume_stream(winner), winner.model, fallback_from, winner.ttft_ms

    if other:
        try:
            winner = await other
            logger.info("Hedge winner (after first failed): %s (ttft=%.1fms)", winner.model, winner.ttft_ms)
            return _consume_stream(winner), winner.model, fallback_from, winner.ttft_ms
        except Exception:
            pass

    for m in chain[2:]:
        try:
            first_stream = await _get_stream_first_token(
                m,
                messages,
                temperature=temperature,
                max_tokens=max_tokens,
                task=task,
            )
            return _consume_stream(first_stream), m, fallback_from, first_stream.ttft_ms
        except Exception:
            continue
    raise OmniRouteError("All models in the fallback chain failed.")


async def prepare_chat_stream(
    messages: Sequence[dict[str, Any]],
    requested_model: str = "auto",
    temperature: float = 0.4,
    max_tokens: int | None = None,
    has_image: bool = False,
    is_long_doc: bool = False,
) -> tuple[AsyncGenerator[str, None], str, str | None, float]:
    req_clean = (requested_model or "auto").strip()
    is_auto = req_clean.lower() == "auto"

    if not is_auto:
        _reject_forbidden_model(req_clean)
        valid, reason, _ = await validate_chat_model(req_clean)
        if not valid:
            raise OmniRouteError(
                reason,
                status_code=400,
                error_type="InvalidChatModel",
            )
        meta = _get_model_meta(req_clean)
        caps = meta.get("capabilities", {})
        if has_image and not caps.get("vision"):
            fallback_from = req_clean
            return await _stream_auto(
                messages,
                task="multimodal",
                temperature=temperature,
                max_tokens=max_tokens,
                fallback_from=fallback_from,
                has_image=has_image,
                is_long_doc=is_long_doc,
            )
        if is_long_doc and not caps.get("long_context"):
            fallback_from = req_clean
            return await _stream_auto(
                messages,
                task="multimodal",
                temperature=temperature,
                max_tokens=max_tokens,
                fallback_from=fallback_from,
                has_image=has_image,
                is_long_doc=is_long_doc,
            )

    if is_auto:
        task = "multimodal" if (has_image or is_long_doc) else "teacher"
        return await _stream_auto(
            messages,
            task=task,
            temperature=temperature,
            max_tokens=max_tokens,
            fallback_from=None,
            has_image=has_image,
            is_long_doc=is_long_doc,
        )

    try:
        first_stream = await _get_stream_first_token(
            req_clean,
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
            task="teacher",
        )
        return _consume_stream(first_stream), req_clean, None, first_stream.ttft_ms
    except (OmniRouteError, OpenAIError, Exception) as error:
        logger.warning(
            "Explicit model %s failed before first token; falling back to Auto: %s",
            req_clean,
            error,
        )
        task = "multimodal" if (has_image or is_long_doc) else "teacher"
        return await _stream_auto(
            messages,
            task=task,
            temperature=temperature,
            max_tokens=max_tokens,
            fallback_from=req_clean,
            has_image=has_image,
            is_long_doc=is_long_doc,
        )


async def warmup_primary_model() -> None:
    try:
        await _refresh_model_registry()
        primary = model_for("teacher")
        if not primary:
            return
        logger.info("Warming up primary chat model: %s", primary)
        await _create_completion(
            model=primary,
            messages=[{"role": "user", "content": "Reply OK."}],
            temperature=0,
            max_tokens=16,
            timeout=10,
        )
        logger.info("Primary chat model warmup completed: %s", primary)
    except Exception as exc:
        logger.warning("Primary chat model warmup failed (non-fatal): %s", exc)
