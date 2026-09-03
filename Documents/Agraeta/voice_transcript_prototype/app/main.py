import logging
import os
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.elevenlabs_transcription import transcribe as transcribe_elevenlabs
from app.insights import generate_insights
from app.transcription import transcribe as transcribe_groq
from app.translation import translate_to_english

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".opus", ".mp4"}

TRANSCRIPTION_PROVIDERS = {
    "groq": (transcribe_groq, "GROQ_API_KEY"),
    "elevenlabs": (transcribe_elevenlabs, "ELEVENLABS_API_KEY"),
}

app = FastAPI(title="Sales Call Analytics POC")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


@app.get("/")
def index():
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...), provider: str = Form("groq")):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}")

    if provider not in TRANSCRIPTION_PROVIDERS:
        raise HTTPException(400, f"Unknown provider '{provider}'. Allowed: {sorted(TRANSCRIPTION_PROVIDERS)}")
    transcribe, provider_key_name = TRANSCRIPTION_PROVIDERS[provider]

    if not os.environ.get(provider_key_name) or not os.environ.get("GEMINI_API_KEY"):
        raise HTTPException(500, f"Server is missing {provider_key_name} / GEMINI_API_KEY. Check your .env file.")

    temp_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
    request_start = time.monotonic()
    try:
        content = await file.read()
        with open(temp_path, "wb") as f:
            f.write(content)
        logger.info("[%s] received %r (%d bytes), provider=%s", temp_path.stem[:8], file.filename, len(content), provider)

        try:
            transcript = transcribe(str(temp_path))
        except Exception as exc:
            logger.error("[%s] transcription failed: %r", temp_path.stem[:8], exc)
            raise HTTPException(502, f"Transcription failed: {exc}") from exc

        if transcript["language_code"] is not None or transcript["language_probability"] is not None:
            logger.info("[%s] detected language: %s (probability %s)",
                        temp_path.stem[:8], transcript["language_code"], transcript["language_probability"])

        if not transcript["text"]:
            raise HTTPException(422, "Transcription returned empty text — check the audio quality.")

        logger.info("[%s] transcript ready (%d chars), starting insights + translation",
                    temp_path.stem[:8], len(transcript["text"]))

        try:
            insights = generate_insights(transcript["text"])
        except Exception as exc:
            logger.error("[%s] insight generation failed: %r", temp_path.stem[:8], exc)
            raise HTTPException(502, f"Insight generation failed: {exc}") from exc

        try:
            translation = translate_to_english(transcript["text"])
        except Exception as exc:
            logger.error("[%s] translation failed: %r", temp_path.stem[:8], exc)
            raise HTTPException(502, f"Translation failed: {exc}") from exc

        logger.info("[%s] done in %.1fs total", temp_path.stem[:8], time.monotonic() - request_start)
        return JSONResponse({
            "transcript": transcript,
            "translation": translation,
            "insights": insights,
            "provider": provider,
        })
    finally:
        for p in list(UPLOAD_DIR.glob(f"{temp_path.stem}*")):
            p.unlink(missing_ok=True)
