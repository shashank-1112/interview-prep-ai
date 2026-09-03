"""
Simple liveness check. Useful for:
- Confirming the backend is up before wiring the frontend to it.
- Docker healthchecks later.
"""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
