# EduAI backend

FastAPI backend for the EduAI frontend. The frontend request and response
contracts are defined in `src/lib/types.ts` and API calls are centralized in
`src/lib/api.ts`. Model calls route through an OpenAI-compatible OmniRoute
gateway. Python 3.11+ is supported.

## Setup

From the repository root (PowerShell):

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Set `DATABASE_URL` to a persistent SQLite file and make sure its parent folder
exists. Tables are created at startup. `UPLOADS_DIR` is mounted at `/uploads`;
the current document pipeline processes uploads in memory and does not retain
the original files.

## OmniRoute configuration

Run OmniRoute locally using its official instructions:
<https://github.com/OmniRoute/OmniRoute>. Create an API key and configure at
least one provider/model in the gateway dashboard. Use the gateway's
OpenAI-compatible base URL, normally `http://localhost:20128/v1`.

Copy `.env.example` to `.env` and configure:

```dotenv
OMNIROUTE_BASE_URL=http://localhost:20128/v1
OMNIROUTE_API_KEY=your-local-gateway-key
MODEL_TEACHER=provider/model-for-tutoring
MODEL_PRACTICE=provider/model-for-fast-practice-generation
MODEL_REASONING=provider/model-for-code-solving-and-grading
MODEL_MULTIMODAL=provider/model-with-vision
MODEL_JSON=provider/model-with-json-output
REASONING_EFFORT_PPT=low
REASONING_EFFORT_MCQ=low
REASONING_EFFORT_FLASHCARD=low
REASONING_EFFORT_NOTES=low
REASONING_EFFORT_SPLIT=low
REASONING_EFFORT_VIVA_QUESTIONS=low
REASONING_EFFORT_MERMAID=low
REASONING_EFFORT_EVALUATION_FEEDBACK=low
REASONING_EFFORT_PRACTICE=low
REASONING_EFFORT_SOLVE=high
REASONING_EFFORT_GRADING=high
REASONING_EFFORT_CODE_DEBUG=high
LONG_CONTEXT_MAX_TOKENS=120000
MAX_CONCURRENT_LLM=4
EMBEDDINGS=none
CORS_ORIGINS=http://localhost:5173,http://localhost:8080,http://localhost:8081
DATABASE_URL=sqlite:///./eduai.db
UPLOADS_DIR=uploads
```

Model role guidance:

| Role | Use |
|---|---|
| `MODEL_TEACHER` | Chat and general tutoring |
| `MODEL_PRACTICE` | Compact practice-paper questions; defaults to `MODEL_TEACHER` |
| `MODEL_REASONING` | Solver, viva evaluation, code assistant, grading, Mermaid |
| `MODEL_MULTIMODAL` | Image/PDF scanned-page reading and book answers |
| `MODEL_JSON` | Structured extraction, generation, validation and repair |

Model reasoning strength is configured per task. Formatting and generation
tasks use `low` by default; maths solving, written-answer grading, and code
debugging use `high`. Empty task settings use the gateway default. If the
gateway explicitly rejects `reasoning_effort`, the backend logs the rejection
and retries once without the parameter.

The model IDs must exactly match IDs exposed by OmniRoute. Empty specialized
IDs fall back to `MODEL_TEACHER`. `/api/models` reports each resolved mapping
and whether the gateway lists that model; `/health` reports gateway reachability.
Never commit `.env` or send its API key to the frontend.

## Run

From the repository root:

```powershell
python -m uvicorn app.main:app --reload --app-dir backend
```

Or from `backend/`:

```powershell
python -m uvicorn app.main:app --reload
```

On Windows, prefer `python -m uvicorn` if application-control policies block
the `uvicorn` executable launcher.

The health check is `http://localhost:8000/health`; interactive API
documentation is at `http://localhost:8000/docs`.

## API examples

Examples use `http://localhost:8000`. Upload endpoints accept PDF, JPG or PNG,
with a 20 MB limit. `curl.exe` is used below for PowerShell compatibility.

