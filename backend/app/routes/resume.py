"""
POST /resume/upload

Accepts a PDF resume, extracts its text, stashes it in an in-memory
session, and hands back a session_id. The frontend stores that ID
(sessionStorage) and passes it to /questions/generate next.
"""

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.schemas.resume import ResumeUploadResponse
from app.services.pdf_service import ResumeExtractionError, extract_text_from_pdf
from app.services.session_store import create_session

router = APIRouter(prefix="/resume", tags=["resume"])

# 5 MB is generous for a text-based resume PDF (these are typically <500KB);
# this just guards against someone accidentally uploading a huge file.
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024


@router.post("/upload", response_model=ResumeUploadResponse)
async def upload_resume(file: UploadFile = File(...)) -> ResumeUploadResponse:
    # --- Validation, cheapest checks first ---

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")

    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File too large - please upload a resume under 5MB.")

    # --- Extraction ---
    # extract_text_from_pdf() also raises ResumeExtractionError for
    # password-protected PDFs or text that's too short to be a real resume
    # (e.g. a scanned image with no embedded text layer). We translate that
    # domain exception into a 422 (Unprocessable Entity: "I understood your
    # request, but the file's content is unusable") here in the route layer.
    try:
        resume_text = extract_text_from_pdf(file_bytes)
    except ResumeExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    # --- Store + respond ---
    session_id = create_session(resume_text)

    return ResumeUploadResponse(
        session_id=session_id,
        character_count=len(resume_text),
        resume_text_preview=resume_text[:300],
    )
