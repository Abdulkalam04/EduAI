import asyncio

from app.services import grading


def test_mcq_is_graded_in_code():
    correct = grading.grade_mcq("2", 2, ["A", "B", "C"], 3)
    wrong = grading.grade_mcq("not-a-choice", 2, ["A", "B", "C"], 3)

    assert (correct.awarded, correct.status) == (3, "correct")
    assert (wrong.awarded, wrong.status) == (0, "wrong")
    assert "C" in wrong.feedback


def test_written_grading_uses_four_part_rubric(monkeypatch):
    captured = {}

    async def fake_json_call(messages, response_model, task="json", **kwargs):
        captured.update(task=task, prompt=messages[-1]["content"], kwargs=kwargs)
        return response_model(
            rubric=[
                {"label": "Presentation", "got": 1.5, "max": 1.5},
                {"label": "Example", "got": 2, "max": 2},
                {"label": "Concept", "got": 3.9, "max": 4},
                {"label": "Explanation", "got": 2.5, "max": 2.5},
            ],
            feedback="Clear, accurate answer.",
        )

    monkeypatch.setattr(grading, "json_call", fake_json_call)
    result = asyncio.run(
        grading.grade_written_answer(
            question="Explain the concept",
            model_answer="Reference",
            answer="Student response",
            topic="Science",
            marks=10,
            level="c9-10",
        )
    )

    assert [item.label for item in result.rubric] == [
        "Concept", "Explanation", "Example", "Presentation"
    ]
    assert result.awarded == 9.9
    assert result.status == "correct"
    assert captured["task"] == "grading"
    assert "Learner level: c9-10" in captured["prompt"]


def test_rubric_allocates_positive_maxima_for_single_mark_questions():
    maxima = grading._rubric_maxima(1)

    assert all(value > 0 for value in maxima.values())
    assert round(sum(maxima.values()), 2) == 1
