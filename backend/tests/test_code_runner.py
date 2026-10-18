import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.routers import code


@pytest.mark.parametrize(
    ("language", "expected_image"),
    [
        ("Java", "eclipse-temurin:21-jdk-alpine"),
        ("C", "gcc:14-bookworm"),
        ("C++", "gcc:14-bookworm"),
        ("JavaScript", "node:22-alpine"),
        ("SQL", "python:3.12-alpine"),
    ],
)
def test_docker_command_selects_a_runner_for_each_language(
    tmp_path: Path,
    language: str,
    expected_image: str,
) -> None:
    source_path = tmp_path / "student.java"
    source_path.write_text("public class Hello {}", encoding="utf-8")

    image, command = code._docker_command(language, source_path)

    assert image == expected_image
    assert command


def test_docker_runner_applies_isolation_limits_and_cleans_up(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class FakeProcess:
        returncode = 0

        def __init__(self, args, **_kwargs):
            captured["args"] = args

        def communicate(self, _stdin, timeout):
            captured["timeout"] = timeout
            args = captured["args"]
            cid_path = Path(args[args.index("--cidfile") + 1])
            cid_path.write_text("test-container-id", encoding="utf-8")
            return "hello\n", ""

        def kill(self) -> None:
            raise AssertionError("The test process should not time out.")

    cleanup_calls: list[list[str]] = []
    monkeypatch.setattr(code.shutil, "which", lambda _name: "docker")
    monkeypatch.setattr(code.subprocess, "Popen", FakeProcess)
    monkeypatch.setattr(
        code.subprocess,
        "run",
        lambda args, **_kwargs: (
            cleanup_calls.append(args) or SimpleNamespace(returncode=0, stderr="")
        ),
    )

    output, return_code = code._run_docker_code("JavaScript", "console.log('hello')")

    args = captured["args"]
    assert output == "hello\n"
    assert return_code == 0
    assert captured["timeout"] == 15
    assert "--interactive" in args
    assert args[args.index("--network") + 1] == "none"
    assert "--read-only" in args
    assert args[args.index("--cap-drop") + 1] == "ALL"
    assert args[args.index("--memory") + 1] == "256m"
    tmpfs_args = [
        args[index + 1] for index, value in enumerate(args) if value == "--tmpfs"
    ]
    assert any(value.startswith("/work:rw,nosuid,nodev,exec") for value in tmpfs_args)
    assert cleanup_calls == [["docker", "rm", "--force", "test-container-id"]]


def test_html_css_run_returns_sandboxed_preview_without_docker() -> None:
    result = asyncio.run(
        code.code_action(
            code.CodeRequest(
                action="Run",
                code="<h1>Safe preview</h1>",
                language="HTML/CSS",
                level="c9-10",
            )
        )
    )

    assert result.preview is not None
    assert "Content-Security-Policy" in result.preview
    assert "<h1>Safe preview</h1>" in result.preview


def test_run_action_passes_selected_language_to_container_runner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, str, str]] = []

    def fake_runner(language: str, source: str, stdin: str) -> tuple[str, int]:
        calls.append((language, source, stdin))
        return "JAVA_OK", 0

    monkeypatch.setattr(code, "_run_docker_code", fake_runner)
    result = asyncio.run(
        code.code_action(
            code.CodeRequest(
                action="Run",
                code="class Main {}",
                language="Java",
                level="c9-10",
                input="test input",
            )
        )
    )

    assert calls == [("Java", "class Main {}", "test input")]
    assert result.output == "JAVA_OK\nProcess finished"
