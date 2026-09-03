"""Speech-to-text via ElevenLabs Scribe — alternate provider to Groq/Whisper.

Scribe includes diarization and word-level timestamps out of the box, and
handles code-switched speech more gracefully than Whisper in places, but it
has its own failure mode: confident hallucination of fluent, unrelated text
on unclear audio (observed directly on a real noisy call during evaluation).
Treat its output with the same skepticism as any ASR result, not as strictly
"better."
"""
import logging
import os
import time

import httpx

from app.transcription import prepare_audio_light

logger = logging.getLogger(__name__)

API_URL = "https://api.elevenlabs.io/v1/speech-to-text"
MODEL_ID = "scribe_v1"
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 3
# Real calls take a while (~113s observed for a 14.7-minute recording) — well
# above Groq's near-instant response, so this needs generous headroom.
REQUEST_TIMEOUT_SECONDS = 180

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def transcribe(file_path: str) -> dict:
    api_key = os.environ["ELEVENLABS_API_KEY"]
    audio_path = prepare_audio_light(file_path)
    logger.info("starting ElevenLabs transcription of %s (%d bytes)", audio_path, os.path.getsize(audio_path))

    for attempt in range(1, MAX_RETRIES + 1):
        t0 = time.monotonic()
        try:
            with open(audio_path, "rb") as audio_file:
                response = httpx.post(
                    API_URL,
                    headers={"xi-api-key": api_key},
                    data={"model_id": MODEL_ID, "diarize": "true", "tag_audio_events": "true"},
                    files={"file": audio_file},
                    timeout=REQUEST_TIMEOUT_SECONDS,
                )
            response.raise_for_status()
            body = response.json()
            logger.info("ElevenLabs transcription attempt %d/%d succeeded in %.1fs",
                        attempt, MAX_RETRIES, time.monotonic() - t0)
            return {
                "text": body.get("text", "").strip(),
                "words": body.get("words", []),
                "language_code": body.get("language_code"),
                "language_probability": body.get("language_probability"),
            }
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            logger.warning("ElevenLabs transcription attempt %d/%d failed after %.1fs: HTTP %d %s",
                           attempt, MAX_RETRIES, time.monotonic() - t0, status, exc.response.text[:300])
            if status not in RETRYABLE_STATUS_CODES or attempt == MAX_RETRIES:
                raise
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)
        except httpx.TimeoutException as exc:
            logger.warning("ElevenLabs transcription attempt %d/%d timed out after %.1fs: %r",
                           attempt, MAX_RETRIES, time.monotonic() - t0, exc)
            if attempt == MAX_RETRIES:
                raise
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)
