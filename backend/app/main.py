import asyncio
import json
import logging
import time
import uuid
from contextvars import ContextVar
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.encoders import jsonable_encoder
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi import HTTPException

from app.config import settings
from app.database import Base, engine
from app.routers.chat import router as chat_router
from app.routers.docs import router as docs_router
from app.routers.solve import router as solve_router
from app.routers.viva import router as viva_router
from app.routers.code import router as code_router
from app.routers.progress import router as progress_router
from app.routers.practice import router as practice_router
from app.routers.diagram import router as diagram_router
from app.routers.ppt import router as ppt_router
from app.security import MAX_UPLOAD_BYTES, enforce_rate_limit
from app.services.llm import check_models, list_models, model_for, probe_model
import app.models  # noqa: F401 - registers SQLAlchemy models before create_all


request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(
            {
                "timestamp": self.formatTime(record),
                "level": record.levelname,
                "logger": record.name,
                "request_id": request_id_var.get(),
                "message": record.getMessage(),
            },
            ensure_ascii=False,
        )


handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
logger = logging.getLogger("eduai")

Base.metadata.create_all(bind=engine)
app = FastAPI(title="EduAI Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    token = request_id_var.set(request_id)
    request.state.request_id = request_id
    started = time.perf_counter()
    try:
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdecimal() and int(content_length) > MAX_UPLOAD_BYTES + 1024 * 1024:
            return JSONResponse(
                status_code=413,
                content={"error": "Upload too large", "detail": "Uploads must be 20 MB or smaller."},
            )
        try:
            enforce_rate_limit(request)
        except HTTPException as error:
            return JSONResponse(
                status_code=error.status_code,
                content={"error": "Rate limit exceeded", "detail": str(error.detail)},
                headers=error.headers,
            )
        response = await call_next(request)
    except Exception as error:
        logger.error(
            "Unhandled request failure request_id=%s exception_type=%s",
            request_id,
            type(error).__name__,
        )
        raise
    finally:
        request_id_var.reset(token)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request complete method=%s path=%s status=%s duration_ms=%.2f",
        request.method,
        request.url.path,
        response.status_code,
        (time.perf_counter() - started) * 1000,
    )
    return response


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": detail, "detail": detail},
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": "Invalid request",
            "detail": jsonable_encoder(exc.errors()),
        },
    )


@app.exception_handler(Exception)
async def unexpected_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled application exception request_id=%s exception_type=%s",
        request.state.request_id,
        type(exc).__name__,
    )
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": "The server could not complete the request."},
    )


@app.get("/health")
async def health():
    available, model_count = await check_models()
    return {
        "status": "ok",
        "omniroute": {"available": available, "models_count": model_count},
    }


@app.get("/api/models")
async def models():
    reachable, available_models = await list_models()
    available = set(available_models)
    roles = ("teacher", "reasoning", "multimodal", "json")
    resolved = {role: model_for(role) for role in roles}
    unique_models = list(dict.fromkeys(model for model in resolved.values() if model))
    probe_results = (
        await asyncio.gather(*(probe_model(model) for model in unique_models))
        if reachable
        else []
    )
    responsive = dict(zip(unique_models, probe_results, strict=True))
    return {
        "models": [
            {
                "role": role,
                "model": resolved[role],
                "configured": bool(resolved[role]),
                "responds": bool(
                    reachable
                    and resolved[role] in available
                    and responsive.get(resolved[role], False)
                ),
            }
            for role in roles
        ],
        "gatewayReachable": reachable,
    }


app.include_router(chat_router)
app.include_router(solve_router)
app.include_router(docs_router)
app.include_router(viva_router)
app.include_router(code_router)
app.include_router(progress_router)
app.include_router(practice_router)
app.include_router(diagram_router)
app.include_router(ppt_router)

uploads_path = Path(settings.uploads_dir)
uploads_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_path), name="uploads")
