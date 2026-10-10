import asyncio
from types import SimpleNamespace

import httpx
import pytest
from pydantic import BaseModel

from app.services import llm


class Answer(BaseModel):
    answer: str


def test_json_call_repairs_invalid_response(monkeypatch):
    responses = iter(['{"answer": 42}', '```json\n{"answer":"fixed"}\n```'])
    calls = []

    async def fake_chat(messages, task="teacher", temperature=0.4, **kwargs):
        calls.append(messages)
        return next(responses)

    monkeypatch.setattr(llm, "chat", fake_chat)
    result = asyncio.run(
        llm.json_call([{"role": "user", "content": "Answer"}], Answer)
    )

    assert result == Answer(answer="fixed")
    assert len(calls) == 2
    assert any("Validation error" in str(message) for message in calls[1])


def test_json_call_strips_reasoning_text_before_json(monkeypatch):
    async def fake_chat(messages, task="teacher", temperature=0.4):
        return 'Let me reason this out first.\n```json\n{"answer":"found"}\n```'

    monkeypatch.setattr(llm, "chat", fake_chat)
    result = asyncio.run(
        llm.json_call([{"role": "user", "content": "Answer"}], Answer)
    )

    assert result == Answer(answer="found")


def test_json_call_retries_once_then_names_failed_step(monkeypatch, caplog):
    responses = iter(['Reasoning: {"answer": 42}', "I could not create valid JSON."])
    calls = 0

    async def fake_chat(messages, task="teacher", temperature=0.4, **kwargs):
        nonlocal calls
        calls += 1
        return next(responses)

    monkeypatch.setattr(llm, "chat", fake_chat)
    with pytest.raises(llm.JsonCallError, match="Viva question generation failed"):
        asyncio.run(
            llm.json_call(
                [{"role": "user", "content": "Generate questions"}],
                Answer,
                step="Viva question generation",
            )
        )

    assert calls == 2
    assert "status_code=None" in caplog.text
    assert "I could not create valid JSON." in caplog.text


def test_json_call_can_return_invalid_response_without_retry(monkeypatch):
    calls = 0

    async def fake_chat(messages, task="teacher", temperature=0.4, **kwargs):
        nonlocal calls
        calls += 1
        return '{"answer":'

    monkeypatch.setattr(llm, "chat", fake_chat)
    with pytest.raises(llm.JsonCallError) as raised:
        asyncio.run(
            llm.json_call(
                [{"role": "user", "content": "Answer"}],
                Answer,
                step="Test generation",
                repair_invalid=False,
            )
        )

    assert calls == 1
    assert raised.value.raw_response == '{"answer":'


def test_completion_length_finish_reason_is_reported_without_retry(monkeypatch, caplog):
    calls = 0

    async def fake_create(**kwargs):
        nonlocal calls
        calls += 1
        return SimpleNamespace(
            model="fast-test-model",
            choices=[
                SimpleNamespace(
                    finish_reason="length",
                    message=SimpleNamespace(content='{"answer":"partial'),
                )
            ],
            usage=SimpleNamespace(completion_tokens=12),
        )

    monkeypatch.setattr(
        llm,
        "_client",
        SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
        ),
    )
    with pytest.raises(llm.CompletionTruncated) as raised:
        asyncio.run(llm._create_completion(model="fast-test-model"))

    assert calls == 1
    assert raised.value.content == '{"answer":"partial'
    assert raised.value.completion_tokens == 12
    assert "response_model=fast-test-model" in caplog.text
    assert "requested_max_tokens=default" in caplog.text
    assert "completion_tokens=12" in caplog.text
    assert "content_chars=18" in caplog.text
    assert "finish_reason=length" in caplog.text
    assert "duration_ms=" in caplog.text
    assert "queue_ms=" in caplog.text


def test_practice_model_role_falls_back_to_teacher(monkeypatch):
    monkeypatch.setattr(llm.settings, "model_practice", "")
    monkeypatch.setattr(llm.settings, "model_teacher", "teacher-model")
    assert llm.model_for("practice") == "teacher-model"
    monkeypatch.setattr(llm.settings, "model_practice", "practice-model")
    assert llm.model_for("practice") == "practice-model"


def test_practice_generations_bypass_response_cache(monkeypatch):
    calls = 0

    async def fake_create(**kwargs):
        nonlocal calls
        calls += 1
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='{"answer":"ok"}'))]
        )

    monkeypatch.setattr(llm, "_create_completion", fake_create)
    messages = [{"role": "user", "content": "Generate a question"}]

    async def run():
        first = await llm.chat(messages, task="practice")
        second = await llm.chat(messages, task="practice")
        return first, second

    assert asyncio.run(run()) == ('{"answer":"ok"}', '{"answer":"ok"}')
    assert calls == 2


