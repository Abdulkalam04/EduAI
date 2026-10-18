import asyncio
import json

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.auth import AuthUser
from app.database import Base
from app.models import StudyDocument
from app.routers import docs


def test_generated_document_results_are_saved_and_owner_scoped(monkeypatch) -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    db = Session(engine)
    user = AuthUser(uid="student-1")
    document = StudyDocument(
        id="document-1",
        user_id=user.uid,
        title="chapter.pdf",
        page_count=1,
        uploaded_at="2026-10-13",
        pages_json=json.dumps([{"page": 1, "text": "A short chapter."}]),
        token_estimate=5,
        sections_json=json.dumps([{"title": "Chapter 1", "page": 1}]),
    )
    db.add(document)
    db.commit()

    async def generate_result(_pages, task, _token_estimate):
        if task == "summary":
            return {"kind": "summary", "md": "Saved chapter summary"}
        return {"kind": "flashcards", "cards": [{"front": "Term", "back": "Definition"}]}

    monkeypatch.setattr(docs, "generate_document_result", generate_result)

    try:
        summary = asyncio.run(
            docs.generate_from_document(
                document_id=document.id,
                payload=docs.DocumentGeneration(task="summary"),
                db=db,
                current_user=user,
            )
        )
        flashcards = asyncio.run(
            docs.generate_from_document(
                document_id=document.id,
                payload=docs.DocumentGeneration(task="flashcards"),
                db=db,
                current_user=user,
            )
        )

        assert summary == {"kind": "summary", "md": "Saved chapter summary"}
        assert flashcards["kind"] == "flashcards"

        workspace = docs.get_document(document_id=document.id, db=db, current_user=user)
        assert workspace["results"] == {
            "summary": summary,
            "flashcards": flashcards,
        }

        with pytest.raises(HTTPException) as error:
            docs.get_document(
                document_id=document.id,
                db=db,
                current_user=AuthUser(uid="another-student"),
            )
        assert error.value.status_code == 404
    finally:
        db.close()
        engine.dispose()
