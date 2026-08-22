# Northstar Homes — AI Sales Agent

A prompt-driven AI sales assistant ("Riya") for a fictional real-estate project,
**Northstar One** (Sector 79, Gurugram). Built for the Huvo AI Forward Deployed
Engineer assignment.

- **Backend:** FastAPI (Python)
- **Frontend:** React (Vite)
- **LLM:** any OpenRouter-hosted model (default: `openai/gpt-4o-mini`)

## Project layout

```
huvo/
├── backend/            # FastAPI app
│   ├── app/
│   │   ├── main.py       # API routes: /chat, /end/{id}, /session/{id}
│   │   ├── prompt.py     # the final system prompt (source of truth)
│   │   ├── llm.py        # OpenRouter client
│   │   ├── sessions.py   # in-memory conversation store
│   │   ├── booking.py    # simulated site-visit booking (with failure rate)
│   │   └── analytics.py  # post-conversation analytics extraction
│   ├── tests/test_cases.md
│   ├── requirements.txt
│   └── .env.example
├── frontend/            # React chat UI (Vite)
└── prompt/system_prompt.md   # standalone copy of the final prompt
```

## How to run

### 1. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env and paste your OpenRouter API key
uvicorn app.main:app --reload --port 8000
```

Get an OpenRouter key at https://openrouter.ai/keys.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # defaults to http://localhost:8000, adjust if needed
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`).

### 3. Try it

Chat with the bot in English, Hindi, or Hinglish. Ask about pricing, raise an
objection, ask to be contacted later, ask an unknown question, or ask to book a
site visit. Click **"End conversation"** to generate analytics from the
transcript.

## How it works

- `POST /chat` sends the full conversation history plus the system prompt
  (`app/prompt.py`) to the LLM on every turn, so the model always has full
  context (memory is just "replay the transcript" — simple by design).
- When the model decides a site visit should be booked, it emits an invisible
  tag (`[[BOOK_VISIT: date=... time=... configuration=...]]`) in its reply. The
  backend parses this, runs a simulated booking (`app/booking.py`, ~20% random
  failure rate to exercise the failure-handling behavior), feeds the result
  back to the model as a system note, and the model relays the outcome to the
  customer naturally in the same turn — success or failure.
- `POST /end/{session_id}` runs a second LLM pass over the full transcript
  using a separate analytics prompt (`ANALYTICS_PROMPT` in `app/prompt.py`) to
  produce structured JSON: configuration interest, budget signal, purpose,
  timeline, interest level, objections raised, site-visit status, follow-up
  requirements, escalation needs, and languages used.

## Key assumptions

- No real CRM, calendar, or booking system exists — site visits are simulated
  in-process with a fixed random failure rate, not connected to any real
  scheduling backend.
- No real project data beyond what's given in the assignment (project name,
  location, configurations, starting prices) — the prompt explicitly refuses
  to invent anything beyond that (discounts, possession dates, amenities, etc.)
- Sessions are stored in-memory only (a Python dict), per the "keep it simple"
  instruction in the assignment. Restarting the backend clears all
  conversations.
- The same system prompt is meant to work for both text chat and voice; since
  this assignment's Part 2 only requires a text-based bot, voice suitability
  is addressed at the prompt level (short, speakable sentences, no markdown/
  lists in replies) but not integrated with an actual voice/telephony system.

## Known limitations

- No authentication/rate-limiting — not production-hardened, matches the
  assignment's "keep it simple" scope.
- Analytics extraction depends on the LLM correctly following a JSON schema;
  a malformed response is caught and surfaced as an error field rather than
  crashing, but isn't retried.
- No persistence layer — history and analytics are lost on server restart.
- Language detection/switching relies entirely on the LLM's judgment from the
  prompt instructions; there's no separate language-detection step.
- CORS is left open (`*`) for local demo convenience; would be locked down for
  any real deployment.

## AI tools used

This solution (prompt design, backend, frontend, and this README) was built
with the assistance of Claude (Anthropic), used as a coding/design assistant
throughout.
