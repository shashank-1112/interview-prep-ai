"""
Single shared Gemini client instance.

The new `google-genai` SDK (NOT the deprecated `google-generativeai`) is
client-instance based rather than global-config based: you create one
`genai.Client(api_key=...)` and call methods on it (e.g.
`client.models.generate_content(...)`), instead of calling module-level
functions after a global `genai.configure(api_key=...)` like the old SDK.

We create exactly one Client here, at import time, and every service that
needs Gemini imports `client` from this module. That keeps API-key
handling in one place and avoids creating a new HTTP client per request.
"""

from google import genai

from app.config import settings

client = genai.Client(api_key=settings.gemini_api_key)
