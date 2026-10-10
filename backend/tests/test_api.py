import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.main import app
from app.services.llm import OmniRouteError


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_db():
        session = test_session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


def test_health_works_when_omniroute_is_offline(client, monkeypatch):
    async def offline():
        return False, []

    monkeypatch.setattr("app.main.list_models", offline)
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "omniroute": {"available": False, "models_count": 0},
    }


def test_cors_allows_local_frontend_on_port_8081(client):
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:8081",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:8081"


def test_cors_allows_private_lan_frontend(client):
    response = client.options(
        "/health",
        headers={
            "Origin": "http://192.168.1.42:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://192.168.1.42:5173"


def test_chat_sse_contract(client, monkeypatch):
    async def fake_stream(messages, task="teacher", temperature=0.4):
        yield "A useful "
        yield "answer."

    monkeypatch.setattr("app.routers.chat.stream", fake_stream)
    response = client.post(
        "/api/chat",
        json={
            "question": "What is gravity?",
            "level": "c1-5",
            "style": "Simple",
            "subject": "Science",
            "session_id": f"test-{uuid.uuid4()}",
        },
    )

    assert response.status_code == 200
    assert 'data: {"token": "A useful "}' in response.text
    assert 'data: {"token": "answer."}' in response.text
    assert response.text.rstrip().endswith("data: [DONE]")


def test_chat_prompts_for_class_when_level_is_missing(client):
    response = client.post("/api/chat", json={"question": "What is gravity?"})

    assert response.status_code == 200
    assert "Sure! What is your class?" in response.text
    assert response.text.rstrip().endswith("data: [DONE]")


def test_chat_returns_clear_json_error_when_omniroute_is_offline(client, monkeypatch):
    async def offline_stream(messages, task="teacher", temperature=0.4):
        raise OmniRouteError("OmniRoute is not running or the API key is invalid")
        yield ""

    monkeypatch.setattr("app.routers.chat.stream", offline_stream)
    response = client.post(
        "/api/chat",
        json={"question": "Explain gravity", "level": "c9-10", "style": "Simple"},
    )

    assert response.status_code == 503
    assert response.json() == {
        "error": "OmniRoute is not running or the API key is invalid",
        "detail": "OmniRoute is not running or the API key is invalid",
    }


def test_health_reports_available_models(client, monkeypatch):
    async def online():
        return True, ["model-a", "model-b"]

    monkeypatch.setattr("app.main.list_models", online)
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "omniroute": {"available": True, "models_count": 2},
    }


def test_app_access_token_enforcement(client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "app_access_token", "secret123")

    async def fake_models():
        return True, ["test-model"]

    monkeypatch.setattr("app.main.list_models", fake_models)

    # Health check should not require token
    health_resp = client.get("/health")
    assert health_resp.status_code == 200

    # OPTIONS should not require token
    options_resp = client.options("/api/models")
    assert options_resp.status_code in {200, 405}

    # /api/* without token returns 401
    unauth_resp = client.get("/api/models")
    assert unauth_resp.status_code == 401
    assert unauth_resp.json()["detail"] == "Invalid or missing access token."

    # /api/* with wrong token returns 401
    wrong_resp = client.get("/api/models", headers={"Authorization": "Bearer wrong"})
    assert wrong_resp.status_code == 401

    # /api/* with correct token succeeds
    auth_resp = client.get("/api/models", headers={"Authorization": "Bearer secret123"})
    assert auth_resp.status_code == 200


def test_rate_limiter_trust_proxy_headers(client, monkeypatch):
    from app.config import settings
    from app.security import enforce_rate_limit, _requests
    from fastapi import Request
    from starlette.datastructures import Headers

    _requests.clear()
    monkeypatch.setattr(settings, "trust_proxy_headers", True)

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/chat",
        "headers": [(b"x-forwarded-for", b"203.0.113.50, 10.0.0.1")],
        "client": ("127.0.0.1", 12345),
    }
    req = Request(scope)
    enforce_rate_limit(req)
    assert "203.0.113.50" in _requests
    assert "127.0.0.1" not in _requests

    _requests.clear()
    monkeypatch.setattr(settings, "trust_proxy_headers", False)
    enforce_rate_limit(req)
    assert "127.0.0.1" in _requests
