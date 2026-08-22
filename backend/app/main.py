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
from .prompt import BOOKING_TOOL_NOTE, SYSTEM_PROMPT

app = FastAPI(title="Northstar Homes AI Sales Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FULL_SYSTEM_PROMPT = SYSTEM_PROMPT + "\n" + BOOKING_TOOL_NOTE

BOOK_TAG_RE = re.compile(
    r'\[\[BOOK_VISIT:\s*date="([^"]*)",\s*time="([^"]*)",\s*configuration="([^"]*)"\]\]'
)


class ChatRequest(BaseModel):
    session_id: str | None = None
    message: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    booking: dict | None = None


class EndResponse(BaseModel):
    session_id: str
    analytics: dict


def _strip_booking_tag(text: str) -> str:
    return BOOK_TAG_RE.sub("", text).strip()


async def _get_model_reply(history: list[dict]) -> str:
    messages = [{"role": "system", "content": FULL_SYSTEM_PROMPT}] + history
    return await chat_completion(messages)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    session_id = req.session_id or str(uuid.uuid4())
    session = sessions.get_or_create(session_id)

    if session.ended:
        raise HTTPException(400, "This conversation has already ended.")

    session.history.append({"role": "user", "content": req.message})

    try:
        reply = await _get_model_reply(session.history)
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
            followup_reply = await _get_model_reply(session.history)
        except LLMError as exc:
            raise HTTPException(502, str(exc)) from exc

        followup_reply = _strip_booking_tag(followup_reply)
        session.history.append({"role": "assistant", "content": followup_reply})

        final_reply = f"{visible_reply}\n\n{followup_reply}".strip()
        return ChatResponse(session_id=session_id, reply=final_reply, booking=booking_result)

    visible_reply = _strip_booking_tag(reply)
    session.history.append({"role": "assistant", "content": visible_reply})
    return ChatResponse(session_id=session_id, reply=visible_reply, booking=None)


@app.post("/end/{session_id}", response_model=EndResponse)
async def end_conversation(session_id: str):
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(404, "Session not found.")

    session.ended = True

    if not session.history:
        analytics = {"error": "No conversation to analyze."}
    else:
        try:
            analytics = await generate_analytics(session.history)
        except LLMError as exc:
            raise HTTPException(502, str(exc)) from exc

    return EndResponse(session_id=session_id, analytics=analytics)


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
    }
