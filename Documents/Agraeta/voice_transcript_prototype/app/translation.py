"""English translation of the raw transcript via Gemini 2.5 Flash.

Calls with several languages / code-switching within one transcript are common
for this use case, so translation is done from the full text transcript
(Gemini handles multilingual/mixed-language input well) rather than a second
audio pass through Whisper.
"""
import logging
import os
import time

import google.generativeai as genai

from app.gemini_retry import GEMINI_RETRY

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_SECONDS = 60

TRANSLATION_PROMPT = """The following is a transcript of a sales call. It may contain
multiple languages or code-switching between languages within the same conversation.
Translate the ENTIRE transcript into fluent, natural English, preserving meaning,
tone, and speaker turns as closely as possible. Do not summarize or omit content.
If the transcript is already fully in English, return it unchanged.
Respond with the translated text only — no commentary, labels, or preamble.
"""


def translate_to_english(transcript: str) -> str:
    logger.info("starting translation (%d chars of transcript)", len(transcript))
    t0 = time.monotonic()
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel("gemini-2.5-flash")
    response = model.generate_content(
        f"{TRANSLATION_PROMPT}\n\nTRANSCRIPT:\n{transcript}",
        request_options={"timeout": REQUEST_TIMEOUT_SECONDS, "retry": GEMINI_RETRY},
    )
    logger.info("translation done in %.1fs", time.monotonic() - t0)
    return response.text.strip()
