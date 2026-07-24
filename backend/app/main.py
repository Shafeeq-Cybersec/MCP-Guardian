"""MCP Guardian API - application entrypoint."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import auth, chat, detect, events, health, mcp, reports, ws
from app.core.config import settings
from app.engine.pipeline import engine
from app.schemas.events import InspectRequest
from app.services.event_store import store
from app.services.simulator import _random_request, simulator


async def _seed_history() -> None:
    """Populate a plausible recent history so the dashboard opens 'alive'."""
    store.seed_counters(inspected=8420, blocked=118, quarantined=64, sanitized=203)
    for _ in range(36):
        try:
            event = await engine.inspect_to_event(_random_request())
            await store.add(event)
        except Exception:  # noqa: BLE001
            continue


@asynccontextmanager
async def lifespan(app: FastAPI):
    await store.connect()
    await _seed_history()
    simulator.start()
    yield
    await simulator.stop()


app = FastAPI(
    title="MCP Guardian",
    description="Real-time bidirectional security firewall for AI agents.",
    version=__version__,
    lifespan=lifespan,
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (health, auth, detect, events, reports, mcp, chat):
    app.include_router(module.router)
app.include_router(ws.router)


@app.get("/", tags=["health"])
async def root() -> dict[str, str]:
    return {
        "name": "MCP Guardian",
        "version": __version__,
        "docs": "/docs",
        "status": "operational",
    }
