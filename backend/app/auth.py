from dataclasses import dataclass
import logging
from typing import Any

import httpx
import jwt
from fastapi import HTTPException, Request
from starlette.concurrency import run_in_threadpool

from app.config import settings

logger = logging.getLogger(__name__)
_cached_jwks: dict[str, Any] | None = None


async def prefetch_jwks() -> None:
    global _cached_jwks
    if not settings.supabase_url:
        return
    jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(jwks_url)
            if resp.status_code == 200:
                _cached_jwks = resp.json()
                logger.info("Supabase JWKS prefetched and cached successfully from %s", jwks_url)
    except Exception as exc:
        logger.debug("JWKS prefetch non-fatal: %s", exc)


@dataclass
class AuthUser:
    uid: str
    email: str = ""
    email_verified: bool = False


def _verify_supabase_token_sync(token: str, secret: str, supabase_url: str) -> dict[str, Any]:
    if not secret:
        raise ValueError("Supabase JWT secret is not configured.")

    if supabase_url:
        issuer = supabase_url.rstrip("/")
    else:
        issuer = "https://supabase.co"

    return jwt.decode(
        token,
        secret,
        algorithms=["HS256"],
        audience="authenticated",
        issuer=issuer,
        options={"require": ["sub", "exp", "iat"]},
    )


async def get_current_user(request: Request) -> AuthUser:
    if hasattr(request.state, "user") and request.state.user:
        return request.state.user

    if not settings.supabase_jwt_secret:
        local_user = AuthUser(uid="local", email="local@eduai.internal", email_verified=True)
        request.state.user = local_user
        return local_user

    auth_header = request.headers.get("Authorization", "")
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    clean_token = token.strip()
    try:
        claims = await run_in_threadpool(
            _verify_supabase_token_sync,
            clean_token,
            settings.supabase_jwt_secret,
            settings.supabase_url,
        )
    except (ValueError, jwt.PyJWTError) as exc:
        logger.warning("Authentication token verification failed: %s", exc)
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or expired authentication token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except Exception as exc:
        logger.error("Unexpected error during authentication token verification: %s", exc)
        raise HTTPException(
            status_code=401,
            detail="Authentication token verification failed.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    uid = claims.get("user_id") or claims.get("sub") or ""
    if not uid:
        raise HTTPException(
            status_code=401,
            detail="Authentication token contains no user identity.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = AuthUser(
        uid=str(uid),
        email=str(claims.get("email", "")),
        email_verified=bool(claims.get("email_verified", False) or claims.get("email_verified") is True),
    )
    request.state.user = user
    return user
