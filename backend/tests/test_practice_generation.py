import asyncio
import re
from typing import get_args

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.auth import AuthUser
from app.database import Base
from app.routers import practice
from app.services.llm import JsonCallError


def test_practice_generation_is_sequential_and_matches_preview_structure(
    monkeypatch,
) -> None:
    expected = {
        20: (("A", 6, 1), ("B", 2, 2), ("C", 1, 5), ("D", 1, 5)),
        30: (("A", 4, 1), ("B", 3, 2), ("C", 2, 5), ("D", 2, 5)),
        50: (("A", 10, 1), ("B", 5, 2), ("C", 3, 5), ("D", 3, 5)),
        80: (("A", 14, 1), ("B", 8, 2), ("C", 5, 5), ("D", 5, 5)),
        100: (("A", 20, 1), ("B", 10, 2), ("C", 6, 5), ("D", 6, 5)),
    }
    assert {
        marks: tuple(
            (section_id, count, each)
            for section_id, _, count, each in specs
        )
        for marks, specs in practice._SECTION_PLANS.items()
    } == expected

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    db = Session(engine)
    call_steps: list[str] = []
    active_calls = 0
    peak_active_calls = 0

    async def fake_json_call(_messages, response_model, **kwargs):
        nonlocal active_calls, peak_active_calls
        active_calls += 1
        peak_active_calls = max(peak_active_calls, active_calls)
        call_steps.append(kwargs["step"])
        try:
            await asyncio.sleep(0.001)
            requested_count = int(re.search(r"Create (\d+)", _messages[1]["content"])[1])
            each = int(
                re.search(r"each exactly (\d+) marks", _messages[1]["content"])[1]
            )
            question_model = get_args(
                response_model.model_fields["questions"].annotation
            )[0]
            is_mcq = "MCQ" in kwargs["step"]
            question_type = "mcq" if is_mcq else kwargs["step"].split()[1]
            questions = [
                question_model(
                    type=question_type.lower(),
                    text=f"Question {index + 1}",
                    marks=each,
                    options=["A", "B", "C", "D"] if is_mcq else None,
                    correct=0 if is_mcq else None,
                    model="A short model answer.",
                    topic="Test topic",
                    keywords=[],
                )
                for index in range(requested_count)
            ]
            return response_model(questions=questions)
        finally:
            active_calls -= 1

    monkeypatch.setattr(practice, "json_call", fake_json_call)
    try:
        paper = asyncio.run(
            practice.generate_paper(
                practice.GeneratePaperRequest(
                    level="c9-10",
                    subject="Mathematics",
                    chapter="Algebra",
                    difficulty="Medium",
                    totalMarks=20,
                    timeMin=60,
                ),
                db=db,
                current_user=AuthUser(uid="student-1"),
            )
        )
        assert peak_active_calls == 1
        assert [section.id for section in paper.sections] == ["A", "B", "C", "D"]
        assert [(section.count, section.each) for section in paper.sections] == [
            (6, 1),
            (2, 2),
            (1, 5),
            (1, 5),
        ]
        assert sum(section.marks for section in paper.sections) == paper.totalMarks
        assert call_steps[0].startswith("Practice MCQ section A")
        assert call_steps[-1].startswith("Practice numerical section D")
    finally:
        db.close()
        engine.dispose()


def test_practice_generation_recovers_questions_with_inferred_section_metadata(
    monkeypatch,
) -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    db = Session(engine)
    section_b_calls = 0

    async def fake_json_call(_messages, response_model, **kwargs):
        nonlocal section_b_calls
        step = kwargs["step"]
        if "short section B" in step:
            section_b_calls += 1
            if section_b_calls == 1:
                raw_response = (
                    '{"questions":[{"question":"What is a noun?",'
                    '"answer":"A naming word."}]}'
                )
                raise JsonCallError(
                    step,
                    ValueError("missing required schema fields"),
                    "Invalid question object.",
                    raw_response,
                )

        requested_count = int(re.search(r"Create (\d+)", _messages[1]["content"])[1])
        each = int(re.search(r"each exactly (\d+) marks", _messages[1]["content"])[1])
        question_model = get_args(
            response_model.model_fields["questions"].annotation
        )[0]
        is_mcq = "MCQ" in step
        question_type = "mcq" if is_mcq else step.split()[1]
        return response_model(
            questions=[
                question_model(
                    type=question_type.lower(),
                    text=f"Question {index + 1}",
                    marks=each,
                    options=["A", "B", "C", "D"] if is_mcq else None,
                    correct=0 if is_mcq else None,
                    model="A short model answer.",
                    topic="Test topic",
                    keywords=[],
                )
                for index in range(requested_count)
            ]
        )

    monkeypatch.setattr(practice, "json_call", fake_json_call)
    try:
        paper = asyncio.run(
            practice.generate_paper(
                practice.GeneratePaperRequest(
                    level="c9-10",
                    subject="English",
                    chapter="Tenses",
                    difficulty="Easy",
                    totalMarks=20,
                    timeMin=35,
                ),
                db=db,
                current_user=AuthUser(uid="student-1"),
            )
        )
        short_questions = [question for question in paper.questions if question.section == "B"]
        assert section_b_calls == 2
        assert len(short_questions) == 2
        assert short_questions[0].text == "What is a noun?"
        assert short_questions[0].model == "A naming word."
        assert short_questions[0].topic == "Tenses"
        assert all(question.marks == 2 for question in short_questions)
        assert sum(question.marks for question in paper.questions) == 20
    finally:
        db.close()
        engine.dispose()
