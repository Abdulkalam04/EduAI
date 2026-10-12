# EduAI

EduAI is an AI-powered learning companion for school and graduate learners. It
includes level-aware tutoring, exam solving, study-book tools, practice papers,
diagrams, presentation generation, coding help, viva practice, and progress
tracking.

The project contains a TanStack Start frontend in `src/` and a FastAPI backend
in `backend/`. Backend model requests use the local OpenAI-compatible OmniRoute
gateway. Configure a primary model and ordered fallback model IDs for each teacher,
practice, reasoning, multimodal, and JSON role.

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

## Running locally

Start OmniRoute first (skip this if it is already running). The helper checks
Docker and the configured container; the dashboard is at
`http://localhost:20128/dashboard`:

```powershell
npm run dev:omniroute
```

OmniRoute normally listens on port `20128`. In separate terminals from the
project root, start the backend and frontend:

```powershell
npm run dev:backend
npm run dev
```

The backend starter checks or creates the project virtual environment and
listens on port `8010` by default. The frontend is pinned to
`http://localhost:8082` and fails rather than silently switching ports. The
web API URL is configured in `.env.local` as `http://localhost:8010`.

To connect from a phone on the same Wi-Fi, use the exact **Phone API URL**
printed by `npm run dev:backend`. If Windows Firewall blocks the connection,
run this in an Administrator PowerShell:

```powershell
New-NetFirewallRule -DisplayName "EduAI backend TCP 8010" -Direction Inbound -Protocol TCP -LocalPort 8010 -RemoteAddress LocalSubnet -Profile Private -Action Allow
```

### Rebuilding the Android APK

Set the computer's current Wi-Fi IPv4 address in the ignored
`.env.android.local` file as `VITE_API_URL=http://<PC-LAN-IP>:8010`, then run:

```powershell
npm run build:android
```

After the web assets are built and synced, rebuild the APK in Android Studio.
The three local ports are OmniRoute `20128`, backend `8010`, and frontend
`8082`. AI-powered features require the backend and a configured OmniRoute
gateway; EduAI does not provide local demo responses.

### AI model fallback

Set `MODEL_<ROLE>` and optional comma-separated `MODEL_<ROLE>_FALLBACKS` in
`backend/.env`. Paid providers and personal-login providers are always refused
by the backend. Configure `CHAT_MODEL_ALLOWLIST` in display order to limit the
Ask picker; an empty list shows Auto only. `CHAT_PICKER_MAX` includes Auto and
is capped at six. The backend switches after eligible model failures and
applies a cooldown to rate-limited or failing models. Check configured model
IDs from a PowerShell terminal with `npm run check:models`. Free routing is
fail-closed: `FREE_PROVIDERS` defaults to `gemini,groq`. Models from those
trusted providers may be used when OmniRoute pricing is unknown/null or zero;
explicitly positive prices and all unlisted providers are refused.

To add Groq, configure a Groq provider and an API key from
<https://console.groq.com> in the local OmniRoute dashboard, then run
`npm run check:models` from the repository root to verify the configured model
chains. Keep provider keys in OmniRoute or the ignored backend `.env`; never
commit real API keys.

The Gemini benchmark harness (`backend/scripts/benchmark_gemini.py`) applies
the same verification and makes three runs per model at least 20 seconds apart;
it refuses to send benchmark prompts when price verification fails.

## Checks

```powershell
npm run build
npx tsc --noEmit
```
