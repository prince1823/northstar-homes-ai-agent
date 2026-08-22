"""Simple in-memory session store.

Simple by design (per assignment scope): one process, no persistence, no TTL
eviction. Fine for a demo/assignment; would move to Redis/DB for production.
"""

import time
from dataclasses import dataclass, field


@dataclass
class Session:
    session_id: str
    history: list[dict] = field(default_factory=list)  # [{role, content}, ...]
    ended: bool = False
    booking: dict | None = None  # last booking attempt/result, if any
    stall_pending: bool = False  # model said "let me check/confirm" without a tag
    title: str | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


_sessions: dict[str, Session] = {}


def get_or_create(session_id: str) -> Session:
    if session_id not in _sessions:
        _sessions[session_id] = Session(session_id=session_id)
    return _sessions[session_id]


def get(session_id: str) -> Session | None:
    return _sessions.get(session_id)


def all_sessions() -> dict[str, Session]:
    return _sessions


def touch(session: Session) -> None:
    session.updated_at = time.time()
