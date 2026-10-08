import uuid

from fastapi.testclient import TestClient

from app.main import app
from app.services.llm import OmniRouteError

client = TestClient(app)


def test_health_works_when_omniroute_is_offline(monkeypatch):
    async def offline():
        return False, 0

    monkeypatch.setattr("app.main.check_models", offline)
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "omniroute": {"available": False, "models_count": 0},
    }


def test_cors_allows_local_frontend_on_port_8081():
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:8081",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:8081"


def test_cors_allows_private_lan_frontend():
    response = client.options(
        "/health",
        headers={
            "Origin": "http://192.168.1.42:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://192.168.1.42:5173"


def test_chat_sse_contract(monkeypatch):
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


def test_chat_prompts_for_class_when_level_is_missing():
    response = client.post("/api/chat", json={"question": "What is gravity?"})

    assert response.status_code == 200
    assert "Sure! What is your class?" in response.text
    assert response.text.rstrip().endswith("data: [DONE]")


def test_chat_returns_clear_json_error_when_omniroute_is_offline(monkeypatch):
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
