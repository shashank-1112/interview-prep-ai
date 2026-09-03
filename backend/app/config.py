"""
Central place for all environment-driven configuration.

Using pydantic-settings means:
- Every setting is declared once, with a type, so a typo or missing value
  fails loudly at startup instead of silently returning None deep in some
  service file.
- `.env` is loaded automatically (env_file=".env" below) — no manual
  `os.getenv()` calls scattered around the codebase.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Required: no default, so the app refuses to start without a real key.
    gemini_api_key: str

    # Comma-separated origins allowed to call this API from a browser.
    # Default covers the Angular dev server (`ng serve` runs on :4200).
    cors_origins: str = "http://localhost:4200"

    # Which Gemini model to use — kept here (not hardcoded in services)
    # so swapping models later is a one-line change.
    gemini_model: str = "gemini-2.5-flash"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins_list(self) -> list[str]:
        """Split the comma-separated CORS_ORIGINS string into a list for FastAPI's middleware."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


# A single shared instance, imported wherever settings are needed:
#   from app.config import settings
settings = Settings()
