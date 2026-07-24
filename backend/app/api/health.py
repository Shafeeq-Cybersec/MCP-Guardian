"""Health & capability introspection."""

from __future__ import annotations

from fastapi import APIRouter

from app import __version__
from app.core.config import settings
from app.engine.llm import explainer
from app.engine.pipeline import engine
from app.services.event_store import store
from app.services.ws_manager import manager

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health() -> dict[str, object]:
    detectors = engine.capabilities()
    return {
        "status": "operational",
        "version": __version__,
        "environment": settings.environment,
        "detectors": {
            "total": len(detectors),
            "upgraded": sum(1 for d in detectors if d["upgraded"]),
            "list": detectors,
        },
        "llm_provider": explainer.provider,
        "event_store": store.backend,
        "ws_clients": manager.count,
        "thresholds": {
            "sanitize": settings.threshold_sanitize,
            "quarantine": settings.threshold_quarantine,
            "block": settings.threshold_block,
        },
    }