def test_practice_requests_low_reasoning_effort(monkeypatch):
    received = []

    async def fake_create(**kwargs):
        received.append(kwargs)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='{"answer":"ok"}'))]
        )

    monkeypatch.setattr(llm, "_create_completion", fake_create)
    asyncio.run(
        llm.chat(
            [{"role": "user", "content": "Create one compact question"}],
            task="practice",
            max_tokens=100,
        )
    )

    assert received[0]["reasoning_effort"] == "low"
    assert received[0]["max_tokens"] == 100


def test_reasoning_effort_policy_defaults_and_overrides(monkeypatch):
    expected = {
        "ppt": "low",
        "mcq": "low",
        "flashcard": "low",
        "notes": "low",
        "split": "low",
        "viva_questions": "low",
        "mermaid": "low",
        "evaluation_feedback": "low",
        "practice": "low",
        "solve": "high",
        "grading": "high",
        "code_debug": "high",
        "reasoning": None,
        "json": None,
    }
    assert {
        task: llm.reasoning_effort_for(task) for task in expected
    } == expected

    monkeypatch.setattr(llm.settings, "reasoning_effort_ppt", "")
    assert llm.reasoning_effort_for("ppt") is None
    monkeypatch.setattr(llm.settings, "reasoning_effort_ppt", " HIGH ")
    assert llm.reasoning_effort_for("ppt") == "high"


def test_rejected_reasoning_effort_retries_once_without_it(monkeypatch, caplog):
    calls = []
    request = httpx.Request("POST", "http://omniroute.test/v1/chat")
    response = httpx.Response(
        400,
        request=request,
        json={"error": {"message": "Unsupported parameter: reasoning_effort"}},
    )

    async def fake_create(**kwargs):
        calls.append(kwargs.copy())
        if "reasoning_effort" in kwargs:
            raise llm.APIStatusError(
                "Bad request", response=response, body=response.json()
            )
        return "completed"

    monkeypatch.setattr(
        llm,
        "_client",
        SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
        ),
    )
    result = asyncio.run(
        llm._create_completion(
            model="test-model", reasoning_effort="low", diagnostic_step="policy test"
        )
    )

    assert result == "completed"
    assert len(calls) == 2
    assert calls[0]["reasoning_effort"] == "low"
    assert "reasoning_effort" not in calls[1]
    assert "retrying once without it" in caplog.text


def test_completion_surfaces_mocked_upstream_failure_safely(monkeypatch, caplog):
    request = httpx.Request("POST", "http://omniroute.test/v1/chat")
    response = httpx.Response(
        400,
        request=request,
        json={"error": {"message": "Invalid generation parameters."}},
    )

    async def fail_create(**kwargs):
        raise llm.APIStatusError(
            "Bad request", response=response, body=response.json()
        )

    monkeypatch.setattr(
        llm,
        "_client",
        SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=fail_create))
        ),
    )
    with pytest.raises(llm.OmniRouteError) as raised:
        asyncio.run(llm._create_completion(diagnostic_step="mock generation"))

    assert raised.value.status_code == 400
    assert raised.value.error_type == "APIStatusError"
    assert "Invalid generation parameters" in raised.value.response_excerpt
    assert "status_code=400" in caplog.text
    assert "Invalid generation parameters" in caplog.text


def test_stream_emits_only_final_content_and_ignores_reasoning_fields(monkeypatch):
    events = [
        SimpleNamespace(
            choices=[
                SimpleNamespace(
                    delta=SimpleNamespace(
                        content="Here is the answer. <thi",
                        reasoning_content="private reasoning field",
                    )
                )
            ]
        ),
        SimpleNamespace(
            choices=[
                SimpleNamespace(
                    delta=SimpleNamespace(
                        content='nk>ignore this</think> The result is 4.',
                        reasoning_content="more private reasoning",
                    )
                )
            ]
        ),
    ]

    async def fake_create_stream(**kwargs):
        async def event_stream():
            for event in events:
                yield event

        return event_stream()

    monkeypatch.setattr(llm, "_create_stream_with_retry", fake_create_stream)
    monkeypatch.setattr(llm, "_llm_semaphore", asyncio.Semaphore(2))

    async def collect():
        return [
            item
            async for item in llm.stream(
                [{"role": "user", "content": "What is 2+2?"}]
            )
        ]

    result = asyncio.run(collect())

    assert "".join(result) == "Here is the answer.  The result is 4."
    assert "ignore this" not in "".join(result)
    assert "private reasoning" not in "".join(result)


def test_completion_retries_rate_limits_with_exponential_backoff(monkeypatch):
    calls = 0
    delays = []
    response = httpx.Response(
        429, request=httpx.Request("POST", "http://omniroute.test/v1/chat")
    )

    async def fake_create(**kwargs):
        nonlocal calls
        calls += 1
        if calls < 3:
            raise llm.RateLimitError("rate limited", response=response, body={})
        return "completed"

    async def fake_sleep(delay):
        delays.append(delay)

    monkeypatch.setattr(
        llm,
        "_client",
        SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
        ),
    )
    monkeypatch.setattr(llm.asyncio, "sleep", fake_sleep)

    result = asyncio.run(llm._create_completion())

    assert result == "completed"
    assert calls == 3
    assert delays == [0.25, 0.5]


