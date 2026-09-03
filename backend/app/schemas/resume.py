"""Pydantic models for the /resume routes."""

from pydantic import BaseModel, Field


class ResumeUploadResponse(BaseModel):
    session_id: str = Field(
        ..., description="Opaque ID the frontend must send on later calls (question generation, grading)."
    )
    character_count: int = Field(..., description="Length of the extracted resume text, for a quick sanity check.")
    resume_text_preview: str = Field(
        ..., description="First ~300 characters of extracted text, so the UI can show 'we read your resume as: ...'."
    )
