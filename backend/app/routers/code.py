import asyncio
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.schemas import LevelId
from app.services.llm import OmniRouteError, chat, json_call

router = APIRouter(prefix="/api", tags=["code"])
CodeLanguage = Literal["Python", "Java", "C", "C++", "JavaScript", "SQL", "HTML/CSS"]
CodeAction = Literal[
    "Explain",
    "Debug",
    "Predict Output",
    "Give Hint",
    "Generate Test Cases",
    "Run",
    "Interview",
    "Generate Exercise",
]
Difficulty = Literal["Easy", "Medium", "Hard"]


class CodeRequest(BaseModel):
    action: CodeAction
    code: str = Field(default="", max_length=64_000)
    language: CodeLanguage = "Python"
    level: LevelId
    topic: str | None = Field(default=None, max_length=200)
    difficulty: Difficulty | None = None
    hintIndex: int | None = Field(default=None, ge=0, le=2)
    input: str | None = Field(default=None, max_length=20_000)


class TestCase(BaseModel):
    input: str
    expected: str
    actual: str
    passed: bool


class TestCaseSet(BaseModel):
    markdown: str
    tests: list[TestCase]


class CodeExercise(BaseModel):
    id: str
    title: str
    topic: str
    difficulty: Difficulty
    statement: str
    examples: list[dict[str, str]]
    starter: dict[str, str]
    solution: str
    expectedOutput: str
    hints: list[str]


class ExerciseResult(BaseModel):
    markdown: str
    exercise: CodeExercise


class CodeResult(BaseModel):
    markdown: str
    output: str | None = None
    preview: str | None = None
    tests: list[TestCase] | None = None
    hints: list[str] | None = None
    exercise: CodeExercise | None = None


_RUNNER = r'''
import builtins, socket, sys

def deny_network(*args, **kwargs):
    raise PermissionError("Network access is disabled in the basic sandbox.")

socket.socket = deny_network
socket.create_connection = deny_network
socket.getaddrinfo = deny_network
socket.gethostbyname = deny_network
socket._socket = None
def deny_audit_event(event, args):
    if event.startswith("socket.") or event.startswith("subprocess.") or event in {
        "os.system", "os.exec", "os.spawn", "ctypes.dlopen"
    }:
        raise PermissionError("This operation is unavailable in the basic sandbox.")
sys.addaudithook(deny_audit_event)
original_import = builtins.__import__
blocked = {"_socket", "socket", "subprocess", "ctypes", "urllib", "http", "ftplib", "os", "pathlib", "multiprocessing"}
def restricted_import(name, *args, **kwargs):
    if name.split(".", 1)[0] in blocked:
        raise ImportError("This module is unavailable in the basic sandbox.")
    return original_import(name, *args, **kwargs)
builtins.__import__ = restricted_import
filename = sys.argv[1]
with open(filename, "r", encoding="utf-8") as source_file:
    source = source_file.read()
exec(compile(source, filename, "exec"), {"__name__": "__main__", "__file__": filename})
'''


def _posix_limits() -> None:
    import resource

    memory_bytes = 128 * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
    resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
    resource.setrlimit(resource.RLIMIT_FSIZE, (2 * 1024 * 1024, 2 * 1024 * 1024))