def test_completion_concurrency_is_limited_by_semaphore(monkeypatch):
    active = 0
    peak = 0

    async def fake_create(**kwargs):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.01)
        active -= 1
        return "completed"

    monkeypatch.setattr(
        llm,
        "_client",
        SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
        ),
    )
    monkeypatch.setattr(llm, "_llm_semaphore", asyncio.Semaphore(2))

    async def run_requests():
        return await asyncio.gather(*(llm._create_completion() for _ in range(6)))

    assert asyncio.run(run_requests()) == ["completed"] * 6
    assert peak == 2


def test_health_probe_is_lightweight_and_cached(monkeypatch):
    calls = []

    async def fake_create(**kwargs):
        calls.append(kwargs)
        return object()

    monkeypatch.setattr(llm, "_create_completion", fake_create)
    monkeypatch.setattr(llm, "_health_checked_at", 0.0)
    monkeypatch.setattr(llm, "_health_result", (False, 0))
    monkeypatch.setattr(llm, "_health_failed_probes", 0)

    async def run_probes():
        return await asyncio.gather(llm.check_models(), llm.check_models())

    assert asyncio.run(run_probes()) == [(True, 0), (True, 0)]
    assert len(calls) == 1
    assert calls[0]["max_tokens"] == 1
    assert calls[0]["timeout"] == 5.0
    assert calls[0]["model"] == llm.model_for("json")


def test_health_keeps_last_good_until_two_failed_probes(monkeypatch):
    outcomes = iter([None, llm.OmniRouteError("offline"), llm.OmniRouteError("offline")])

    async def fake_create(**kwargs):
        outcome = next(outcomes)
        if outcome is not None:
            raise outcome
        return object()

    monkeypatch.setattr(llm, "_create_completion", fake_create)
    monkeypatch.setattr(llm, "_HEALTH_CACHE_TTL", 0.0)
    monkeypatch.setattr(llm, "_health_checked_at", 0.0)
    monkeypatch.setattr(llm, "_health_result", (False, 0))
    monkeypatch.setattr(llm, "_health_failed_probes", 0)

    async def run_probes():
        return [
            await llm.check_models(),
            await llm.check_models(),
            await llm.check_models(),
        ]

    assert asyncio.run(run_probes()) == [
        (True, 0),
        (True, 0),
        (False, 0),
    ]


def test_retry_after_honored_and_capped_in_completion(monkeypatch):
    calls = 0
    delays = []
    # 429 response with Retry-After: 35 (should cap at 20)
    response_capped = httpx.Response(
        429,
        headers={"retry-after": "35"},
        request=httpx.Request("POST", "http://omniroute.test/v1/chat"),
    )
    # 429 response with Retry-After: 3
    response_normal = httpx.Response(
        429,
        headers={"retry-after": "3"},
        request=httpx.Request("POST", "http://omniroute.test/v1/chat"),
    )

    async def fake_create(**kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise llm.RateLimitError("rate limited", response=response_capped, body={})
        if calls == 2:
            raise llm.RateLimitError("rate limited", response=response_normal, body={})
        return "success"

    async def fake_sleep(delay):
        delays.append(delay)

    monkeypatch.setattr(
        llm,
        "_client",
        SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
        ),
    )
    monkeypatch.setattr(llm.asyncio, "sleep", fake_sleep)

    result = asyncio.run(llm._create_completion())
    assert result == "success"
    assert calls == 3
    assert delays == [20.0, 3.0]


def test_retry_after_honored_and_capped_in_stream(monkeypatch):
    calls = 0
    delays = []
    response = httpx.Response(
        429,
        headers={"retry-after": "25"},
        request=httpx.Request("POST", "http://omniroute.test/v1/chat"),
    )

    async def fake_create(**kwargs):
        nonlocal calls
        calls += 1
        if calls < 3:
            raise llm.RateLimitError("rate limited", response=response, body={})
        return "streamed"

    async def fake_sleep(delay):
        delays.append(delay)

    monkeypatch.setattr(
        llm,
        "_client",
        SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
        ),
    )
    monkeypatch.setattr(llm.asyncio, "sleep", fake_sleep)

    result = asyncio.run(llm._create_stream_with_retry())
    assert result == "streamed"
    assert delays == [20.0, 20.0]


def test_llm_semaphore_allows_concurrency_down_to_one(monkeypatch):
    from app.config import Settings
    custom_settings = Settings(max_concurrent_llm=1)
    sem = asyncio.Semaphore(max(1, custom_settings.max_concurrent_llm))
    assert sem._value == 1


def test_task_role_has_no_duplicates():
    # Verify key roles exist
    for role in ("grading", "split", "ppt", "mcq", "flashcard", "teacher", "reasoning", "multimodal", "json"):
        assert role in llm._TASK_ROLE

