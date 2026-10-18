import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.auth import AuthUser
from app.database import Base
from app.routers import solve


def test_solved_paper_is_saved_and_only_visible_to_its_owner(monkeypatch) -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    db = Session(engine)
    user = AuthUser(uid="student-1")
    file = SimpleNamespace(filename="algebra.pdf", content_type="application/pdf")

    async def read_upload(_file):
        return "algebra.pdf", b"paper contents"

    async def extract_pages(_payload, _filename, _content_type):
        return [{"page": 1, "text": "1. Solve x + 2 = 5"}]

    async def extract_questions(_text):
        return [solve.ExtractedQuestion(number=1, text="Solve x + 2 = 5", marks=2)]

    async def solve_question(question, _level, _subject, _mode, _style):
        return {
            "id": "question-1",
            "n": question.number,
            "text": question.text,
            "marks": question.marks,
            "status": "solved",
            "hints": ["Isolate x.", "Subtract 2."],
            "solution": {
                "given": [],
                "steps": ["x = 5 - 2"],
                "therefore": "x = 3",
                "answer": "3",
            },
        }

    monkeypatch.setattr(solve, "read_validated_upload", read_upload)
    monkeypatch.setattr(solve, "extract_document", extract_pages)
    monkeypatch.setattr(solve, "format_page_text", lambda _pages: "1. Solve x + 2 = 5")
    monkeypatch.setattr(solve, "extract_questions", extract_questions)
    monkeypatch.setattr(solve, "_solve_question", solve_question)

    try:
        questions = asyncio.run(
            solve.solve_paper(
                file=file,
                level="c9-10",
                subject="Mathematics",
                mode="exam",
                style="Exam",
                db=db,
                current_user=user,
            )
        )
        history = asyncio.run(solve.solved_paper_history(db=db, current_user=user))

        assert len(questions) == 1
        assert len(history) == 1
        assert history[0]["title"] == "algebra.pdf"
        assert history[0]["question_count"] == 1

        saved = asyncio.run(
            solve.get_solved_paper(
                paper_id=str(history[0]["id"]),
                db=db,
                current_user=user,
            )
        )
        assert saved["questions"] == questions

        with pytest.raises(HTTPException) as error:
            asyncio.run(
                solve.get_solved_paper(
                    paper_id=str(history[0]["id"]),
                    db=db,
                    current_user=AuthUser(uid="another-student"),
                )
            )
        assert error.value.status_code == 404
    finally:
        db.close()
        engine.dispose()
