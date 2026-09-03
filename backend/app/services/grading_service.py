"""
Answer grading service.

Flow: pair each generated question with the candidate's submitted answer,
render them as text (app/prompts/grading_prompts.py), and call Gemini
ONCE for the whole interview - not once per question. See the prompt
module's docstring for why grading everything together (rather than N
isolated calls) produces a more meaningful overall rating and suggestions.
"""

import json
import logging

from google.genai import types
from google.genai.errors import APIError

from app.config import settings
from app.prompts.grading_prompts import GRADING_PROMPT
from app.schemas.grading import AnswerInput, GradingResult, QuestionFeedback
from app.schemas.questions import Question
from app.services.gemini_client import client

logger = logging.getLogger(__name__)


class GradingError(Exception):
    """Raised when we can't produce a usable grading: rate limit, API outage, or a malformed response."""


_GRADING_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "per_question_feedback": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question_id": {"type": "string"},
                    "rating": {"type": "integer"},
                    "feedback": {"type": "string"},
                },
                "required": ["question_id", "rating", "feedback"],
            },
        },
        "overall_rating": {"type": "integer"},
        "improvement_suggestions": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["per_question_feedback", "overall_rating", "improvement_suggestions"],
}


def _format_qa_pairs(questions: list[Question], answers: list[AnswerInput]) -> str:
    """Render questions+answers as numbered 'Q / A' text blocks for the prompt."""
    answers_by_id = {a.question_id: a.answer_text for a in answers}
    blocks = []
    for i, q in enumerate(questions, start=1):
        # Treat a missing OR blank/whitespace-only answer the same way, so the
        # model grades "skipped" consistently instead of grading an empty string.
        answer_text = answers_by_id.get(q.id, "").strip() or "(no answer provided)"
        blocks.append(f"Q{i} ({q.id}): {q.text}\nA{i}: {answer_text}")
    return "\n\n".join(blocks)


def grade_answers(resume_text: str, questions: list[Question], answers: list[AnswerInput]) -> GradingResult:
    """
    Call Gemini once to grade every answer in the interview together.

    Raises:
        GradingError: on rate limiting, any other Gemini API failure, or
            if the response can't be parsed into a valid grading.
    """
    qa_pairs_text = _format_qa_pairs(questions, answers)
    prompt = GRADING_PROMPT.format(resume_text=resume_text, qa_pairs=qa_pairs_text)

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_GRADING_RESPONSE_SCHEMA,
                # Low temperature: grading should be consistent and rubric-driven,
                # not creative - unlike question generation, which used 0.7.
                temperature=0.2,
            ),
        )
    except APIError as e:
        logger.error("Gemini API error during grading: %s", e)
        if e.code == 429:
            raise GradingError(
                "The AI service is rate-limited right now. Please wait a moment and try again."
            ) from e
        raise GradingError("The AI service is temporarily unavailable. Please try again shortly.") from e

    try:
        data = json.loads(response.text)
        raw_feedback = data["per_question_feedback"]
        overall_rating = data["overall_rating"]
        suggestions = data["improvement_suggestions"]
        if not raw_feedback or not suggestions:
            raise ValueError("empty feedback or suggestions")
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
        logger.error("Unexpected Gemini response for grading: %r", response.text)
        raise GradingError("Received an unusable response from the AI service.") from e

    # Look up each question's text by ID so the response can echo it back -
    # the frontend's results screen then has everything it needs per question
    # without separately tracking question text alongside feedback.
    question_text_by_id = {q.id: q.text for q in questions}

    per_question_feedback = [
        QuestionFeedback(
            question_id=item["question_id"],
            question_text=question_text_by_id.get(item["question_id"], "(unknown question)"),
            rating=item["rating"],
            feedback=item["feedback"],
        )
        for item in raw_feedback
    ]

    return GradingResult(
        overall_rating=overall_rating,
        per_question_feedback=per_question_feedback,
        improvement_suggestions=suggestions,
    )
