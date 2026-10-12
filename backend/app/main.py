import asyncio
import json
import logging
import time
import uuid
from contextvars import ContextVar
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.encoders import jsonable_encoder
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from contextlib import asynccontextmanager

from app.auth import AuthUser, get_current_user, prefetch_jwks
from app.database import Base, engine, run_sqlite_migrations
from app.routers.chat import router as chat_router
from app.routers.docs import router as docs_router
from app.routers.solve import router as solve_router
from app.routers.viva import router as viva_router
from app.routers.code import router as code_router
from app.routers.progress import router as progress_router
from app.routers.practice import router as practice_router
from app.routers.diagram import router as diagram_router
from app.routers.ppt import router as ppt_router
from app.routers.todos import router as todos_router
from app.security import MAX_UPLOAD_BYTES, enforce_rate_limit
from app.services.llm import (
    OmniRouteError,
    check_models,
    list_models,
    model_chain_for,
    model_for,
    model_health,
    probe_model,
    _refresh_model_registry,
    reset_request_model_callback,
    set_request_model_callback,
    validate_configured_model_roles,
    warmup_primary_model,
)
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
run_sqlite_migrations(engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await validate_configured_model_roles()
    asyncio.create_task(warmup_primary_model())
    asyncio.create_task(prefetch_jwks())
    yield


app = FastAPI(title="EduAI Backend", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Model-Used", "X-Model-Requested", "X-Model-Fallback", "X-Request-ID"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    token = request_id_var.set(request_id)
    request.state.request_id = request_id
    started = time.perf_counter()
    model_callback_token = set_request_model_callback(
        lambda model: setattr(request.state, "model_used", model)
    )
    try:
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdecimal() and int(content_length) > MAX_UPLOAD_BYTES + 1024 * 1024:
            return JSONResponse(
                status_code=413,
                content={"error": "Upload too large", "detail": "Uploads must be 20 MB or smaller."},
            )
        if (
            not settings.supabase_jwt_secret
            and settings.app_access_token
            and request.url.path.startswith("/api/")
            and request.method != "OPTIONS"
            and request.url.path != "/health"
        ):
            auth_header = request.headers.get("Authorization", "")
            scheme, _, bearer_token = auth_header.partition(" ")
            if scheme.lower() != "bearer" or bearer_token.strip() != settings.app_access_token:
                return JSONResponse(
                    status_code=401,
                    content={"error": "Unauthorized", "detail": "Invalid or missing access token."},
                    headers={"WWW-Authenticate": "Bearer"},
                )
        if settings.supabase_jwt_secret and request.headers.get("Authorization"):
            try:
                await get_current_user(request)
            except HTTPException:
                pass
        try:
            enforce_rate_limit(request)
        except HTTPException as error:
            return JSONResponse(
                status_code=error.status_code,
                content={"error": "Rate limit exceeded", "detail": str(error.detail)},
                headers=error.headers,
            )
        response = await call_next(request)
        model_used = getattr(request.state, "model_used", None)
        if model_used and "X-Model-Used" not in response.headers:
            response.headers["X-Model-Used"] = model_used
        model_requested = getattr(request.state, "model_requested", None)
        if model_requested and "X-Model-Requested" not in response.headers:
            response.headers["X-Model-Requested"] = model_requested
        model_fallback = getattr(request.state, "model_fallback", None)
        if model_fallback and "X-Model-Fallback" not in response.headers:
            response.headers["X-Model-Fallback"] = model_fallback
    except Exception as error:
        logger.error(
            "Unhandled request failure request_id=%s exception_type=%s",
            request_id,
            type(error).__name__,
        )
        raise
    finally:
        reset_request_model_callback(model_callback_token)
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
    available, reason = await check_models()
    gateway_url = urlsplit(settings.omniroute_base_url)
    safe_netloc = gateway_url.netloc.rsplit("@", 1)[-1]
    safe_base_url = urlunsplit(
        (gateway_url.scheme, safe_netloc, gateway_url.path, "", "")
    )
    return {
        "status": "ok",
        "omniroute": {
            "available": available,
            "base_url": safe_base_url,
            "reason": reason,
        },
    }


@app.get("/health/gateway")
async def gateway_health():
    available, reason = await check_models()
    return {
        "status": "ok" if available else "offline",
        "reason": reason,
    }


api_dependencies = [Depends(get_current_user)]


@app.get("/api/me")
async def get_me(user: AuthUser = Depends(get_current_user)):
    return {
        "uid": user.uid,
        "email": user.email,
        "email_verified": user.email_verified,
    }


@app.get("/api/models", dependencies=api_dependencies)
async def models():
    try:
        await _refresh_model_registry()
    except OmniRouteError:
        # Registry refresh logs the failure and clears all verified-free models.
        pass
    reachable, available_models = await list_models()
    available = set(available_models)
    roles = ("teacher", "practice", "reasoning", "multimodal", "json")
    resolved = {role: model_for(role) for role in roles}
    chains = {role: model_chain_for(role) for role in roles}
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
                "chain": [
                    {
                        "model": model,
                        "available": reachable and model in available,
                        **model_health(model),
                    }
                    for model in chains[role]
                ],
            }
            for role in roles
        ],
        "gatewayReachable": reachable,
    }


app.include_router(chat_router, dependencies=api_dependencies)
app.include_router(solve_router, dependencies=api_dependencies)
app.include_router(docs_router, dependencies=api_dependencies)
app.include_router(viva_router, dependencies=api_dependencies)
app.include_router(code_router, dependencies=api_dependencies)
app.include_router(progress_router, dependencies=api_dependencies)
app.include_router(practice_router, dependencies=api_dependencies)
app.include_router(diagram_router, dependencies=api_dependencies)
app.include_router(ppt_router, dependencies=api_dependencies)
app.include_router(todos_router, dependencies=api_dependencies)

uploads_path = Path(settings.uploads_dir)
uploads_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_path), name="uploads")
