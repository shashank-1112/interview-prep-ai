"""
FastAPI application entrypoint.

Run locally with:
    uvicorn app.main:app --reload --port 8000

This file's job is intentionally small: create the app, wire up CORS,
and register routers. No business logic lives here — that's in app/services/.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import grading, health, questions, resume

app = FastAPI(
    title="InterviewPrep AI API",
    description="Resume-based interview question generator and answer grader.",
    version="0.1.0",
)

# Allow the Angular dev server (and whatever origins are configured) to call this API.
# Without this, the browser blocks the frontend's requests with a CORS error.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Each route module owns one slice of the API surface.
app.include_router(health.router)
app.include_router(resume.router)
app.include_router(questions.router)
app.include_router(grading.router)
