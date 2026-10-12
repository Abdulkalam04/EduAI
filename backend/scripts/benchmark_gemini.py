import asyncio
import argparse
import json
import re
import statistics
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from openai import APIStatusError, OpenAIError

from app.config import settings
from app.services import llm


RUNS_PER_MODEL = 3
MIN_SECONDS_BETWEEN_MODEL_REQUESTS = 20.0
MAX_TOKENS = 2048
MODEL_IDS = (
    "gemini/gemini-3.5-flash-lite",
    "gemini/gemini-3.1-flash-lite",
    "gemini/gemini-3.6-flash",
    "gemini/gemini-3.8-flash",
)

QUESTIONS = (
    ("q1", "What is 3/4 + 2/3?", "17/12 (or approximately 1.4167)", r"(17\s*/\s*12|1\.416[0-9]*)"),
    ("q2", "A car travels 120 km in 2 hours. What is its average speed?", "60 km/h", r"(?<![\d.])60(?:\.0+)?\s*(?:km\s*/\s*h|km\s+per\s+hour)\b"),
    (
        "q3",
        "Solve 3x + 5 = 20.",
        "x = 5",
        r"(?:\bx\s*=\s*5(?:\.0+)?\b|(?:^|\n)\s*(?:(?:final\s+)?answer\s*(?:is|[:=-])\s*)?5(?:\.0+)?\s*[.!]?\s*$)",
    ),
    ("q4", "A rectangle is 8 cm long and 5 cm wide. What is its area?", "40 square cm", r"(?<![\d.])40(?:\.0+)?\s*(?:square\s*(?:centimet(?:er|re)s?)?|sq\.?\s*cm|cm\s*(?:\^?2|²))\b"),
    ("q5", "A 12 N force acts on a 3 kg object. What is its acceleration?", "4 m/s^2", r"(?<![\d.])4(?:\.0+)?\s*(?:m\s*/\s*s(?:\^?2|²)|met(?:er|re)s?\s+per\s+second\s+squared)\b"),
    ("q6", "What color does blue litmus paper turn in an acid?", "Red", r"\bred\b"),
    ("q7", "Name the two main products of photosynthesis.", "Glucose and oxygen", r"glucose.*oxygen|oxygen.*glucose"),
    ("q8", "At what temperature does pure water boil at sea level?", "100 degrees Celsius", r"(?<![\d.])100(?:\.0+)?\s*(?:degrees?\s*)?(?:celsius|°\s*c)\b"),
)

PROMPT = (
    "Answer all 8 school-level questions. Return only one JSON object with keys "
    "q1 through q8 and concise string answers. Do not omit any key.\n"
    + "\n".join(
        f"{key}: {question}" for key, question, _, _ in QUESTIONS
    )
)


def _prompt_for_run(run_nonce: str) -> str:
    return f"{PROMPT}\n\nBenchmark request nonce (ignore): {run_nonce}"


@dataclass
class RunResult:
    ttft_seconds: float | None = None
    total_seconds: float = 0.0
    raw_reply: str = ""
    finish_reason: str | None = None
    completion_tokens: int | None = None
    reasoning_tokens: int | None = None
    http_status: int | None = None
    error_body: str | None = None


def _redact_secrets(text: str) -> str:
    if settings.omniroute_api_key:
        text = text.replace(settings.omniroute_api_key, "[REDACTED]")
    return re.sub(r"\b(?:sk-or-v1-|sk-)[A-Za-z0-9_-]{12,}\b", "[REDACTED]", text)


def _status_code_from_error(error: Exception) -> int | None:
    status_code = getattr(error, "status_code", None)
    if isinstance(status_code, int):
        return status_code
    match = re.search(
        r"(?:\[(\d{3})\]|HTTP\s+(\d{3}))",
        str(error),
        flags=re.IGNORECASE,
    )
    if match is None:
        return None
    return int(next(group for group in match.groups() if group))