def _apply_windows_memory_limit(process: subprocess.Popen[str]) -> None:
    import ctypes
    from ctypes import wintypes

    class BasicLimit(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_longlong),
            ("PerJobUserTimeLimit", ctypes.c_longlong),
            ("LimitFlags", wintypes.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", wintypes.DWORD),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", wintypes.DWORD),
            ("SchedulingClass", wintypes.DWORD),
        ]

    class IoCounters(ctypes.Structure):
        _fields_ = [(name, ctypes.c_ulonglong) for name in (
            "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
            "ReadTransferCount", "WriteTransferCount", "OtherTransferCount"
        )]

    class ExtendedLimit(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", BasicLimit),
            ("IoInfo", IoCounters),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    create_job = kernel32.CreateJobObjectW
    create_job.restype = wintypes.HANDLE
    kernel32.SetInformationJobObject.argtypes = [
        wintypes.HANDLE,
        wintypes.INT,
        wintypes.LPVOID,
        wintypes.DWORD,
    ]
    kernel32.SetInformationJobObject.restype = wintypes.BOOL
    kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel32.AssignProcessToJobObject.restype = wintypes.BOOL
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL
    job = create_job(None, None)
    if not job:
        raise OSError(ctypes.get_last_error(), "Could not create a sandbox memory job.")
    info = ExtendedLimit()
    info.BasicLimitInformation.LimitFlags = 0x100  # JOB_OBJECT_LIMIT_PROCESS_MEMORY
    info.ProcessMemoryLimit = 128 * 1024 * 1024
    try:
        if not kernel32.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info)):
            raise OSError(ctypes.get_last_error(), "Could not set the sandbox memory limit.")
        if not kernel32.AssignProcessToJobObject(job, wintypes.HANDLE(int(process._handle))):
            raise OSError(ctypes.get_last_error(), "Could not apply the sandbox memory limit.")
    except Exception:
        process.kill()
        raise
    finally:
        kernel32.CloseHandle(job)


