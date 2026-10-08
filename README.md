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

- Node.js 20 or newer
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

## Run the app

Start each service in its own terminal. Install the frontend dependencies from
the project root with `npm install --legacy-peer-deps` if needed.

| Terminal  | Folder          | Command                                                                                    |
| --------- | --------------- | ------------------------------------------------------------------------------------------ |
| OmniRoute | Any             | `docker start omniroute` (skip this if `docker ps` already shows `omniroute` as `Up`)      |
| Backend   | `EduAI\backend` | `python -m uvicorn app.main:app --reload` (with the backend virtual environment activated) |
| Frontend  | `EduAI`         | `npm run dev`                                                                              |

In the backend terminal, from `backend/`, activate the virtual environment and
start the server:

```powershell
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

Using `python -m uvicorn` is recommended on Windows when application-control
policies block executable launchers.

In the frontend terminal, from the project root, run:

```powershell
npm run dev
```

The frontend is available at `http://localhost:5173` and sends requests to the
backend at `http://localhost:8000`. Configure a different backend URL in
Settings if needed. AI-powered features require the backend and a configured
OmniRoute gateway; EduAI does not provide local demo responses.

## Use on your phone

Connect your phone and computer to the same Wi-Fi network. Start the backend
and frontend so they listen on the local network:

```powershell
# From the backend directory, with its virtual environment activated
python -m uvicorn app.main:app --reload --host 0.0.0.0

# From the project root, in a separate terminal
npm run dev -- --host 0.0.0.0
```

Open `http://<computer-ip>:5173` on your phone (for example,
`http://192.168.1.20:5173`). The app will connect to the backend at the same
computer's address on port `8000`. In Windows Firewall, allow/open inbound
TCP ports `5173` (frontend) and `8000` (backend) on your private network.

## Checks

```powershell
npm run build
npx tsc --noEmit
npx vitest run
cd backend
python -m pytest -q
```
