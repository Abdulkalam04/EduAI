import asyncio

import pytest

from app.services import documents
from app.services.rag import DocumentPage


@pytest.mark.parametrize(
    ("token_estimate", "expected_calls"),
    [
        (1, 1),
        (documents.settings.long_context_max_tokens + 1, 2),
    ],
)
def test_notes_use_teacher_chain_with_fallbacks(
    monkeypatch, token_estimate: int, expected_calls: int
) -> None:
    tasks: list[str] = []

    async def fake_chat(_messages, *, task, temperature):
        tasks.append(task)
        return "Study notes"

    monkeypatch.setattr(documents, "chat", fake_chat)

    result = asyncio.run(
        documents.generate_document_result(
            [DocumentPage(page=1, text="Present tense uses the base verb.")],
            "notes",
            token_estimate,
        )
    )

    assert result == {"kind": "notes", "md": "Study notes"}
    assert tasks == ["teacher"] * expected_calls
