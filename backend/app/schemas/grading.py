"""Pydantic models for the /grading routes."""

from pydantic import BaseModel, Field


class AnswerInput(BaseModel):
    question_id: str = Field(..., description="Matches a Question.id returned by /questions/generate.")
    answer_text: str = Field(..., description="The candidate's answer to that question (may be empty if skipped).")


class GradingRequest(BaseModel):
    session_id: str = Field(..., description="ID returned by POST /resume/upload.")
    answers: list[AnswerInput]


class QuestionFeedback(BaseModel):
    question_id: str
    question_text: str = Field(
        ..., description="Echoed back so the results screen doesn't need to re-fetch/re-track question text."
    )
    rating: int = Field(..., ge=1, le=5)
    feedback: str


class GradingResult(BaseModel):
    """
    What the grading service actually produces. Deliberately has no
    session_id - the service doesn't need to know it, only the route does
    (it already has it from the request). Keeping it out here means the
    service's return type isn't coupled to anything HTTP-request-shaped.
    """

    overall_rating: int = Field(..., ge=1, le=5)
    per_question_feedback: list[QuestionFeedback]
    improvement_suggestions: list[str]


class GradingResponse(GradingResult):
    session_id: str
