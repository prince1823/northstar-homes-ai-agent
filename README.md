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
│   │   ├── main.py       # API routes: /chat, /end/{id}, /title/{id}, /session/{id}, /sessions
│   │   ├── prompt.py     # the final system prompt + analytics schema (source of truth)
│   │   ├── llm.py        # OpenRouter client (supports per-request BYO key/model)
│   │   ├── sessions.py   # in-memory conversation store
│   │   ├── booking.py    # simulated site-visit booking (with failure rate)
│   │   └── analytics.py  # end-of-conversation analytics extraction
│   ├── tests/test_cases.md
│   ├── requirements.txt
│   └── .env.example
├── frontend/            # React chat UI (Vite)
│   └── src/
│       ├── App.jsx             # chat + conversation orchestration
│       ├── components/
│       │   ├── Sidebar.jsx        # project info, conversation list, settings
│       │   ├── AnalyticsModal.jsx # single popup with all analytics fields
│       │   └── SettingsModal.jsx  # BYO OpenRouter API key + model picker
│       └── lib/storage.js      # localStorage helpers (conversations, settings)
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
site visit. Click **"End conversation"** when you're done — a single popup
shows every analytics field extracted from the conversation (lead info, site
visit, follow-up, lead score, intent, qualification, summary). For an already
-ended conversation, a **"View analytics"** button in the header reopens the
same popup from cache, with no extra API call.

Optional: open **Settings** in the sidebar to use your own OpenRouter API
key and pick a model, instead of relying on the server's `.env` default — see
"Bring your own key" below.

## How it works

- `POST /chat` sends the full conversation history plus the system prompt
  (`app/prompt.py`) to the LLM on every turn, so the model always has full
  context (memory is just "replay the transcript" — simple by design).
- When the model has an explicit date, time, and configuration confirmed with
  the customer, it emits an invisible tag
  (`[[BOOK_VISIT: date=... time=... configuration=...]]`) in its reply. The
  backend parses this, resolves any relative date ("this Sunday") against a
  request-time IST date note injected into the prompt, runs a simulated
  booking (`app/booking.py`, ~20% random failure rate to exercise the
  failure-handling behavior), feeds the result back to the model as a system
  note, and the model relays the outcome to the customer naturally in the same
  turn — success or failure.
- Static prose in the system prompt alone wasn't reliably enough for a few
  specific behaviors, so `main.py` injects short, targeted "reminder" system
  messages at request time, only when session state says they're relevant:
  `_pending_retry_note` (re-emit the booking tag after a failed attempt, or
  when rescheduling an already-successful one — otherwise the model would
  sometimes just say "let me check availability" forever without ever
  re-invoking the tag), `_pending_stall_note` (a regex-based fallback that
  catches the same "said it would act but didn't" pattern more generally),
  and `_pending_name_note` (ask for the customer's name before other
  qualifying questions, for the first few exchanges only).
- `POST /end/{session_id}` runs one analytics pass over the full transcript
  when the conversation ends, using `ANALYTICS_PROMPT` in `app/prompt.py` to
  produce structured JSON: lead name, configuration interest, budget signal,
  purpose, timeline, interest level, preferred language, a 0–100 lead score,
  intent, qualification status, objections raised, site-visit status/date/
  time, follow-up requirements, escalation needs, and languages used. This
  runs exactly once per conversation — analytics are deliberately **not**
  generated live on every turn, to keep LLM calls to roughly one per message.
  An earlier version of this app ran a live analytics pass after every
  assistant turn to drive a real-time sidebar, which doubled the LLM calls
  per exchange; that was replaced with this single end-of-conversation popup,
  both for cost and because it matches the assignment's literal spec more
  closely.
- Sidebar conversation titles start as a truncated copy of the customer's
  first message, then are upgraded once — after their 3rd message, once
  there's enough context — via `POST /title/{session_id}`, a short LLM call
  (`app/prompt.py`'s `TITLE_PROMPT`) that produces a real title like "Site
  visit request for 3BHK" instead of the raw text. Like the analytics pass,
  this runs exactly once per conversation and is cached client-side, not
  regenerated on later turns.
- The frontend keeps a per-browser conversation history in `localStorage`
  (`frontend/src/lib/storage.js`) — a **"+ New Chat"** creates a fresh session,
  and switching to a previous one restores its messages and (if the
  conversation had already ended) its cached analytics instantly, with no
  network call. Since the backend's session store is in-memory, `/chat` and
  `/end` both accept an optional `history` field so a conversation can be
  transparently "rehydrated" server-side if the backend restarted after the
  browser cached it.
- Assistant replies render with a word-by-word typing animation on the
  frontend (`App.jsx`) for a ChatGPT-like feel — the backend always returns
  the full reply in one response; the typing effect is purely client-side.

### Bring your own key

The **Settings** panel (bottom of the sidebar) lets anyone running this app
supply their own OpenRouter API key and pick a model, instead of relying on
whoever hosts the backend to pay for every user's requests. The key is stored
only in `localStorage` and sent directly to this app's own backend per
request (`api_key`/`model` fields on both `/chat` and `/end`); the backend
forwards it to OpenRouter for that one call and never persists it
server-side. If left empty, the backend falls back to `OPENROUTER_API_KEY` /
`OPENROUTER_MODEL` from its own `.env`, if configured.

## Key assumptions

- No real CRM, calendar, or booking system exists — site visits are simulated
  in-process with a fixed random failure rate, not connected to any real
  scheduling backend.
- Beyond the core facts given in the assignment (project name, location,
  configurations, starting prices), the prompt defines a small, fixed fact
  sheet for Northstar One — carpet area ranges, amenities, parking,
  possession timeline, approximate maintenance charge — the way any real
  listing brochure would, so the agent can answer basic spec questions
  directly instead of deflecting everything to a specialist. This is
  authored once as fixed ground truth, not improvised per-conversation.
  Discounts, negotiability, exact floor/unit-level pricing and availability,
  and legal/RERA specifics are deliberately left out and always escalated —
  the prompt explicitly refuses to invent those.
- Sessions are stored in-memory only (a Python dict), per the "keep it simple"
  instruction in the assignment. Restarting the backend clears server-side
  session state, though the frontend's `localStorage` cache plus the
  `history` rehydration field on `/chat` mean an in-progress conversation can
  usually resume seamlessly anyway.
- Conversation history lives in each browser's `localStorage`, not a shared
  database — conversations aren't synced across devices/browsers, only within
  the one the user was chatting in.
- "Lead score" is an LLM-estimated heuristic (0–100) based on the
  conversation so far, not a calibrated scoring model — useful as a directional
  signal in the demo, not a real qualification metric.
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
- A user-supplied API key in Settings is stored in plaintext in that browser's
  `localStorage` (standard for client-side BYO-key patterns, but worth noting
  — anyone with access to that browser profile could read it).

## AI tools used

This solution (prompt design, backend, frontend, and this README) was built
with the assistance of Claude (Anthropic), used as a coding/design assistant
throughout.
