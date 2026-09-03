"""
POST /grading/submit

Takes a session_id and the candidate's answers, grades them against the
questions generated earlier for that session, and returns per-question
feedback, an overall rating, and improvement suggestions.
"""

from fastapi import APIRouter, HTTPException

from app.schemas.grading import GradingRequest, GradingResponse
from app.services.grading_service import GradingError, grade_answers
from app.services.session_store import get_session

router = APIRouter(prefix="/grading", tags=["grading"])


@router.post("/submit", response_model=GradingResponse)
async def submit_grading(payload: GradingRequest) -> GradingResponse:
    session = get_session(payload.session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Session not found or expired. Please re-upload your resume.",
        )

    questions = session.get("questions")
    if not questions:
        raise HTTPException(
            status_code=400,
            detail="No questions were generated for this session yet. Please generate questions first.",
        )

    if not payload.answers:
        raise HTTPException(status_code=400, detail="No answers were submitted.")

    try:
        result = grade_answers(session["resume_text"], questions, payload.answers)
    except GradingError as e:
        # 502: this endpoint worked fine, but the upstream service (Gemini) didn't.
        raise HTTPException(status_code=502, detail=str(e)) from e

    return GradingResponse(session_id=payload.session_id, **result.model_dump())
