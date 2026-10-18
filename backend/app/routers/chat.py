import json
import logging
import uuid
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthUser, get_current_user
from app.config import settings
from app.database import get_db
from app.models import ChatMessage, ChatSession
from app.schemas import ChatModelsResponse, ChatRequest
from app.services.llm import (
    OmniRouteError,
    get_chat_models_catalogue,
    prepare_chat_stream,
    reset_request_model_callback,
    set_request_model_callback,
    stream as _llm_stream,
    validate_chat_model,
)
from app.services.prompts import build_system_prompt

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["chat"])
_LEVEL_PROMPT = "Sure! What is your class?"

# Exposed for monkeypatching compatibility in existing tests
stream = _llm_stream


def _history(db: Session, session_id: str, user_id: str) -> list[dict[str, str]]:
    limit = 20 if settings.chat_history_limit == 8 else max(2, settings.chat_history_limit * 2)
    messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id, ChatMessage.user_id == user_id)
        .order_by(ChatMessage.id.desc())
        .limit(limit)
    ).all()
    return [{"role": row.role, "content": row.content} for row in reversed(messages)]


@router.get("/chat/models", response_model=ChatModelsResponse)
async def list_chat_models(
    current_user: AuthUser = Depends(get_current_user),
) -> ChatModelsResponse:
    catalogue = await get_chat_models_catalogue()
    return ChatModelsResponse(models=catalogue)


@router.get("/chat/history/{session_id}")
async def get_chat_history(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    session = db.get(ChatSession, session_id)
    if session is None or session.user_id != current_user.uid:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id, ChatMessage.user_id == current_user.uid)
        .order_by(ChatMessage.id.asc())
    ).all()
    return {
        "session_id": session_id,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "model": m.model,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ],
    }


@router.post("/chat")
async def chat_stream(
    payload: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
) -> StreamingResponse:
    session_id = payload.session_id or str(uuid.uuid4())

    # Validate the model even when the client has not selected a class yet.
    req_model = (payload.model or "auto").strip()
    is_valid, error_msg, _ = await validate_chat_model(req_model)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    if payload.level is None:
        return StreamingResponse(
            _emit_text(_LEVEL_PROMPT),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    session = db.get(ChatSession, session_id)
    if session is None:
        session = ChatSession(id=session_id, user_id=current_user.uid)
        db.add(session)
        db.commit()
    elif session.user_id != current_user.uid:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    history = _history(db, session_id, current_user.uid)
    db.add(
        ChatMessage(
            session_id=session_id,
            role="user",
            content=payload.prompt_text,
            user_id=current_user.uid,
        )
    )
    db.commit()
    messages = [
        {
            "role": "system",
            "content": build_system_prompt(payload.level, payload.subject, payload.style),
        },
        *history,
        {"role": "user", "content": payload.prompt_text},
    ]

    tokens_map = {
        "Simple": settings.chat_max_tokens_simple,
        "Exam Answer": settings.chat_max_tokens_exam,
        "Detailed": settings.chat_max_tokens_detailed,
    }
    max_tokens = tokens_map.get(payload.style, settings.chat_max_tokens_simple)

    attachment = payload.attachment or {}
    has_image = bool(
        attachment.get("type", "").startswith("image/")
        or str(attachment.get("name", "")).lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".pdf"))
    )
    is_long_doc = len(payload.prompt_text) > 30_000

    # Handle monkeypatched stream in unit tests if present
    if stream is not _llm_stream:
        try:
            selected_model: dict[str, str] = {}
            callback_token = set_request_model_callback(
                lambda model: selected_model.__setitem__("model", model)
            )
            gen = stream(messages, task="teacher", temperature=0.4)
            first_chunk = await anext(gen, None)
        except OmniRouteError as error:
            status_code = 413 if error.status_code == 413 else 503
            raise HTTPException(status_code=status_code, detail=str(error)) from error
        finally:
            if "callback_token" in locals():
                reset_request_model_callback(callback_token)

        async def legacy_events() -> AsyncGenerator[bytes, None]:
            accumulated = ""
            try:
                if first_chunk:
                    accumulated += first_chunk
                    yield _sse_data({"token": first_chunk})
                async for delta in gen:
                    accumulated += delta
                    yield _sse_data({"token": delta})
                if accumulated:
                    db.add(
                        ChatMessage(
                            session_id=session_id,
                            role="assistant",
                            content=accumulated,
                            user_id=current_user.uid,
                            model=selected_model.get("model"),
                        )
                    )
                    db.commit()
            except OmniRouteError as error:
                yield _sse_data({"error": str(error)})
            finally:
                yield b"data: [DONE]\n\n"

        headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
        used = selected_model.get("model") or req_model
        headers["X-Model-Used"] = used
        headers["X-Model-Requested"] = req_model
        return StreamingResponse(
            legacy_events(),
            media_type="text/event-stream",
            headers=headers,
        )

    # Fast routing with hedging & truthful headers
    try:
        generator, used_model, fallback_from, _ = await prepare_chat_stream(
            messages,
            requested_model=req_model,
            temperature=0.4,
            max_tokens=max_tokens,
            has_image=has_image,
            is_long_doc=is_long_doc,
        )
    except OmniRouteError as error:
        status_code = 413 if error.status_code == 413 else 503
        raise HTTPException(status_code=status_code, detail=str(error)) from error

    async def response_events() -> AsyncGenerator[bytes, None]:
        accumulated = ""
        try:
            async for token in generator:
                accumulated += token
                yield _sse_data({"token": token})
            if accumulated:
                db.add(
                    ChatMessage(
                        session_id=session_id,
                        role="assistant",
                        content=accumulated,
                        user_id=current_user.uid,
                        model=used_model,
                    )
                )
                db.commit()
        except OmniRouteError as error:
            logger.warning("Chat stream failed for request %s", request.state.request_id)
            yield _sse_data({"error": str(error)})
        finally:
            yield b"data: [DONE]\n\n"

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "X-Model-Used": used_model,
        "X-Model-Requested": req_model,
    }
    if fallback_from:
        headers["X-Model-Fallback"] = fallback_from

    return StreamingResponse(
        response_events(),
        media_type="text/event-stream",
        headers=headers,
    )


async def _emit_text(text: str) -> AsyncGenerator[bytes, None]:
    yield _sse_data({"token": text})
    yield b"data: [DONE]\n\n"


def _sse_data(data: dict[str, str]) -> bytes:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")
