import json
import logging
import uuid
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ChatMessage, ChatSession
from app.schemas import ChatRequest
from app.services.llm import OmniRouteError, stream
from app.services.prompts import build_system_prompt

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["chat"])
_LEVEL_PROMPT = "Sure! What is your class?"


def _history(db: Session, session_id: str) -> list[dict[str, str]]:
    messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.id.desc())
        .limit(20)
    ).all()
    return [{"role": row.role, "content": row.content} for row in reversed(messages)]


@router.post("/chat")
async def chat_stream(
    payload: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    session_id = payload.session_id or str(uuid.uuid4())
    if payload.level is None:
        return StreamingResponse(
            _emit_text(_LEVEL_PROMPT),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    session = db.get(ChatSession, session_id)
    if session is None:
        session = ChatSession(id=session_id)
        db.add(session)
        db.commit()

    history = _history(db, session_id)
    db.add(ChatMessage(session_id=session_id, role="user", content=payload.prompt_text))
    db.commit()
    messages = [
        {
            "role": "system",
            "content": build_system_prompt(payload.level, payload.subject, payload.style),
        },
        *history,
        {"role": "user", "content": payload.prompt_text},
    ]

    try:
        generator = stream(messages, task="teacher", temperature=0.4)
        first = await anext(generator, None)
    except OmniRouteError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    async def response_events() -> AsyncGenerator[bytes, None]:
        accumulated = ""
        try:
            if first:
                accumulated += first
                yield _sse_data({"token": first})
            async for delta in generator:
                accumulated += delta
                yield _sse_data({"token": delta})
            if accumulated:
                db.add(
                    ChatMessage(
                        session_id=session_id, role="assistant", content=accumulated
                    )
                )
                db.commit()
        except OmniRouteError as error:
            logger.warning("Chat stream failed for request %s", request.state.request_id)
            yield _sse_data({"error": str(error)})
        finally:
            yield b"data: [DONE]\n\n"

    return StreamingResponse(
        response_events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _emit_text(text: str) -> AsyncGenerator[bytes, None]:
    yield _sse_data({"token": text})
    yield b"data: [DONE]\n\n"


def _sse_data(data: dict[str, str]) -> bytes:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")
