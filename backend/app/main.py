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
from .prompt import BOOKING_TOOL_NOTE, SYSTEM_PROMPT, current_date_note

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


class AnalyticsResponse(BaseModel):
    session_id: str
    analytics: dict


class SessionSummary(BaseModel):
    session_id: str
    title: str
    ended: bool
    message_count: int
    created_at: float
    updated_at: float


def _strip_booking_tag(text: str) -> str:
    return BOOK_TAG_RE.sub("", text).strip()


async def _get_model_reply(
    history: list[dict], api_key: str | None, model: str | None
) -> str:
    messages = [{"role": "system", "content": build_system_prompt()}] + history
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
        reply = await _get_model_reply(session.history, req.api_key, req.model)
    except LLMError as exc:
        session.history.pop()
        raise HTTPException(502, str(exc)) from exc

    booking_result = None
    match = BOOK_TAG_RE.search(reply)
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


@app.post("/snapshot/{session_id}", response_model=AnalyticsResponse)
async def snapshot(session_id: str, req: AnalyticsRequest = AnalyticsRequest()):
    """Live analytics over the conversation so far, without ending it.

    Used to keep the sidebar (lead info, site visit, follow-up, analytics)
    updated turn-by-turn while the conversation is still ongoing.
    """
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(404, "Session not found.")

    if not session.history:
        return AnalyticsResponse(session_id=session_id, analytics={})

    try:
        analytics = await generate_analytics(session.history, req.api_key, req.model)
    except LLMError as exc:
        raise HTTPException(502, str(exc)) from exc

    return AnalyticsResponse(session_id=session_id, analytics=analytics)


@app.post("/end/{session_id}", response_model=AnalyticsResponse)
async def end_conversation(session_id: str, req: AnalyticsRequest = AnalyticsRequest()):
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(404, "Session not found.")

    session.ended = True

    if not session.history:
        analytics = {"error": "No conversation to analyze."}
    else:
        try:
            analytics = await generate_analytics(session.history, req.api_key, req.model)
        except LLMError as exc:
            raise HTTPException(502, str(exc)) from exc

    return AnalyticsResponse(session_id=session_id, analytics=analytics)


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
