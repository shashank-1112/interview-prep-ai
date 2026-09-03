"""
In-memory session storage.

MVP scope explicitly has no database. A "session" is just a dict of
whatever we've learned so far (resume text, generated questions, ...),
keyed by a UUID that the frontend carries around in sessionStorage and
sends back on every later call.

Accepted trade-offs for this stage of the project:
- Restarting the backend process loses every in-progress session.
- This does not scale past a single backend process (no shared state
  across instances/workers) - fine for local dev / a single demo deploy.
- No TTL/cleanup - sessions accumulate for the life of the process.

If this app ever needs persistence or multi-instance deployment, this
file is the one place that changes (e.g. swap the dict for Redis) -
nothing in routes/ or the other services needs to know.
"""

import uuid
from typing import Any

# module-level dict = lives for the lifetime of the backend process
_sessions: dict[str, dict[str, Any]] = {}


def create_session(resume_text: str) -> str:
    """Start a new session for a freshly-uploaded resume. Returns the session_id."""
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {"resume_text": resume_text}
    return session_id


def get_session(session_id: str) -> dict[str, Any] | None:
    """Look up a session's stored data. Returns None if the ID is unknown/expired."""
    return _sessions.get(session_id)


def update_session(session_id: str, **fields: Any) -> None:
    """Merge new fields (e.g. generated `questions`) into an existing session."""
    if session_id in _sessions:
        _sessions[session_id].update(fields)
