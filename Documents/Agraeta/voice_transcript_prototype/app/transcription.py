"""Speech-to-text via Groq's hosted Whisper-Large-v3."""
import logging
import os
import shutil
import subprocess
import time
from pathlib import Path

from groq import APIConnectionError, APITimeoutError, Groq, InternalServerError

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # Whisper's hard limit
MAX_RETRIES = 4
RETRY_BACKOFF_SECONDS = 2
# Per-attempt request timeout. Groq is fast (~1s even for large files in testing) —
# 45s is generous headroom for a real request, not a wait for a hung one.
REQUEST_TIMEOUT_SECONDS = 45

# Groq's hosted Whisper endpoint measured at ~50% transient failure rate on a
# ~23-minute file during testing (it's a free public beta per the infra notes) —
# retrying the identical request typically succeeds. We disable the SDK's own
# built-in retry (max_retries=0 below) so this outer loop is the only retry
# layer — otherwise a single "attempt" here could silently retry 3x internally
# at up to 60s each, turning a few retries into a 10+ minute stall.
RETRYABLE_ERRORS = (InternalServerError, APITimeoutError, APIConnectionError)

# Extensions the transcription API doesn't recognize by name, even though
# ffmpeg can read the underlying codec fine. WhatsApp voice notes are
# Ogg/Opus audio saved with a .opus extension.
UNSUPPORTED_EXTENSIONS = {".opus"}

# Real-world dealer-visit recordings are noisy (phone in pocket, shop ambient
# noise, multiple speakers) and that noise measurably degrades Whisper's
# accuracy. This chain is applied to every file before transcription:
#   highpass/lowpass  - keep the speech band (80Hz-8kHz), drop rumble/hiss
#                        outside it (8kHz also matches our 16kHz output rate's
#                        Nyquist limit, so nothing above it survives anyway)
#   afftdn            - FFT-based denoiser for steady background noise
#   dynaudnorm        - evens out volume swings (quiet mumbling vs loud talk)
DENOISE_FILTER_CHAIN = "highpass=f=80,lowpass=f=8000,afftdn,dynaudnorm"

# afftdn/dynaudnorm can introduce artifacts over silent/noisy stretches that
# ElevenLabs Scribe mistakes for speech, causing it to hallucinate fluent
# nonsense there. This chain skips denoising entirely — resample/remix only —
# for use ahead of that provider.
LIGHT_FILTER_CHAIN = None


def _encode(input_path: str, output_path: str, bitrate: str, filter_chain: str = DENOISE_FILTER_CHAIN) -> None:
    args = ["ffmpeg", "-y", "-i", input_path]
    if filter_chain:
        args += ["-af", filter_chain]
    args += ["-ac", "1", "-ar", "16000", "-b:a", bitrate, output_path]
    subprocess.run(args, check=True, capture_output=True)


def _prepare_audio(input_path: str, filter_chain: str) -> str:
    """Shared flow behind prepare_audio()/prepare_audio_light(): handle a missing
    ffmpeg install, encode with the given filter chain, and re-encode at a lower
    bitrate if still oversized."""
    ext = Path(input_path).suffix.lower()

    if not shutil.which("ffmpeg"):
        if ext in UNSUPPORTED_EXTENSIONS:
            raise RuntimeError(
                f"'{ext}' files (e.g. WhatsApp voice notes) require ffmpeg to convert, "
                "but ffmpeg isn't installed. Install it with `brew install ffmpeg`."
            )
        logger.warning("ffmpeg not installed — sending audio to Whisper without noise reduction")
        return input_path

    output_path = f"{input_path}.denoised.mp3"
    t0 = time.monotonic()
    _encode(input_path, output_path, "64k", filter_chain)
    if os.path.getsize(output_path) > MAX_UPLOAD_BYTES:
        logger.info("still oversized after denoise (%d bytes), re-encoding at a lower bitrate",
                    os.path.getsize(output_path))
        _encode(input_path, output_path, "32k", filter_chain)
    logger.info("denoise+normalize done in %.1fs (%d -> %d bytes)",
                time.monotonic() - t0, os.path.getsize(input_path), os.path.getsize(output_path))
    return output_path


def prepare_audio(input_path: str) -> str:
    """Denoise/normalize with ffmpeg before every transcription — this also
    handles unsupported extensions (e.g. WhatsApp's .opus) and oversized files
    as a side effect of re-encoding. Falls back to the raw file, unprocessed,
    only if ffmpeg isn't installed (and only when that's actually survivable)."""
    ext = Path(input_path).suffix.lower()

    if not shutil.which("ffmpeg"):
        if ext in UNSUPPORTED_EXTENSIONS:
            raise RuntimeError(
                f"'{ext}' files (e.g. WhatsApp voice notes) require ffmpeg to convert, "
                "but ffmpeg isn't installed. Install it with `brew install ffmpeg`."
            )
        logger.warning("ffmpeg not installed — sending audio to Whisper without noise reduction")
        return input_path

    output_path = f"{input_path}.denoised.mp3"
    t0 = time.monotonic()
    _encode(input_path, output_path, "64k")
    if os.path.getsize(output_path) > MAX_UPLOAD_BYTES:
        logger.info("still oversized after denoise (%d bytes), re-encoding at a lower bitrate",
                    os.path.getsize(output_path))
        _encode(input_path, output_path, "32k")
    logger.info("denoise+normalize done in %.1fs (%d -> %d bytes)",
                time.monotonic() - t0, os.path.getsize(input_path), os.path.getsize(output_path))
    return output_path


def prepare_audio_light(input_path: str) -> str:
    """Same job as prepare_audio() — handles unsupported extensions, oversized
    files, and missing ffmpeg — but with a lighter filter chain (mono + 16kHz
    resample + bitrate control only, no afftdn/dynaudnorm/highpass/lowpass).
    Use ahead of ElevenLabs Scribe, which is prone to hallucinating fluent
    nonsense over stretches the denoise/normalize filters have artifacted."""
    return _prepare_audio(input_path, LIGHT_FILTER_CHAIN)


def transcribe(file_path: str) -> dict:
    client = Groq(
        api_key=os.environ["GROQ_API_KEY"],
        timeout=REQUEST_TIMEOUT_SECONDS,
        max_retries=0,  # we handle retries ourselves below, with visibility
    )
    audio_path = prepare_audio(file_path)
    logger.info("starting transcription of %s (%d bytes)", audio_path, os.path.getsize(audio_path))

    for attempt in range(1, MAX_RETRIES + 1):
        t0 = time.monotonic()
        try:
            with open(audio_path, "rb") as audio_file:
                result = client.audio.transcriptions.create(
                    file=audio_file,
                    model="whisper-large-v3",
                    response_format="text",
                )
            logger.info("transcription attempt %d/%d succeeded in %.1fs",
                        attempt, MAX_RETRIES, time.monotonic() - t0)
            return {
                "text": str(result).strip(),
                "words": None,
                "language_code": None,
                "language_probability": None,
            }
        except RETRYABLE_ERRORS as exc:
            logger.warning("transcription attempt %d/%d failed after %.1fs: %r",
                           attempt, MAX_RETRIES, time.monotonic() - t0, exc)
            if attempt == MAX_RETRIES:
                raise
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)
