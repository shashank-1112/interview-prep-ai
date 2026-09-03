"""
POST /questions/generate

Takes a session_id (from /resume/upload), pulls the stored resume text,
generates personalized interview questions via Gemini, stores them on the
session (so /grading/submit can reference "what was q3's text" later
without the frontend re-sending full question text), and returns them.
"""

from fastapi import APIRouter, HTTPException

from app.schemas.questions import QuestionGenerationRequest, QuestionGenerationResponse
from app.services.question_service import QuestionGenerationError, generate_questions
from app.services.session_store import get_session, update_session

router = APIRouter(prefix="/questions", tags=["questions"])


@router.post("/generate", response_model=QuestionGenerationResponse)
async def generate_questions_endpoint(payload: QuestionGenerationRequest) -> QuestionGenerationResponse:
    session = get_session(payload.session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Session not found or expired. Please re-upload your resume.",
        )

    try:
        questions = generate_questions(session["resume_text"])
    except QuestionGenerationError as e:
        # 502: this endpoint worked fine, but the upstream service (Gemini) didn't.
        raise HTTPException(status_code=502, detail=str(e)) from e

    update_session(payload.session_id, questions=questions)

    return QuestionGenerationResponse(session_id=payload.session_id, questions=questions)
