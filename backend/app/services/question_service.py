"""
Question generation service.

Flow: resume text -> build prompt (app/prompts/question_prompts.py) ->
call Gemini with a JSON `response_schema` so the API enforces structured
output -> parse the result into our Question Pydantic models.

Using `response_schema` ("structured output") instead of just asking
nicely for JSON in the prompt text means we don't have to defensively
regex/strip markdown fences out of the response - Gemini itself is
constrained to emit JSON matching this shape.
"""

import json
import logging

from google.genai import types
from google.genai.errors import APIError

from app.config import settings
from app.prompts.question_prompts import QUESTION_GENERATION_PROMPT
from app.schemas.questions import Question
from app.services.gemini_client import client

logger = logging.getLogger(__name__)


class QuestionGenerationError(Exception):
    """Raised when we can't produce usable questions: rate limit, API outage, or a malformed response."""


# The JSON shape we require back from Gemini, expressed as a JSON Schema
# dict. Passed as `response_schema` below.
_QUESTIONS_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "focus_area": {"type": "string"},
                    "text": {"type": "string"},
                },
                "required": ["focus_area", "text"],
            },
        },
    },
    "required": ["questions"],
}


def generate_questions(resume_text: str) -> list[Question]:
    """
    Call Gemini to generate personalized interview questions for this resume.

    Raises:
        QuestionGenerationError: on rate limiting, any other Gemini API
            failure, or if the response can't be parsed into questions.
    """
    prompt = QUESTION_GENERATION_PROMPT.format(resume_text=resume_text)

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_QUESTIONS_RESPONSE_SCHEMA,
                # A little variety so re-uploading the same resume doesn't
                # always produce byte-identical questions.
                temperature=0.7,
            ),
        )
    except APIError as e:
        logger.error("Gemini API error during question generation: %s", e)
        if e.code == 429:
            raise QuestionGenerationError(
                "The AI service is rate-limited right now. Please wait a moment and try again."
            ) from e
        raise QuestionGenerationError(
            "The AI service is temporarily unavailable. Please try again shortly."
        ) from e

    try:
        data = json.loads(response.text)
        raw_questions = data["questions"]
        if not raw_questions:
            raise ValueError("empty questions list")
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
        logger.error("Unexpected Gemini response for question generation: %r", response.text)
        raise QuestionGenerationError("Received an unusable response from the AI service.") from e

    return [
        Question(id=f"q{i + 1}", focus_area=q["focus_area"], text=q["text"])
        for i, q in enumerate(raw_questions)
    ]
