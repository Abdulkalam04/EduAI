# EduAI backend

FastAPI backend for the EduAI frontend. The frontend request and response
contracts are defined in `src/lib/types.ts` and API calls are centralized in
`src/lib/api.ts`. AI requests route through OmniRoute, with Mistral first for
text tasks and Gemini first for multimodal tasks. Python 3.11+ is supported.

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
the document pipeline extracts uploads in memory, saves extracted page text
and generated study results in the configured database, and does not retain
the original files. Successfully solved question papers are saved with their
solutions in the configured database and can be reopened from the Solver
history; uploaded source files are not stored.

## OmniRoute configuration

Run OmniRoute locally using its official instructions:
<https://github.com/OmniRoute/OmniRoute>. Create an API key and configure at
least one provider/model in the gateway dashboard. Use the gateway's
OpenAI-compatible base URL, normally `http://localhost:20128/v1`.

Copy `.env.example` to `.env` and configure:

```dotenv
OMNIROUTE_BASE_URL=http://localhost:20128/v1
OMNIROUTE_API_KEY=your-local-gateway-key
FREE_PROVIDERS=gemini,groq,mistral
MODEL_TEACHER=mistral/mistral-medium-3-5
MODEL_PRACTICE=mistral/mistral-medium-3-5
MODEL_REASONING=mistral/mistral-large-latest
MODEL_MULTIMODAL=gemini/gemini-3-flash-preview
MODEL_JSON=mistral/mistral-small-latest
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
CORS_ORIGINS=http://localhost:8082,http://localhost,https://localhost
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
debugging use `high`. Empty task settings use the gateway default. If a model
explicitly rejects `reasoning_effort`, that model is remembered for the process
lifetime and subsequent requests omit the parameter.

The model IDs in `MODEL_<ROLE>_FALLBACKS` must exactly match IDs exposed by
OmniRoute; each value is an ordered, comma-separated list. The role-specific
primary and fallback model IDs are configurable in `.env`; routing preserves
that order. Add a provider in the OmniRoute dashboard, confirm its model IDs
appear in the gateway model catalogue, add its provider prefix to
`FREE_PROVIDERS`, then place those model IDs in the appropriate `MODEL_<ROLE>`
and `MODEL_<ROLE>_FALLBACKS` settings. No application code change or provider
API key in this app's `.env` is needed. A provider is trusted only when listed
in `FREE_PROVIDERS`, and any model with positive listed pricing remains refused.

Hedging is disabled by default (`CHAT_HEDGE_AFTER_MS=0`) to avoid duplicate
requests; it is never used for reasoning, solve, grading, code-debug, viva,
Mermaid, PPT, or notes tasks. Catalogue health probes are cached per model for
15 minutes and are skipped for models with recent successful traffic or an
active cooldown. OmniRoute's `/models` list is cached for five minutes.
First-token timeouts default to 10 seconds for chat, 20 seconds for JSON, and
30 seconds for reasoning/multimodal work; override them with
`CHAT_FIRST_TOKEN_TIMEOUT`, `JSON_FIRST_TOKEN_TIMEOUT`, and
`REASONING_FIRST_TOKEN_TIMEOUT`. Timeouts do not cool down models; 429 and 5xx
responses do, honoring `Retry-After` when present.

Local rolling budgets default to 10 Gemini requests/minute, 20 Groq
requests/minute, and 5,000 Groq prompt tokens/minute. Mistral defaults to a
local cap of 50 requests/minute and 400,000 prompt tokens/minute, with at least
one second between requests to each Mistral model. Configure
`PROVIDER_RPM_GEMINI`, `PROVIDER_RPM_GROQ`, `PROVIDER_TPM_GROQ`,
`PROVIDER_RPM_MISTRAL`, and `PROVIDER_TPM_MISTRAL` to adjust local budgets; a
budget wait is capped at five seconds before trying the next provider. Prompts
above 6,000 estimated tokens skip Groq. Document Q&A already retrieves
relevant pages from large books, and solve-paper separates extracted questions;
requests exceeding `LONG_CONTEXT_MAX_TOKENS` receive HTTP 413 with guidance to
shorten or split the input.

A 429 or 413 moves immediately to the next model. Other retryable transient
failures may retry the current model before falling through. Models returning
429 or 5xx are skipped during a cooldown (60 seconds by default, or
`Retry-After`, capped at 10 minutes); a successful request clears that model's
cooldown. Streaming can switch models only before sending its first text token.

`/api/models` reports each role's ordered chain and per-model cooldown and last
success state. `/health` uses the cached `/v1/models` check (5-second timeout,
15-second cache) or a successful completion in the last 120 seconds.
Successful completion responses include `X-Model-Used`; chat messages can show
that model when the Learning setting is enabled. `npm run check:models` probes
every configured model in each chain. Never commit `.env` or send its API key
to the frontend.

Free provider quotas, model availability, and account access can change.
Confirm current limits in each provider dashboard before choosing concurrency
or long-context settings; the account-specific quotas cannot be inferred from
the public model list.

## Run

From the repository root:

```powershell
python -m uvicorn app.main:app --reload --app-dir backend --port 8010
```

Or from `backend/`:

```powershell
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8010
```

On Windows, prefer `python -m uvicorn` if application-control policies block
the `uvicorn` executable launcher.

The health check is `http://localhost:8010/health`; interactive API
documentation is at `http://localhost:8010/docs`.

