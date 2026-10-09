import asyncio
import base64
import json
import logging
import re
import time
from collections import OrderedDict
from collections.abc import AsyncGenerator, Callable, Sequence
from typing import Any, TypeVar

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

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)
_CACHE_LIMIT = 128
_response_cache: OrderedDict[str, str] = OrderedDict()
_llm_semaphore = asyncio.Semaphore(max(4, settings.max_concurrent_llm))
_REASONING_OPEN = ("<think>", "<analysis>", "<reasoning>")
_REASONING_CLOSE = ("</think>", "</analysis>", "</reasoning>")
_HEALTH_CACHE_TTL = 20.0
_health_lock = asyncio.Lock()
_health_checked_at = 0.0
_health_result = (False, 0)
_health_failed_probes = 0
_client = AsyncOpenAI(
    base_url=settings.omniroute_base_url,
    api_key=settings.omniroute_api_key or "not-configured",
    max_retries=0,
    timeout=180.0,
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
    "grading": "reasoning",
    "viva": "reasoning",
    "code": "reasoning",
    "mermaid": "reasoning",
    "json": "json",
    "split": "json",
    "ppt": "json",
    "mcq": "json",
    "flashcard": "json",
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
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_type = error_type
        self.response_excerpt = response_excerpt


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

def model_for(task: str) -> str:
    role = _TASK_ROLE.get(task.strip().lower(), "teacher")
    configured = {
        "teacher": settings.model_teacher,
        "practice": settings.model_practice,
        "reasoning": settings.model_reasoning,
        "multimodal": settings.model_multimodal,
        "json": settings.model_json,
    }
    return configured[role].strip() or settings.model_teacher.strip()


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
        return error.status_code == 429 or error.status_code >= 500
    return False


async def _create_completion(**kwargs: Any) -> Any:
    diagnostic_step = kwargs.pop("diagnostic_step", None)
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
                reason = (
                    f"OmniRoute returned HTTP {status_code}: {excerpt}"
                    if status_code is not None
                    else "OmniRoute is not running or the API key is invalid"
                )
                raise OmniRouteError(
                    reason,
                    status_code=status_code,
                    error_type=type(error).__name__,
                    response_excerpt=excerpt,
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
            await asyncio.sleep(0.25 * (2**retry_count))
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
) -> str:
    model = model_for(task)
    key = _cache_key(model, messages, temperature, max_tokens)
    cacheable = task.strip().lower() != "practice"
    if cacheable and key in _response_cache:
        _response_cache.move_to_end(key)
        return _response_cache[key]
    completion_options: dict[str, Any] = {
        "model": model,
        "messages": list(messages),
        "temperature": temperature,
    }
    if timeout is not None:
        completion_options["timeout"] = timeout
    if max_tokens is not None:
        completion_options["max_tokens"] = max_tokens
    reasoning_effort = reasoning_effort_for(task)
    if reasoning_effort:
        completion_options["reasoning_effort"] = reasoning_effort
    if diagnostic_step:
        completion_options["diagnostic_step"] = diagnostic_step
    response = await _create_completion(
        **completion_options,
    )
    result = response.choices[0].message.content or ""
    if cacheable:
        _response_cache[key] = result
        _response_cache.move_to_end(key)
        while len(_response_cache) > _CACHE_LIMIT:
            _response_cache.popitem(last=False)
    return result


async def stream(
    messages: Sequence[dict[str, Any]], task: str = "teacher", temperature: float = 0.4
) -> AsyncGenerator[str, None]:
    model = model_for(task)
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

    try:
        async with _llm_semaphore:
            response = await _create_stream_with_retry(
                model=model, messages=list(messages), temperature=temperature
            )
            async for event in response:
                delta = event.choices[0].delta
                content = delta.content
                if isinstance(content, str) and content:
                    final_text = extract_final_text(content)
                    if final_text:
                        yield final_text
            remaining = extract_final_text("", final=True)
            if remaining:
                yield remaining
    except OmniRouteError:
        raise
    except OpenAIError as error:
        logger.warning("OmniRoute streaming completion failed (%s)", type(error).__name__)
        status_code = error.status_code if isinstance(error, APIStatusError) else None
        response_body = (
            getattr(error.response, "text", "")
            if isinstance(error, APIStatusError)
            else str(error)
        )
        excerpt = _safe_excerpt(response_body)
        reason = (
            f"OmniRoute returned HTTP {status_code}: {excerpt}"
            if status_code is not None
            else "OmniRoute is not running or the API key is invalid"
        )
        raise OmniRouteError(
            reason,
            status_code=status_code,
            error_type=type(error).__name__,
            response_excerpt=excerpt,
        ) from error


async def _create_stream_with_retry(**kwargs: Any) -> Any:
    for attempt in range(3):
        try:
            return await _client.chat.completions.create(stream=True, **kwargs)
        except OpenAIError as error:
            if not _retryable(error) or attempt == 2:
                logger.warning("OmniRoute stream setup failed (%s)", type(error).__name__)
                status_code = error.status_code if isinstance(error, APIStatusError) else None
                response_body = (
                    getattr(error.response, "text", "")
                    if isinstance(error, APIStatusError)
                    else str(error)
                )
                excerpt = _safe_excerpt(response_body)
                reason = (
                    f"OmniRoute returned HTTP {status_code}: {excerpt}"
                    if status_code is not None
                    else "OmniRoute is not running or the API key is invalid"
                )
                raise OmniRouteError(
                    reason,
                    status_code=status_code,
                    error_type=type(error).__name__,
                    response_excerpt=excerpt,
                ) from error
            await asyncio.sleep(0.25 * (2**attempt))
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


async def check_models() -> tuple[bool, int]:
    global _health_checked_at, _health_failed_probes, _health_result
    now = time.monotonic()
    if now - _health_checked_at < _HEALTH_CACHE_TTL:
        return _health_result
    async with _health_lock:
        now = time.monotonic()
        if now - _health_checked_at < _HEALTH_CACHE_TTL:
            return _health_result
        try:
            async with asyncio.timeout(5):
                await _create_completion(
                    model=model_for("json"),
                    messages=[{"role": "user", "content": "Reply OK."}],
                    temperature=0,
                    max_tokens=1,
                    timeout=5.0,
                )
            _health_result = (True, 0)
            _health_failed_probes = 0
        except (OmniRouteError, TimeoutError):
            _health_failed_probes += 1
            if _health_failed_probes >= 2:
                _health_result = (False, 0)
        _health_checked_at = time.monotonic()
        return _health_result


async def list_models() -> tuple[bool, list[str]]:
    try:
        async with asyncio.timeout(4):
            response = await _client.models.list()
        return True, [item.id for item in response.data]
    except Exception as error:
        logger.info("OmniRoute health check failed: %s", type(error).__name__)
        return False, []


async def probe_model(model_id: str) -> bool:
    if not model_id:
        return False
    try:
        async with asyncio.timeout(5):
            await _create_completion(
                model=model_id,
                messages=[{"role": "user", "content": "Reply with OK."}],
                temperature=0,
                max_tokens=1,
            )
        return True
    except (OmniRouteError, TimeoutError):
        return False
