"""
PDF text extraction and validation.

This module knows nothing about FastAPI or HTTP - it just takes raw bytes
and returns extracted text, or raises ResumeExtractionError. The route
layer (app/routes/resume.py) is the only place that turns that exception
into an HTTP response. Keeping the boundary here means this function could
be reused (e.g. in a script, or a test) without dragging FastAPI along.
"""

import io

from pypdf import PdfReader
from pypdf.errors import PdfReadError

# Below this many characters, we treat the extracted text as "not a real
# resume" rather than trying to generate questions from a near-empty prompt.
# 200 chars is roughly a couple of sentences - well under even a sparse resume,
# but enough to catch blank pages, cover-page-only PDFs, or scanned images
# (where pypdf extracts nothing since there's no embedded text layer).
MIN_RESUME_LENGTH = 200


class ResumeExtractionError(Exception):
    """Raised when we can't get usable text out of an uploaded PDF."""


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extract text from every page of a PDF and join it into one string.

    Raises:
        ResumeExtractionError: if the file isn't a readable PDF, is
            password-protected, or the extracted text is too short to
            plausibly be a resume (e.g. a scanned image with no text layer).
    """
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
    except PdfReadError as e:
        # pypdf's own "this doesn't look like a PDF" exception.
        raise ResumeExtractionError(f"Could not read PDF file: {e}") from e
    except Exception as e:
        # Catch-all: malformed files can surface other exception types
        # (e.g. a truncated file raising a raw IndexError deep in pypdf).
        # From the caller's point of view, any of these mean "unusable file".
        raise ResumeExtractionError(f"Unexpected error opening PDF: {e}") from e

    if reader.is_encrypted:
        raise ResumeExtractionError(
            "This PDF is password-protected. Please upload an unprotected file."
        )

    # Join pages with a blank line between them so the LLM sees a loose
    # section break at page boundaries, rather than text running together.
    pages_text = [page.extract_text() or "" for page in reader.pages]
    full_text = "\n\n".join(text.strip() for text in pages_text if text.strip())

    if len(full_text) < MIN_RESUME_LENGTH:
        raise ResumeExtractionError(
            "Couldn't extract enough readable text from this PDF. "
            "It may be empty, a scanned image (no selectable text), or too short to be a resume."
        )

    return full_text