```powershell
# Health and model-role diagnostics
curl.exe http://localhost:8000/health
curl.exe http://localhost:8000/api/models

# Chat returns an SSE stream ending in data: [DONE]
curl.exe -N -H "Content-Type: application/json" -d "{\"question\":\"Explain gravity\",\"level\":\"c9-10\",\"style\":\"Simple\"}" http://localhost:8000/api/chat

# Solve an uploaded exam paper (mode: teach or exam; style: Simple, Exam, Detailed)
curl.exe -F "file=@paper.pdf" -F "level=c9-10" -F "subject=Science" -F "mode=exam" -F "style=Exam" http://localhost:8000/api/solve
curl.exe -H "Content-Type: application/json" -d "{\"question\":{\"id\":\"q1\",\"n\":1,\"text\":\"Find x: 2x=8\",\"marks\":2,\"status\":\"review\",\"hints\":[\"Hint one\",\"Hint two\"],\"solution\":{\"given\":[],\"steps\":[],\"therefore\":\"\",\"answer\":\"\"}},\"text\":\"Find x: 2x=8\",\"level\":\"c9-10\",\"style\":\"Exam\"}" http://localhost:8000/api/solve/resolve
curl.exe -H "Content-Type: application/json" -d "{\"kind\":\"simpler\",\"question\":{\"id\":\"q1\",\"n\":1,\"text\":\"Find x: 2x=8\",\"marks\":2,\"status\":\"solved\",\"hints\":[\"Hint one\",\"Hint two\"],\"solution\":{\"given\":[],\"steps\":[],\"therefore\":\"\",\"answer\":\"4\"}}}" http://localhost:8000/api/solve/follow-up

# Study From My Book: upload, list, ask, generate, delete
curl.exe -F "file=@chapter.pdf" http://localhost:8000/api/docs/upload
curl.exe http://localhost:8000/api/docs
curl.exe -H "Content-Type: application/json" -d "{\"question\":\"Summarise the key idea\",\"level\":\"c9-10\"}" http://localhost:8000/api/docs/DOCUMENT_ID/ask
curl.exe -H "Content-Type: application/json" -d "{\"task\":\"notes\",\"level\":\"c9-10\"}" http://localhost:8000/api/docs/DOCUMENT_ID/generate
curl.exe -X DELETE http://localhost:8000/api/docs/DOCUMENT_ID

# Practice paper generation, grading, handwritten checking and re-evaluation
# Objective MCQs are graded in code; written answers use a Concept/Explanation/Example/Presentation rubric.
curl.exe -H "Content-Type: application/json" -d "{\"level\":\"c9-10\",\"subject\":\"Science\",\"chapter\":\"Electricity\",\"difficulty\":\"Medium\",\"totalMarks\":50,\"timeMin\":90,\"weakFocus\":[]}" http://localhost:8000/api/practice/generate
curl.exe -H "Content-Type: application/json" -d "{\"answers\":{\"q1\":\"1\"},\"timeUsedSec\":300}" http://localhost:8000/api/practice/PAPER_ID/submit
curl.exe -F "answers=@handwritten-answers.pdf" -F "paperId=PAPER_ID" http://localhost:8000/api/practice/check
curl.exe -H "Content-Type: application/json" -d "{\"answer\":\"Revised answer text\"}" http://localhost:8000/api/practice/EVALUATION_ID/re-evaluate

# Diagram and presentation generation
curl.exe -H "Content-Type: application/json" -d "{\"prompt\":\"Flowchart to check if a number is even or odd\",\"type\":\"Flowchart\",\"level\":\"c9-10\",\"forceFlowchart\":true}" http://localhost:8000/api/diagram
curl.exe -H "Content-Type: application/json" -d "{\"action\":\"refine\",\"diagram\":{\"id\":\"d1\",\"prompt\":\"Example\",\"title\":\"Example\",\"type\":\"Flowchart\",\"code\":\"flowchart TD\\nA([Start])-->B([End])\",\"explanation\":\"A flow\",\"level\":\"c9-10\",\"createdAt\":\"2026-10-07T00:00:00Z\"},\"instruction\":\"Make it simpler\",\"level\":\"c9-10\"}" http://localhost:8000/api/diagram
curl.exe -H "Content-Type: application/json" -d "{\"topic\":\"Artificial Intelligence\",\"level\":\"c9-10\",\"slides\":5,\"theme\":\"Indigo Modern\",\"speakerNotes\":true,\"includeDiagrams\":false,\"includeQuiz\":false,\"extra\":\"\"}" http://localhost:8000/api/ppt
# Post the returned topic, theme, slides and speakerNotes fields to /api/pptx to download a .pptx.
# PPTX themes: Indigo Modern, Clean White, Dark Elegant, Playful.

# Coding actions: action values are Explain, Debug, Predict Output, Give Hint,
# Generate Test Cases, Run, Interview, Generate Exercise.
curl.exe -H "Content-Type: application/json" -d "{\"action\":\"Explain\",\"code\":\"print(1 + 1)\",\"language\":\"Python\",\"level\":\"c9-10\"}" http://localhost:8000/api/code
curl.exe -H "Content-Type: application/json" -d "{\"action\":\"Run\",\"code\":\"print(input())\",\"input\":\"hello\",\"language\":\"Python\",\"level\":\"c9-10\"}" http://localhost:8000/api/code

# Viva start, answer, and final report
curl.exe -H "Content-Type: application/json" -d "{\"subject\":\"DBMS\",\"topic\":\"Normalization\",\"level\":\"grad\",\"count\":5,\"adaptive\":true}" http://localhost:8000/api/viva/start
curl.exe -H "Content-Type: application/json" -d "{\"question\":{\"id\":\"SESSION_ID::1\",\"question\":\"What is normalization?\",\"topic\":\"Normalization\",\"keywords\":[\"data\",\"redundancy\"],\"explanation\":\"It reduces duplicate data.\"},\"answer\":\"It reduces duplicate data.\",\"level\":\"grad\"}" http://localhost:8000/api/viva/answer
curl.exe -H "Content-Type: application/json" -d "{\"subject\":\"DBMS\",\"topic\":\"Normalization\",\"level\":\"grad\",\"answers\":[{\"question\":{\"id\":\"SESSION_ID::1\",\"question\":\"What is normalization?\",\"topic\":\"Normalization\",\"keywords\":[\"data\",\"redundancy\"],\"explanation\":\"It reduces duplicate data.\"},\"answer\":\"It reduces duplicate data.\",\"feedback\":{\"label\":\"Good\",\"score\":1,\"explanation\":\"Clear answer.\",\"ideal\":\"It reduces duplicate data.\"}}]}" http://localhost:8000/api/viva/report

# Progress and dashboard share the same persisted mastery aggregates
curl.exe http://localhost:8000/api/progress
curl.exe http://localhost:8000/api/dashboard
```