def run_python(code: str, stdin: str = "") -> tuple[str, int]:
    """Run short Python snippets with time/memory limits and a temporary working directory."""
    with tempfile.TemporaryDirectory(prefix="eduai-code-") as temp_dir:
        folder = Path(temp_dir)
        source_path = folder / "student_code.py"
        runner_path = folder / "runner.py"
        source_path.write_text(code, encoding="utf-8")
        runner_path.write_text(_RUNNER, encoding="utf-8")
        env = {
            "PYTHONIOENCODING": "utf-8",
            "PYTHONNOUSERSITE": "1",
            "PATH": os.environ.get("PATH", ""),
        }
        if os.name == "nt":
            env["SystemRoot"] = os.environ.get("SystemRoot", "")
        process = subprocess.Popen(
            [sys.executable, "-I", "-S", str(runner_path), str(source_path)],
            cwd=temp_dir,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            start_new_session=os.name != "nt",
            preexec_fn=_posix_limits if os.name != "nt" else None,
        )
        try:
            if os.name == "nt":
                _apply_windows_memory_limit(process)
            stdout, stderr = process.communicate(stdin, timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate()
            raise TimeoutError("Execution exceeded the 5-second time limit.") from None
        output = stdout
        if stderr:
            output += ("\n" if output else "") + stderr
        if len(output) > 20_000:
            output = output[:20_000] + "\n[output truncated]"
        return output, int(process.returncode or 0)


def _docker_command(language: str, source_path: Path) -> tuple[str, list[str]]:
    container_source = "/input/" + source_path.name
    if language == "Java":
        source = source_path.read_text(encoding="utf-8")
        class_match = re.search(
            r"\bpublic\s+(?:(?:abstract|final|sealed|non-sealed)\s+)*class\s+([A-Za-z_$][\w$]*)",
            source,
        )
        class_name = class_match.group(1) if class_match else "Main"
        quoted_class_name = f"'{class_name}'"
        container_source = f"'/input/{class_name}.java'"
        return (
            "eclipse-temurin:21-jdk-alpine",
            [
                "sh",
                "-c",
                f"cp {container_source} /work/{quoted_class_name}.java && "
                f"javac /work/{quoted_class_name}.java && "
                f"java -cp /work {quoted_class_name}",
            ],
        )
    if language == "C":
        return (
            "gcc:14-bookworm",
            ["sh", "-c", f"cp {container_source} /work/main.c && gcc -O2 -std=c17 /work/main.c -o /work/main && /work/main"],
        )
    if language == "C++":
        return (
            "gcc:14-bookworm",
            ["sh", "-c", f"cp {container_source} /work/main.cpp && g++ -O2 -std=c++20 /work/main.cpp -o /work/main && /work/main"],
        )
    if language == "JavaScript":
        return "node:22-alpine", ["node", container_source]
    if language == "SQL":
        sql_runner = """import sqlite3, sys
db = sqlite3.connect(":memory:")
denied = {
    sqlite3.SQLITE_ATTACH,
    sqlite3.SQLITE_DETACH,
    sqlite3.SQLITE_PRAGMA,
    sqlite3.SQLITE_CREATE_VTABLE,
}
db.set_authorizer(
    lambda action, *args: sqlite3.SQLITE_DENY
    if action in denied
    else sqlite3.SQLITE_OK
)
seed = sys.stdin.read()
if seed.strip():
    db.executescript(seed)
sql = open(sys.argv[1], encoding="utf-8").read()
def run_statement(statement):
    cursor = db.execute(statement)
    if cursor.description:
        for row in cursor.fetchmany(500):
            print("\\t".join("" if value is None else str(value) for value in row))
buffer = ""
for character in sql:
    buffer += character
    if character == ";" and sqlite3.complete_statement(buffer):
        if buffer.strip():
            run_statement(buffer)
        buffer = ""
if buffer.strip():
    run_statement(buffer)
"""
        return (
            "python:3.12-alpine",
            [
                "python",
                "-c",
                sql_runner,
                container_source,
            ],
        )
    raise ValueError(f"Execution is not configured for {language}.")


def _run_docker_code(
    language: str,
    code: str,
    stdin: str = "",
) -> tuple[str, int]:
    docker_path = shutil.which("docker")
    if docker_path is None:
        raise OSError("Docker is not installed or is not available on PATH.")

    suffix = {
        "Java": ".java",
        "C": ".c",
        "C++": ".cpp",
        "JavaScript": ".js",
        "SQL": ".sql",
    }[language]
    with tempfile.TemporaryDirectory(prefix="eduai-code-") as temp_dir:
        folder = Path(temp_dir)
        if language == "Java":
            public_class = re.search(
                r"\bpublic\s+(?:(?:abstract|final|sealed|non-sealed)\s+)*class\s+([A-Za-z_$][\w$]*)",
                code,
            )
            source_name = f"{public_class.group(1) if public_class else 'Main'}.java"
        else:
            source_name = f"student{suffix}"
        source_path = folder / source_name
        source_path.write_text(code, encoding="utf-8")
        image, command = _docker_command(language, source_path)
        cid_path = folder / "container.cid"
        docker_args = [
            docker_path,
            "run",
            "--interactive",
            "--cidfile",
            str(cid_path),
            "--network",
            "none",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges:true",
            "--pids-limit",
            "32",
            "--memory",
            "256m",
            "--cpus",
            "1",
            "--user",
            "65534:65534",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,size=64m,uid=65534,gid=65534",
            "--tmpfs",
            "/work:rw,nosuid,nodev,exec,size=64m,uid=65534,gid=65534",
            "--mount",
            f"type=bind,source={folder},target=/input,readonly",
            "--workdir",
            "/work",
            image,
            *command,
        ]
        process = subprocess.Popen(
            docker_args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        try:
            stdout, stderr = process.communicate(stdin, timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate()
            raise TimeoutError("Execution exceeded the 15-second time limit.") from None
        finally:
            if cid_path.exists():
                container_id = cid_path.read_text(encoding="utf-8").strip()
                if container_id:
                    try:
                        cleanup = subprocess.run(
                            [docker_path, "rm", "--force", container_id],
                            capture_output=True,
                            text=True,
                            timeout=5,
                            check=False,
                        )
                    except (OSError, subprocess.TimeoutExpired) as error:
                        raise OSError(
                            "Docker could not confirm sandbox cleanup."
                        ) from error
                    if cleanup.returncode != 0:
                        raise OSError(
                            "Docker could not confirm sandbox cleanup: "
                            f"{cleanup.stderr.strip()[:200]}"
                        )
        output = stdout
        if stderr:
            output += ("\n" if output else "") + stderr
        if len(output) > 20_000:
            output = output[:20_000] + "\n[output truncated]"
        if process.returncode == 125:
            raise OSError(output.strip() or "Docker could not start the language runner.")
        return output, int(process.returncode or 0)


def _html_preview(code: str) -> str:
    csp = (
        "<meta http-equiv=\"Content-Security-Policy\" "
        "content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; "
        "font-src data:; form-action 'none'; base-uri 'none'; object-src 'none';\">"
    )
    if re.search(r"<[A-Za-z][^>]*>", code):
        return f"<!doctype html><html><head>{csp}</head><body>{code}</body></html>"
    return (
        f"<!doctype html><html><head>{csp}<style>{code}</style></head>"
        "<body><main class=\"eduai-preview\">HTML/CSS preview</main></body></html>"
    )


def _system_instruction(payload: CodeRequest) -> str:
    level_text = (
        "Use simple language and one small example."
        if payload.level in {"c1-5", "c6-8"}
        else "Use precise technical language appropriate for the learner."
    )
    action_instruction = {
        "Explain": "Explain the code's intent and execution in clear steps.",
        "Debug": "Find the most important bug, explain why it occurs, and show corrected code.",
        "Predict Output": "Predict the exact output and explain the execution.",
        "Interview": "Review code quality, time/space complexity, and edge cases like an interviewer.",
        "Give Hint": "Produce three progressively revealing hints; return only the hint at the requested level.",
    }.get(payload.action, "Help the learner understand this code.")
    return (
        f"{action_instruction} {level_text} Language: {payload.language}. "
        f"Topic: {payload.topic or 'unspecified'}."
    )


@router.post("/code", response_model=CodeResult, response_model_exclude_none=True)
async def code_action(payload: CodeRequest):
    if payload.action == "Run":
        if payload.language == "HTML/CSS":
            return CodeResult(
                markdown="HTML/CSS preview is isolated from the app.",
                preview=_html_preview(payload.code),
            )
        try:
            if payload.language == "Python":
                output, return_code = await asyncio.to_thread(
                    run_python, payload.code, payload.input or ""
                )
            else:
                output, return_code = await asyncio.to_thread(
                    _run_docker_code,
                    payload.language,
                    payload.code,
                    payload.input or "",
                )
        except TimeoutError as error:
            output, return_code = str(error), 124
        except OSError as error:
            raise HTTPException(
                status_code=503,
                detail=f"The isolated {payload.language} runner could not start: {error}",
            ) from error
        status = "Process finished" if return_code == 0 else f"Process exited with code {return_code}"
        return CodeResult(
            markdown="Code runs in a restricted local sandbox. Do not submit sensitive code.",
            output=f"{output.rstrip()}\n{status}".strip(),
        )

    code_prompt = f"Action: {payload.action}\nCode:\n```{payload.language.lower()}\n{payload.code}\n```"
    if payload.input:
        code_prompt += f"\nInput:\n{payload.input}"
    if payload.action == "Give Hint":
        index = payload.hintIndex or 0
        code_prompt += f"\nReturn only progressive hint number {index + 1} of 3; avoid revealing later hints."
    try:
        if payload.action == "Generate Test Cases":
            result = await json_call(
                [
                    {"role": "system", "content": _system_instruction(payload) + " Return 4-8 meaningful test cases with input, expected, actual and passed, plus concise markdown."},
                    {"role": "user", "content": code_prompt},
                ],
                TestCaseSet,
                task="json",
            )
            return CodeResult(markdown=result.markdown, tests=result.tests)
        if payload.action == "Generate Exercise":
            result = await json_call(
                [
                    {"role": "system", "content": "Generate a complete coding exercise. Return the requested CodeExercise JSON fields: id, title, topic, difficulty, statement, examples, starter, solution, expectedOutput, hints. Include exactly 3 progressive hints."},
                    {"role": "user", "content": f"Topic: {payload.topic or 'loops'}\nDifficulty: {payload.difficulty or 'Easy'}\nLevel: {payload.level}\nLanguage: {payload.language}"},
                ],
                ExerciseResult,
                task="json",
            )
            return CodeResult(markdown=result.markdown, exercise=result.exercise)
        response = await chat(
            [
                {"role": "system", "content": _system_instruction(payload)},
                {"role": "user", "content": code_prompt},
            ],
            task="code_debug" if payload.action == "Debug" else "reasoning",
            temperature=0.2,
        )
    except OmniRouteError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    hints = [response.strip()] if payload.action == "Give Hint" else None
    return CodeResult(markdown=response, hints=hints)
