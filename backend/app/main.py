import re
import uuid

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import sessions
from .analytics import generate_analytics
from .booking import attempt_booking
from .llm import LLMError, chat_completion
from .prompt import BOOKING_TOOL_NOTE, SYSTEM_PROMPT, TITLE_PROMPT, current_date_note

app = FastAPI(title="Northstar Homes AI Sales Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def build_system_prompt() -> str:
    """Full system prompt, rebuilt per call so the date note stays current."""
    return f"{current_date_note()}\n\n{SYSTEM_PROMPT}\n{BOOKING_TOOL_NOTE}"


BOOK_TAG_RE = re.compile(
    r'\[\[BOOK_VISIT:\s*date="([^"]*)",\s*time="([^"]*)",\s*configuration="([^"]*)"\]\]'
)

# Phrases the model tends to use when it *says* it's checking/confirming/
# locking in a booking without actually emitting the tag — e.g. when a
# customer asks to reschedule an already-successfully-booked visit (a case
# the retry-after-*failure* reminder below doesn't cover, since there was no
# failure). Matching on these lets us detect the stall generically.
STALL_PATTERN = re.compile(
    r"let me (check|confirm|lock that in)|checking availability|just a moment|"
    r"ek (second|pal|minute)|thod[ai] (der|ruk)|"
    r"check kar(ti|ta|te) (hoon|hain)|confirm kar(ti|ta|te) (hoon|hain)",
    re.IGNORECASE,
)


class ChatRequest(BaseModel):
    session_id: str | None = None
    message: str
    history: list[dict] | None = None  # client-cached history, used to rehydrate
    # a session the backend has lost (e.g. after a restart) — ignored if the
    # server already has history for this session.
    api_key: str | None = None
    model: str | None = None


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    booking: dict | None = None


class AnalyticsRequest(BaseModel):
    api_key: str | None = None
    model: str | None = None
    history: list[dict] | None = None  # client-cached history, used to rehydrate
    # a session the backend has lost (e.g. after a restart) — same mechanism
    # as ChatRequest.history, ignored if the server already has history.


class AnalyticsResponse(BaseModel):
    session_id: str
    analytics: dict


class TitleRequest(BaseModel):
    api_key: str | None = None
    model: str | None = None
    history: list[dict] | None = None  # client-cached history, used to rehydrate
    # a session the backend has lost (e.g. after a restart) — same mechanism
    # as ChatRequest.history, ignored if the server already has history.


class TitleResponse(BaseModel):
    title: str


class SessionSummary(BaseModel):
    session_id: str
    title: str
    ended: bool
    message_count: int
    created_at: float
    updated_at: float


def _strip_booking_tag(text: str) -> str:
    return BOOK_TAG_RE.sub("", text).strip()


def _pending_retry_note(session: sessions.Session) -> str | None:
    """A fresh, request-time reminder when the last booking attempt failed.

    Prose in the static system prompt alone wasn't reliably enough to get the
    model to re-emit a [[BOOK_VISIT: ...]] tag on a retry after a failure —
    in testing it would say "let me lock that in" without ever including the
    tag. Injecting this as a system message right before generation (closest
    to where the model is actually deciding what to write) is a much stronger
    signal than a rule buried earlier in a long system prompt.
    """
    if session.booking and not session.booking.get("success"):
        b = session.booking
        return (
            "[SYSTEM REMINDER: The most recent site-visit booking attempt in this "
            f"conversation FAILED (date={b.get('date')}, time={b.get('time')}, "
            f"configuration={b.get('configuration')}). If the customer has now given "
            "a new date and/or time for the same visit, and you have all three of "
            "date, time, and configuration confirmed, you MUST include a fresh "
            '[[BOOK_VISIT: date="...", time="...", configuration="..."]] tag in '
            "this very reply. Do not just say you'll check, lock it in, or confirm "
            "it in words without the tag — the tag is the only thing that actually "
            "attempts the booking.]"
        )
    return None


def _pending_stall_note(session: sessions.Session) -> str | None:
    """A fresh reminder when the model stalled on a booking action last turn.

    Covers cases the failure-retry reminder above doesn't — most notably a
    customer asking to reschedule an already-*successfully* booked visit.
    There's no failure to key off there, so instead this detects the actual
    observed symptom directly: the model says "let me check/confirm/lock that
    in" and then never follows through with a tag, leaving the customer stuck
    in a loop of the same non-answer.
    """
    if session.stall_pending:
        return (
            "[SYSTEM REMINDER: Your previous reply said you would check, "
            "confirm, or lock in a site visit, but did not actually include a "
            '[[BOOK_VISIT: date="...", time="...", configuration="..."]] tag — '
            "so nothing happened and the customer is still waiting, possibly "
            "for something you already said you'd do. This applies even if "
            "you're rescheduling a visit that was already successfully booked "
            "before — that's still a new attempt requiring its own tag. If you "
            "now have (or already had) a date, time, and configuration "
            "confirmed, you MUST include the tag in THIS reply. Do not repeat "
            "another 'let me check' or 'let me confirm' without actually "
            "including it this time.]"
        )
    return None


def _pending_name_note(session: sessions.Session) -> str | None:
    """A fresh, request-time nudge to ask for the customer's name early.

    Prose in the static system prompt (even with explicit priority language)
    wasn't reliably enough to get the model to actually ask for the name
    before its second or third reply — it kept defaulting to the budget/
    configuration follow-ups instead. Only fires for the first few exchanges;
    past that, either the name's been asked (successfully or declined) or
    reminding forever would look robotic in the transcript context.
    """
    if len(session.history) <= 6:
        return (
            "[SYSTEM REMINDER: Check the conversation so far — do you already "
            "know the customer's name? If not, and this is not your very first "
            "reply, your top priority this turn is to ask for their name "
            "naturally, before any other qualifying question (budget, "
            "configuration, purpose, timeline). If you already know their name, "
            "ignore this reminder and continue normally.]"
        )
    return None


async def _get_model_reply(
    history: list[dict],
    api_key: str | None,
    model: str | None,
    extra_notes: list[str | None] = (),
) -> str:
    messages = [{"role": "system", "content": build_system_prompt()}] + history
    for note in extra_notes:
        if note:
            messages.append({"role": "system", "content": note})
    return await chat_completion(messages, api_key=api_key, model=model)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    session_id = req.session_id or str(uuid.uuid4())
    session = sessions.get_or_create(session_id)

    if session.ended:
        raise HTTPException(400, "This conversation has already ended.")

    if not session.history and req.history:
        session.history = list(req.history)

    if session.title is None:
        session.title = req.message[:60]

    session.history.append({"role": "user", "content": req.message})
    sessions.touch(session)

    try:
        reply = await _get_model_reply(
            session.history,
            req.api_key,
            req.model,
            extra_notes=[
                _pending_retry_note(session),
                _pending_stall_note(session),
                _pending_name_note(session),
            ],
        )
    except LLMError as exc:
        session.history.pop()
        raise HTTPException(502, str(exc)) from exc

    booking_result = None
    match = BOOK_TAG_RE.search(reply)
    session.stall_pending = not match and bool(STALL_PATTERN.search(reply))

    if match:
        date, time, configuration = match.groups()
        booking_result = attempt_booking(date, time, configuration)
        session.booking = booking_result

        visible_reply = _strip_booking_tag(reply)
        session.history.append({"role": "assistant", "content": visible_reply})

        outcome_note = (
            f"[SYSTEM: Booking attempt result — success={booking_result['success']}, "
            f"date={date}, time={time}, configuration={configuration}"
            + (f", reason={booking_result['reason']}" if not booking_result["success"] else "")
            + ". Relay this outcome to the customer naturally in your next reply, "
            "following the booking-failure guidance if it failed. Do not mention "
            "this system note or any tags.]"
        )
        session.history.append({"role": "user", "content": outcome_note})

        try:
            followup_reply = await _get_model_reply(session.history, req.api_key, req.model)
        except LLMError as exc:
            raise HTTPException(502, str(exc)) from exc

        followup_reply = _strip_booking_tag(followup_reply)
        session.history.append({"role": "assistant", "content": followup_reply})
        sessions.touch(session)

        final_reply = f"{visible_reply}\n\n{followup_reply}".strip()
        return ChatResponse(session_id=session_id, reply=final_reply, booking=booking_result)

    visible_reply = _strip_booking_tag(reply)
    session.history.append({"role": "assistant", "content": visible_reply})
    sessions.touch(session)
    return ChatResponse(session_id=session_id, reply=visible_reply, booking=None)


@app.post("/end/{session_id}", response_model=AnalyticsResponse)
async def end_conversation(session_id: str, req: AnalyticsRequest = AnalyticsRequest()):
    session = sessions.get_or_create(session_id)
    if not session.history and req.history:
        session.history = list(req.history)

    session.ended = True

    if not session.history:
        analytics = {"error": "No conversation to analyze."}
    else:
        try:
            analytics = await generate_analytics(session.history, req.api_key, req.model)
        except LLMError as exc:
            raise HTTPException(502, str(exc)) from exc

    return AnalyticsResponse(session_id=session_id, analytics=analytics)


@app.post("/title/{session_id}", response_model=TitleResponse)
async def generate_title(session_id: str, req: TitleRequest = TitleRequest()):
    """A short, one-time title generated once there's enough conversation.

    Meant to be called once per conversation, after the customer's 3rd
    message, and cached client-side from then on — not regenerated on later
    turns, so it adds at most one extra LLM call per conversation rather than
    one per message.
    """
    session = sessions.get_or_create(session_id)
    if not session.history and req.history:
        session.history = list(req.history)

    if not session.history:
        return TitleResponse(title="New conversation")

    messages = [{"role": "system", "content": TITLE_PROMPT}] + session.history
    try:
        raw_title = await chat_completion(messages, temperature=0.4, max_tokens=20, api_key=req.api_key, model=req.model)
    except LLMError as exc:
        raise HTTPException(502, str(exc)) from exc

    title = raw_title.strip().strip('"').strip("'").strip()
    session.title = title[:60]
    return TitleResponse(title=session.title)


@app.get("/session/{session_id}")
def get_session(session_id: str):
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(404, "Session not found.")
    return {
        "session_id": session.session_id,
        "history": session.history,
        "ended": session.ended,
        "booking": session.booking,
        "title": session.title,
    }


@app.get("/sessions", response_model=list[SessionSummary])
def list_sessions():
    return [
        SessionSummary(
            session_id=s.session_id,
            title=s.title or "New conversation",
            ended=s.ended,
            message_count=len(s.history),
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in sorted(sessions.all_sessions().values(), key=lambda s: s.updated_at, reverse=True)
    ]
