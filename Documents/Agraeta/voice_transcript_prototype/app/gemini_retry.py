"""Shared retry policy for Gemini calls (insights + translation).

Free-tier Gemini quotas are tight (e.g. 20 requests/minute for gemini-2.5-flash)
and each /api/analyze request makes two Gemini calls, so a 429 is a realistic
transient condition, not just a testing artifact. The API tells us how long to
wait (retry_delay in its own error), so we let google-api-core's Retry back off
and retry automatically rather than failing the whole request outright.
"""
import logging

from google.api_core import exceptions as gexc
from google.api_core.retry import Retry

logger = logging.getLogger(__name__)

RETRYABLE = (gexc.ResourceExhausted, gexc.ServiceUnavailable, gexc.DeadlineExceeded, gexc.InternalServerError)


def _log_retry(exc):
    logger.warning("Gemini call failed, retrying: %r", exc)


GEMINI_RETRY = Retry(
    predicate=lambda exc: isinstance(exc, RETRYABLE),
    initial=5.0,
    maximum=60.0,
    multiplier=2.0,
    timeout=180.0,
    on_error=_log_retry,
)
