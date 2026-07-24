"""Event store - Redis-backed when available, in-memory ring buffer otherwise.

Also maintains rolling aggregate counters for the dashboard KPIs so the
`/api/stats` endpoint is O(1).
"""

from __future__ import annotations

import asyncio
import json
from collections import deque

from app.core.config import settings
from app.schemas.events import GuardianEvent, StatsResponse, Verdict


class EventStore:
    def __init__(self) -> None:
        self._events: deque[GuardianEvent] = deque(maxlen=settings.event_buffer_size)
        self._lock = asyncio.Lock()
        self._redis = None
        self._counters = {
            "inspected": 0,
            "blocked": 0,
            "quarantined": 0,
            "sanitized": 0,
            "allowed": 0,
            "threats": 0,
            "risk_sum": 0.0,
            "latency_sum": 0.0,
        }
        # live inventory (populated by the simulator / integrations)
        self.active_agents = 5
        self.connected_servers = 4

    async def connect(self) -> None:
        if not settings.redis_url:
            return
        try:
            import redis.asyncio as aioredis  # type: ignore

            self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
            await self._redis.ping()
        except Exception:  # noqa: BLE001 - fall back to memory
            self._redis = None

    @property
    def backend(self) -> str:
        return "redis" if self._redis is not None else "memory"

    async def add(self, event: GuardianEvent) -> None:
        async with self._lock:
            self._events.appendleft(event)
            c = self._counters
            c["inspected"] += 1
            c["risk_sum"] += event.riskScore
            c["latency_sum"] += event.latencyMs
            if event.verdict == Verdict.BLOCK:
                c["blocked"] += 1
            elif event.verdict == Verdict.QUARANTINE:
                c["quarantined"] += 1
            elif event.verdict == Verdict.SANITIZE:
                c["sanitized"] += 1
            else:
                c["allowed"] += 1
            if event.category.value != "benign":
                c["threats"] += 1

        if self._redis is not None:
            try:
                await self._redis.lpush("guardian:events", event.model_dump_json())
                await self._redis.ltrim("guardian:events", 0, settings.event_buffer_size - 1)
            except Exception:  # noqa: BLE001
                pass

    async def recent(self, limit: int = 100) -> list[GuardianEvent]:
        async with self._lock:
            return list(self._events)[:limit]

    async def stats(self) -> StatsResponse:
        c = self._counters
        inspected = max(c["inspected"], 1)
        return StatsResponse(
            inspected=c["inspected"],
            blocked=c["blocked"],
            quarantined=c["quarantined"],
            sanitized=c["sanitized"],
            threatsToday=c["threats"],
            avgRiskScore=round(c["risk_sum"] / inspected, 1),
            avgLatencyMs=round(c["latency_sum"] / inspected, 1),
            activeAgents=self.active_agents,
            connectedServers=self.connected_servers,
            blockRate=round(c["blocked"] / inspected * 100, 1),
        )

    def seed_counters(self, inspected: int, blocked: int, quarantined: int, sanitized: int) -> None:
        """Pre-load plausible totals so a fresh boot reads like an active day."""
        self._counters.update(
            inspected=inspected,
            blocked=blocked,
            quarantined=quarantined,
            sanitized=sanitized,
            allowed=inspected - blocked - quarantined - sanitized,
            threats=blocked + quarantined,
            risk_sum=inspected * 11.0,
            latency_sum=inspected * 17.0,
        )


store = EventStore()