def _extract_json_object(reply: str) -> dict[str, Any] | None:
    cleaned = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", reply, flags=re.IGNORECASE)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end < start:
        return None
    try:
        decoded = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return None
    if isinstance(decoded, dict) and isinstance(decoded.get("answers"), dict):
        decoded = decoded["answers"]
    return decoded if isinstance(decoded, dict) else None


def _correct_answers(reply: str) -> dict[str, bool]:
    answers = _extract_json_object(reply)
    if answers is None:
        return {key: False for key, *_ in QUESTIONS}
    results: dict[str, bool] = {}
    for key, _, _, pattern in QUESTIONS:
        value = answers.get(key)
        if not isinstance(value, (str, int, float)):
            results[key] = False
            continue
        text = str(value)
        contains_wrong_fraction_claim = key == "q1" and re.search(
            r"(?<!not )\b(?:is\s+)?equal to 1(?:\.0+)?\b",
            text,
            re.IGNORECASE,
        )
        results[key] = not contains_wrong_fraction_claim and re.search(
            pattern, text, re.IGNORECASE
        ) is not None
    return results


def _print_question_failures(model_id: str, run_number: int, result: RunResult) -> None:
    answers = _extract_json_object(result.raw_reply)
    correct = _correct_answers(result.raw_reply)
    for key, question, expected, _ in QUESTIONS:
        if correct[key] and result.error_body is None:
            continue
        print(
            f"  failed question {key} (model={model_id}, run={run_number})\n"
            f"    question: {question}\n"
            f"    expected: {expected}\n"
            f"    raw reply: {result.raw_reply!r}\n"
            f"    finish_reason: {result.finish_reason!r}\n"
            f"    HTTP status: {result.http_status!r}; "
            f"error body: "
            f"{_redact_secrets(result.error_body) if result.error_body is not None else '<none; HTTP 200>'}\n"
            f"    completion_tokens: {result.completion_tokens!r}; "
            f"reasoning_tokens: {result.reasoning_tokens!r}"
        )
        if answers is None:
            print("    parse note: the reply did not contain a JSON object.")