## API examples

Examples use `http://localhost:8010`. Upload endpoints accept PDF, JPG or PNG,
with a 20 MB limit. `curl.exe` is used below for PowerShell compatibility.

```powershell
# Health and model-role diagnostics
curl.exe http://localhost:8010/health
curl.exe http://localhost:8010/api/models

# Chat returns an SSE stream ending in data: [DONE]
curl.exe -N -H "Content-Type: application/json" -d "{\"question\":\"Explain gravity\",\"level\":\"c9-10\",\"style\":\"Simple\"}" http://localhost:8010/api/chat

# Solve an uploaded exam paper (mode: teach or exam; style: Simple, Exam, Detailed)
curl.exe -F "file=@paper.pdf" -F "level=c9-10" -F "subject=Science" -F "mode=exam" -F "style=Exam" http://localhost:8010/api/solve
curl.exe -H "Content-Type: application/json" -d "{\"question\":{\"id\":\"q1\",\"n\":1,\"text\":\"Find x: 2x=8\",\"marks\":2,\"status\":\"review\",\"hints\":[\"Hint one\",\"Hint two\"],\"solution\":{\"given\":[],\"steps\":[],\"therefore\":\"\",\"answer\":\"\"}},\"text\":\"Find x: 2x=8\",\"level\":\"c9-10\",\"style\":\"Exam\"}" http://localhost:8010/api/solve/resolve
curl.exe -H "Content-Type: application/json" -d "{\"kind\":\"simpler\",\"question\":{\"id\":\"q1\",\"n\":1,\"text\":\"Find x: 2x=8\",\"marks\":2,\"status\":\"solved\",\"hints\":[\"Hint one\",\"Hint two\"],\"solution\":{\"given\":[],\"steps\":[],\"therefore\":\"\",\"answer\":\"4\"}}}" http://localhost:8010/api/solve/follow-up

# Study From My Book: upload, list, ask, generate, delete
curl.exe -F "file=@chapter.pdf" http://localhost:8010/api/docs/upload
curl.exe http://localhost:8010/api/docs
curl.exe http://localhost:8010/api/docs/DOCUMENT_ID
curl.exe -H "Content-Type: application/json" -d "{\"question\":\"Summarise the key idea\",\"level\":\"c9-10\"}" http://localhost:8010/api/docs/DOCUMENT_ID/ask
curl.exe -H "Content-Type: application/json" -d "{\"task\":\"notes\",\"level\":\"c9-10\"}" http://localhost:8010/api/docs/DOCUMENT_ID/generate
curl.exe -X DELETE http://localhost:8010/api/docs/DOCUMENT_ID

# Practice paper generation, grading, handwritten checking and re-evaluation
# Objective MCQs are graded in code; written answers use a Concept/Explanation/Example/Presentation rubric.
curl.exe -H "Content-Type: application/json" -d "{\"level\":\"c9-10\",\"subject\":\"Science\",\"chapter\":\"Electricity\",\"difficulty\":\"Medium\",\"totalMarks\":50,\"timeMin\":90,\"weakFocus\":[]}" http://localhost:8010/api/practice/generate
curl.exe -H "Content-Type: application/json" -d "{\"answers\":{\"q1\":\"1\"},\"timeUsedSec\":300}" http://localhost:8010/api/practice/PAPER_ID/submit
curl.exe -F "answers=@handwritten-answers.pdf" -F "paperId=PAPER_ID" http://localhost:8010/api/practice/check
curl.exe -H "Content-Type: application/json" -d "{\"answer\":\"Revised answer text\"}" http://localhost:8010/api/practice/EVALUATION_ID/re-evaluate

# Diagram and presentation generation
curl.exe -H "Content-Type: application/json" -d "{\"prompt\":\"Flowchart to check if a number is even or odd\",\"type\":\"Flowchart\",\"level\":\"c9-10\",\"forceFlowchart\":true}" http://localhost:8010/api/diagram
curl.exe -H "Content-Type: application/json" -d "{\"action\":\"refine\",\"diagram\":{\"id\":\"d1\",\"prompt\":\"Example\",\"title\":\"Example\",\"type\":\"Flowchart\",\"code\":\"flowchart TD\\nA([Start])-->B([End])\",\"explanation\":\"A flow\",\"level\":\"c9-10\",\"createdAt\":\"2026-10-07T00:00:00Z\"},\"instruction\":\"Make it simpler\",\"level\":\"c9-10\"}" http://localhost:8010/api/diagram
curl.exe -H "Content-Type: application/json" -d "{\"topic\":\"Artificial Intelligence\",\"level\":\"c9-10\",\"slides\":5,\"theme\":\"Indigo Modern\",\"speakerNotes\":true,\"includeDiagrams\":false,\"includeQuiz\":false,\"extra\":\"\"}" http://localhost:8010/api/ppt
# Post the returned topic, theme, slides and speakerNotes fields to /api/pptx to download a .pptx.
# PPTX themes: Indigo Modern, Clean White, Dark Elegant, Playful.

# Coding actions: action values are Explain, Debug, Predict Output, Give Hint,
# Generate Test Cases, Run, Interview, Generate Exercise.
curl.exe -H "Content-Type: application/json" -d "{\"action\":\"Explain\",\"code\":\"print(1 + 1)\",\"language\":\"Python\",\"level\":\"c9-10\"}" http://localhost:8010/api/code
curl.exe -H "Content-Type: application/json" -d "{\"action\":\"Run\",\"code\":\"print(input())\",\"input\":\"hello\",\"language\":\"Python\",\"level\":\"c9-10\"}" http://localhost:8010/api/code

# Viva start, answer, and final report
curl.exe -H "Content-Type: application/json" -d "{\"subject\":\"DBMS\",\"topic\":\"Normalization\",\"level\":\"grad\",\"count\":5,\"adaptive\":true}" http://localhost:8010/api/viva/start
curl.exe -H "Content-Type: application/json" -d "{\"question\":{\"id\":\"SESSION_ID::1\",\"question\":\"What is normalization?\",\"topic\":\"Normalization\",\"keywords\":[\"data\",\"redundancy\"],\"explanation\":\"It reduces duplicate data.\"},\"answer\":\"It reduces duplicate data.\",\"level\":\"grad\"}" http://localhost:8010/api/viva/answer
curl.exe -H "Content-Type: application/json" -d "{\"subject\":\"DBMS\",\"topic\":\"Normalization\",\"level\":\"grad\",\"answers\":[{\"question\":{\"id\":\"SESSION_ID::1\",\"question\":\"What is normalization?\",\"topic\":\"Normalization\",\"keywords\":[\"data\",\"redundancy\"],\"explanation\":\"It reduces duplicate data.\"},\"answer\":\"It reduces duplicate data.\",\"feedback\":{\"label\":\"Good\",\"score\":1,\"explanation\":\"Clear answer.\",\"ideal\":\"It reduces duplicate data.\"}}]}" http://localhost:8010/api/viva/report

# Progress and dashboard share the same persisted mastery aggregates
curl.exe http://localhost:8010/api/progress
curl.exe http://localhost:8010/api/dashboard
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
- **Code execution is unavailable:** Python uses the backend's local
  time/memory-limited runner. Java, C, C++, JavaScript, and SQL use Docker
  containers, so Docker Desktop must be running and these images must be
  available locally: `eclipse-temurin:21-jdk-alpine`, `gcc:14-bookworm`,
  `node:22-alpine`, and `python:3.12-alpine`. HTML/CSS opens in a sandboxed
  browser preview. Container runs disable networking, use a read-only root
  filesystem, and enforce process, memory, and time limits; this is intended
  for short educational snippets, not as a secure multi-tenant code-hosting
  service.

To manually check the configured model roles against OmniRoute, run this from
`backend/`:

```powershell
python -m scripts.check_models
```

Roles without a configured model ID are skipped.
