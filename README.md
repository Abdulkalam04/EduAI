# EduAI

EduAI is an AI-powered learning companion for school and graduate learners. It
includes level-aware tutoring, exam solving, study-book tools, practice papers,
diagrams, presentation generation, coding help, viva practice, and progress
tracking.

The project contains a TanStack Start frontend in `src/` and a FastAPI backend
in `backend/`. Backend model requests use the local OpenAI-compatible OmniRoute
gateway. Configure separate model IDs for the teacher, practice, reasoning,
multimodal, and JSON roles; optional roles fall back to the teacher model.

## Requirements

- Node.js and Bun (the repository uses `bun.lock`)
- Python 3.11 or newer
- A running OmniRoute gateway and configured provider/model IDs for AI features

## Configure the backend

In PowerShell, from the project root:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Set `OMNIROUTE_BASE_URL`, `OMNIROUTE_API_KEY`, and the model role IDs in
`backend/.env`. See [backend/README.md](./backend/README.md) for role guidance
and the full configuration list. Never commit `.env`.

Start the backend from `backend/`:

```powershell
python -m uvicorn app.main:app --reload
```

Using `python -m uvicorn` is recommended on Windows when application-control
policies block executable launchers.

## Start the frontend

From the project root:

```powershell
bun install
bun run dev
```

The frontend is available at `http://localhost:5173`. In Settings, turn off
demo mode to connect to the backend at `http://localhost:8000`; configure a
different URL there if needed.

## Checks

```powershell
bun run build
bunx tsc --noEmit
cd backend
python -m pytest -q
```