async def _run_once(model_id: str, run_nonce: str) -> RunResult:
    result = RunResult()
    started: float | None = None
    first_text_at: float | None = None
    try:
        raw_model = await llm._require_verified_free_model(model_id)
        max_tokens = llm._effective_max_tokens(model_id, MAX_TOKENS, raw_model)
        effort = llm.reasoning_effort_for("teacher")
        request_options: dict[str, Any] = {
            "model": model_id,
            "messages": [{"role": "user", "content": _prompt_for_run(run_nonce)}],
            "temperature": 0,
            "max_tokens": max_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if effort:
            request_options["reasoning_effort"] = effort
        started = time.perf_counter()
        stream = await llm._client.chat.completions.create(**request_options)
        result.http_status = 200
        async for event in stream:
            usage = getattr(event, "usage", None)
            if usage is not None:
                result.completion_tokens = getattr(usage, "completion_tokens", None)
                details = getattr(usage, "completion_tokens_details", None)
                result.reasoning_tokens = getattr(details, "reasoning_tokens", None)
            choices = getattr(event, "choices", ())
            if not choices:
                continue
            choice = choices[0]
            if getattr(choice, "finish_reason", None) is not None:
                result.finish_reason = choice.finish_reason
            delta = getattr(choice, "delta", None)
            content = getattr(delta, "content", None)
            if isinstance(content, str) and content:
                if first_text_at is None:
                    first_text_at = time.perf_counter()
                result.raw_reply += content
    except APIStatusError as error:
        result.http_status = error.status_code
        result.error_body = error.response.text
    except (OpenAIError, llm.OmniRouteError) as error:
        result.http_status = _status_code_from_error(error)
        result.error_body = str(error)
    finally:
        ended = time.perf_counter()
        if started is not None:
            result.total_seconds = ended - started
        if started is not None and first_text_at is not None:
            result.ttft_seconds = first_text_at - started
    return result


async def _benchmark_model(model_id: str) -> list[RunResult]:
    results: list[RunResult] = []
    previous_request_at: float | None = None
    for run_number in range(1, RUNS_PER_MODEL + 1):
        if previous_request_at is not None:
            elapsed = time.monotonic() - previous_request_at
            await asyncio.sleep(max(0.0, MIN_SECONDS_BETWEEN_MODEL_REQUESTS - elapsed))
        previous_request_at = time.monotonic()
        result = await _run_once(model_id, uuid.uuid4().hex)
        results.append(result)
        has_error = result.error_body is not None
        correctness = _correct_answers(result.raw_reply)
        response_succeeded = (
            not has_error
            and bool(result.raw_reply.strip())
            and result.finish_reason != "length"
        )
        if not response_succeeded or not all(correctness.values()):
            _print_question_failures(model_id, run_number, result)
    return results


def _print_summary(model_id: str, results: list[RunResult]) -> None:
    successful = [
        result
        for result in results
        if result.error_body is None
        and bool(result.raw_reply.strip())
        and result.finish_reason != "length"
    ]
    ttfts = [result.ttft_seconds for result in results if result.ttft_seconds is not None]
    totals = [result.total_seconds for result in results]
    print(
        f"{model_id}: median_ttft={statistics.median(ttfts):.2f}s"
        if ttfts
        else f"{model_id}: median_ttft=unavailable",
        end="; ",
    )
    print(
        f"median_total={statistics.median(totals):.2f}s; "
        f"success_rate={len(successful)}/{len(results)}; "
        f"fully_correct_runs={sum(all(_correct_answers(r.raw_reply).values()) for r in results)}"
        f"/{len(results)}; "
        f"correct={sum(sum(_correct_answers(r.raw_reply).values()) for r in results)}"
        f"/{len(results) * len(QUESTIONS)}"
    )


async def main(
    model_ids: tuple[str, ...] = MODEL_IDS,
    runs_per_model: int = RUNS_PER_MODEL,
    interval_seconds: float = MIN_SECONDS_BETWEEN_MODEL_REQUESTS,
) -> None:
    try:
        await llm._refresh_model_registry(force=True)
    except llm.OmniRouteError as error:
        print(f"Benchmark not run: OmniRoute model pricing is unavailable: {error}")
        return

    eligible: list[str] = []
    for model_id in model_ids:
        try:
            await llm._require_verified_free_model(model_id)
        except llm.OmniRouteError as error:
            print(
                f"{model_id}: NOT RUN; local free-model guard returned "
                f"{error.status_code} before any chat-completion HTTP request: {error}"
            )
            continue
        eligible.append(model_id)

    if not eligible:
        print("No Gemini candidates have verified zero pricing; no benchmark requests sent.")
        return

    previous_request_at: float | None = None
    for model_id in eligible:
        results: list[RunResult] = []
        for run_number in range(1, runs_per_model + 1):
            if previous_request_at is not None:
                elapsed = time.monotonic() - previous_request_at
                await asyncio.sleep(max(0.0, interval_seconds - elapsed))
            previous_request_at = time.monotonic()
            result = await _run_once(model_id, uuid.uuid4().hex)
            results.append(result)
            has_error = result.error_body is not None
            correctness = _correct_answers(result.raw_reply)
            response_succeeded = (
                not has_error
                and bool(result.raw_reply.strip())
                and result.finish_reason != "length"
            )
            if not response_succeeded or not all(correctness.values()):
                _print_question_failures(model_id, run_number, result)
        _print_summary(model_id, results)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", nargs="+", default=MODEL_IDS)
    parser.add_argument("--runs", type=int, default=RUNS_PER_MODEL)
    parser.add_argument(
        "--interval-seconds",
        type=float,
        default=MIN_SECONDS_BETWEEN_MODEL_REQUESTS,
    )
    options = parser.parse_args()
    if options.runs < 1 or options.interval_seconds < 0:
        parser.error("--runs must be positive and --interval-seconds cannot be negative")
    asyncio.run(main(tuple(options.models), options.runs, options.interval_seconds))
