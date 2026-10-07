"""Deterministic MCQ grading and rubric-based written-answer evaluation."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field

from app.services.llm import json_call

RubricLabel = Literal["Concept", "Explanation", "Example", "Presentation"]
GradeStatus = Literal["correct", "partial", "wrong"]
_RUBRIC_WEIGHTS: tuple[tuple[RubricLabel, int], ...] = (
    ("Concept", 40),
    ("Explanation", 25),
    ("Example", 20),
    ("Presentation", 15),
)
_GRADE_SEMAPHORE = asyncio.Semaphore(4)


class RubricScore(BaseModel):
    label: RubricLabel
    got: float = Field(ge=0)
    max: float = Field(gt=0)


class WrittenGradeResponse(BaseModel):
    rubric: list[RubricScore] = Field(min_length=4, max_length=4)
    feedback: str = Field(min_length=1)


@dataclass(frozen=True)
class GradeResult:
    awarded: float
    status: GradeStatus
    feedback: str
    rubric: tuple[RubricScore, ...] = ()


def _rubric_maxima(total: int) -> dict[RubricLabel, float]:
    if total <= 0:
        raise ValueError("Question marks must be positive.")
    result = {
        label: round(total * weight / 100, 2) for label, weight in _RUBRIC_WEIGHTS
    }
    remainder = round(total - sum(result.values()), 2)
    result["Concept"] = round(result["Concept"] + remainder, 2)
    return result


def validate_rubric_rows(rubric: list[object], total: int) -> None:
    maxima = _rubric_maxima(total)
    scores = {getattr(item, "label", None): item for item in rubric}
    if set(scores) != set(maxima):
        raise ValueError("The grading response must include all four rubric criteria.")
    for label, maximum in maxima.items():
        item = scores[label]
        item_max = float(getattr(item, "max"))
        item_got = float(getattr(item, "got"))
        if abs(item_max - maximum) > 0.01 or item_got > maximum:
            raise ValueError(f"The {label} score must be between 0 and {maximum}.")


def validate_evaluation_rubric(evaluation: object) -> None:
    validate_rubric_rows(
        getattr(evaluation, "rubric"),
        int(getattr(evaluation, "marks")),
    )


def validate_evaluation_set(evaluation_set: object) -> None:
    for evaluation in getattr(evaluation_set, "evaluations"):
        validate_evaluation_rubric(evaluation)


def grade_mcq(selected: str, correct: int | None, options: list[str] | None, marks: int) -> GradeResult:
    if correct is None or options is None or not 0 <= correct < len(options):
        raise ValueError("The stored MCQ has no valid correct option.")
    try:
        selected_index = int(selected)
    except ValueError:
        selected_index = -1
    if selected_index == correct:
        return GradeResult(float(marks), "correct", "Spot on!")
    return GradeResult(
        0,
        "wrong",
        f"Close! The right option is {options[correct]}.",
    )


async def grade_written_answer(
    *,
    question: str,
    model_answer: str,
    answer: str,
    topic: str,
    marks: int,
    level: str | None = None,
) -> GradeResult:
    maxima = _rubric_maxima(marks)

    prompt = (
        f"Question ({marks} marks): {question}\n"
        f"Topic: {topic}\n"
        f"Reference answer: {model_answer}\n"
        f"Student answer: {answer}\n"
        f"Learner level: {level or 'unspecified'}\n"
        f"Use these exact rubric maxima: {maxima}. "
        "Score Concept for factual correctness, Explanation for reasoning and completeness, "
        "Example for a relevant example (award the full Example score when no example is "
        "appropriate and the answer is otherwise complete), and Presentation for clarity, "
        "organization, and readable language. Return JSON with rubric rows containing label, "
        "got, max, plus one concise supportive feedback string. Do not award more than the "
        "maximum marks."
    )
    async with _GRADE_SEMAPHORE:
        result = await json_call(
            [
                {
                    "role": "system",
                    "content": (
                        "Grade written student answers fairly using the specified four-part "
                        "rubric. Return only the requested JSON."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            WrittenGradeResponse,
            task="grading",
            step="Written-answer rubric grading",
            timeout=180.0,
            max_tokens=1200,
            validator=lambda result: validate_rubric_rows(result.rubric, marks),
        )
    rubric = tuple(sorted(result.rubric, key=lambda item: next(
        index for index, (label, _) in enumerate(_RUBRIC_WEIGHTS) if item.label == label
    )))
    awarded = sum(item.got for item in rubric)
    ratio = awarded / marks
    status: GradeStatus = "correct" if ratio >= 0.8 else "partial" if ratio > 0 else "wrong"
    return GradeResult(awarded, status, result.feedback, rubric)
