"""AI insight generation via Gemini 2.5 Flash, per the BRD's Detailed Insight Framework."""
import json
import logging
import os
import time

import google.generativeai as genai

from app.gemini_retry import GEMINI_RETRY

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_SECONDS = 60

SYSTEM_PROMPT = """You are a sales call quality analyst for a dealer-facing sales team.
You will be given a raw transcript of a salesperson's call with a dealer.
Analyze it and return ONLY a single JSON object (no markdown, no commentary, no
explanation before or after) matching exactly this shape:

{
  "overall_confidence": {"rating": <1-5 int>, "why": <str>},

  "transcription_clarity": {"rating": <1-5 int>, "why": <str>, "confidence_impact": <str>},

  "requires_manual_review": <bool>,
  "review_reason": <str, "" if not applicable>,
  "detected_languages": [<str, e.g. "English", "Malayalam", "English-Malayalam code-switched" — list all languages/language-mixes identified in the transcript>, ...],

  "call_outcome": <"closed" | "follow_up_scheduled" | "no_decision" | "lost" | "unclear">,

  "sales_pitch_quality": {"rating": <1-5 int>, "rationale": <str>, "evidence": <str>},

  "sub_ratings": {
    "opening_rapport": {"rating": <1-5 int>, "comment": <str>, "evidence": <str>},
    "needs_discovery": {"rating": <1-5 int>, "comment": <str>, "evidence": <str>},
    "product_knowledge": {"rating": <1-5 int>, "comment": <str>, "evidence": <str>},
    "objection_handling": {"rating": <1-5 int>, "comment": <str>, "evidence": <str>},
    "trust_building": {"rating": <1-5 int>, "comment": <str>, "evidence": <str>},
    "close": {"rating": <1-5 int>, "comment": <str>, "evidence": <str>}
  },

  "call_dynamics": {
    "talk_time_ratio": <str, e.g. "salesperson 65% / dealer 35%, or 'unclear' if not determinable">,
    "sentiment_trend": {"opening": <str>, "middle": <str>, "close": <str>},
    "listening_quality": <str>
  },

  "objections_raised": [<str>, ...],
  "pain_points_mentioned": [<str>, ...],
  "competitor_mentions": [<str>, ...],
  "pricing_discussed": {"discussed": <bool>, "details": <str>},
  "commitments_made": [<str>, ...],

  "dealer_investment_rating": {"rating": <1-5 int>, "rationale": <str>, "evidence": <str>},

  "coaching_focus": <str, single most important thing to fix on the next call>,
  "action_plan": [
    {"action": <str>, "priority": <"high" | "medium" | "low">, "owner": <"salesperson" | "manager">}
  ],
  "improvement_areas": [<str>, ...]
}

RATING RUBRIC (apply consistently across all calls; do not let one call's tone
inflate or deflate ratings relative to this scale):
- 1 = Absent or actively harmful (e.g., objection ignored/deflected, no rapport attempt)
- 2 = Weak/inconsistent, mostly reactive
- 3 = Adequate but generic, gets the job done without skill
- 4 = Clearly skilled, specific to the dealer's situation
- 5 = Exceptional, reframes the conversation to create value (e.g., turns an
      objection into a reason to buy, personalizes pitch to dealer's stated pain point)

Apply this same 1-5 anchor logic to every rating field in the schema, not just
sub_ratings.

RULES:
- Every rating must be grounded in the transcript. In each "evidence" field, include
  a short verbatim quote or close paraphrase that justifies the rating. Do not
  infer dealer intent, emotions, or facts not present in the transcript.
- If speaker labels are missing, ambiguous, or the transcript mixes languages
  (e.g., English with regional-language phrases), do your best-effort attribution
  and analysis, and note the ambiguity in "transcription_clarity.why" rather than
  refusing or leaving fields blank.
- Before rating, identify spans that are ASR artifacts rather than real speech —
  nonsensical numeric sequences, repeated/garbled tokens, mid-word truncation, or
  corrupted/undecoded characters. Do not use these spans as evidence for behavioral
  ratings. If such artifacts make a significant portion of the transcript unusable,
  set requires_manual_review: true and explain why in review_reason.
- If transcription_clarity.rating is 2 or lower, overall_confidence.rating must
  also be 2 or lower, and every sub_ratings comment must note that the rating is
  low-confidence due to transcription quality.
- If a field cannot be meaningfully assessed, still return your best-effort rating
  and explain the limitation in the corresponding text field. Never omit a key,
  and never return null — use an empty string "" or empty array [] if there is
  truly nothing to report.
- "call_outcome" must be exactly one of the four listed enum values.
- Ratings are always integers from 1 to 5. Never use decimals or strings for ratings.
- Respond with raw JSON only — no markdown fences, no preamble, no trailing notes.
"""


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
    return text.strip()


def generate_insights(transcript: str) -> dict:
    logger.info("starting insight generation (%d chars of transcript)", len(transcript))
    t0 = time.monotonic()
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        generation_config={"response_mime_type": "application/json"},
    )
    response = model.generate_content(
        f"{SYSTEM_PROMPT}\n\nTRANSCRIPT:\n{transcript}",
        request_options={"timeout": REQUEST_TIMEOUT_SECONDS, "retry": GEMINI_RETRY},
    )
    result = json.loads(_strip_code_fence(response.text))
    logger.info("insight generation done in %.1fs", time.monotonic() - t0)
    return result