Python `Run` executes only Python and is labelled **“basic sandbox, not a
security boundary”**. It uses a temporary directory, a short timeout, an OS
memory limit, and Python-level network restrictions. Do not expose this
execution service to untrusted public traffic as a secure isolation boundary.
No other language is executed.

## Upload, rate-limit and logging safeguards

The service accepts only extension/MIME/signature-consistent PDF/JPG/PNG
uploads, capped at 20 MB (also enforced for multipart requests). Client
filenames are reduced to a sanitized basename; temporary execution files are
removed automatically. Expensive AI routes have an in-memory per-IP limit of
60 requests per minute. Gateway keys and document bodies are not logged.

## Troubleshooting

- **OmniRoute offline:** `/health` remains available and reports gateway
  reachability. Start OmniRoute and verify its `/v1/models` endpoint. Model
  generation returns a friendly 503 when no completion is available.
- **Rate limited:** wait one minute before retrying. The current limiter is
  in-memory and resets when the process restarts; use a shared limiter for
  multi-worker deployments.
- **Empty model IDs:** set `MODEL_TEACHER`; specialized roles default to it.
  Compare configured IDs with `/api/models` and the OmniRoute dashboard.
- **CORS errors:** add the exact frontend origin, including scheme and port, to
  the comma-separated `CORS_ORIGINS`, then restart the backend.
- **Empty document extraction:** scanned pages require a vision-capable
  `MODEL_MULTIMODAL`; Tesseract is optional fallback only and the system
  executable must be installed separately.
- **Python code execution denied/timed out:** run only short educational
  snippets. The service deliberately has strict process/time/memory limits and
  is not a secure multi-tenant sandbox.

## Tests

From the repository root:

```powershell
python -m pytest backend/tests -q
```

To manually check the configured model roles against OmniRoute, run this from
`backend/`:

```powershell
python -m scripts.check_models
```

Roles without a configured model ID are skipped.
