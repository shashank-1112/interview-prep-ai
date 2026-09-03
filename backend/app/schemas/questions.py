"""Pydantic models for the /questions routes."""

from pydantic import BaseModel, Field


class QuestionGenerationRequest(BaseModel):
    session_id: str = Field(..., description="ID returned by POST /resume/upload.")


class Question(BaseModel):
    id: str = Field(..., description="Stable identifier for this question within the session, e.g. 'q1'.")
    focus_area: str = Field(..., description="Short label naming what resume detail this question targets.")
    text: str = Field(..., description="The interview question itself.")


class QuestionGenerationResponse(BaseModel):
    session_id: str
    questions: list[Question]
