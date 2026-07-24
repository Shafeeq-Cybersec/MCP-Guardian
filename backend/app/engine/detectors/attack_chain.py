"""Multi-Tool Attack Chain Detection Engine.

Correlate suspicious activities across multiple AI tool calls and sessions to
detect coordinated prompt-injection, privilege escalation, and data-exfiltration
attacks that single-request analysis cannot identify.
"""

from __future__ import annotations

import re
import time
from collections import defaultdict
from typing import Any

from app.engine.base import Detector, InspectionContext
from app.schemas.events import DetectionSignal, ThreatCategory


class AttackChainDetector(Detector):
    name = "AttackChainDetector"
    category = ThreatCategory.ATTACK_CHAIN
    tier = "heuristic"

    # Keywords/tools associated with reading sensitive data (Reconnaissance)
    RECON_TOOLS = {
        "read_file",
        "filesystem:read",
        "get_config",
        "fetch_credentials",
        "env_var",
        "read_secrets",
        "db_query",
        "sql_exec",
    }
    RECON_PATTERNS = [
        r"(?:config|credentials|password|api[_\s]?key|\.env|id_rsa|secret)",
        r"(?:select\s+.*\s+from\s+users)",
    ]

    # Keywords/tools associated with external exfiltration
    EXFIL_TOOLS = {
        "fetch_url",
        "http_post",
        "send_email",
        "webhook",
        "exfil_data",
        "curl",
    }
    EXFIL_PATTERNS = [
        r"https?://[^\s]+",
        r"(?:send|post|upload|exfiltrate)\s+to",
    ]

    # System execution tools / commands (Privilege Escalation)
    SYSTEM_EXEC_TOOLS = {
        "exec",
        "terminal",
        "bash",
        "powershell",
        "cmd",
        "eval",
    }

    def __init__(self, max_history_per_session: int = 20, ttl_seconds: float = 600) -> None:
        # Sliding window history per session: session_id -> list of request dicts
        self._history: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.max_history = max_history_per_session
        self.ttl = ttl_seconds

    def _clean_stale_sessions(self, now: float) -> None:
        """Evict sessions older than TTL."""
        expired = [
            sid for sid, records in self._history.items()
            if records and (now - records[-1]["timestamp"] > self.ttl)
        ]
        for sid in expired:
            del self._history[sid]

    def inspect(self, ctx: InspectionContext) -> list[DetectionSignal]:
        # Session correlation only applies when a session_id is provided
        if not ctx.session_id:
            return []

        signals: list[DetectionSignal] = []
        session_id = ctx.session_id
        now = time.time()

        self._clean_stale_sessions(now)

        current_record = {
            "timestamp": now,
            "direction": ctx.direction,
            "tool": (ctx.tool or "").lower(),
            "content": ctx.normalized,
        }

        past_records = self._history[session_id]

        # --- Rule 1: Reconnaissance -> Data Exfiltration Chain ---
        is_exfil_step = (
            current_record["tool"] in self.EXFIL_TOOLS
            or any(re.search(p, ctx.normalized, re.IGNORECASE) for p in self.EXFIL_PATTERNS)
        )

        if is_exfil_step and past_records:
            has_recon = any(
                r["tool"] in self.RECON_TOOLS
                or any(re.search(p, r["content"], re.IGNORECASE) for p in self.RECON_PATTERNS)
                for r in past_records
            )
            if has_recon:
                signals.append(
                    self._signal(
                        score=85.0,
                        confidence=0.9,
                        message="Coordinated Attack Chain Detected: Reconnaissance followed by Data Exfiltration across tool calls.",
                        matched=[f"session:{session_id}", f"tool:{ctx.tool}"],
                    )
                )

        # --- Rule 2: Indirect Injection -> Privilege Escalation / System Exec ---
        is_exec_step = (
            current_record["tool"] in self.SYSTEM_EXEC_TOOLS
            or re.search(r"(?:rm\s+-rf|sudo|powershell\s+-EncodedCommand|eval\(|exec\()", ctx.normalized, re.IGNORECASE)
        )

        if is_exec_step and past_records:
            has_indirect_injection = any(
                "<!-- system:" in r["content"]
                or "[[system:" in r["content"]
                or "ignore all previous instructions" in r["content"]
                for r in past_records
            )
            if has_indirect_injection:
                signals.append(
                    self._signal(
                        score=95.0,
                        confidence=0.95,
                        message="Coordinated Attack Chain Detected: Tool Poisoning / Indirect Injection leading to System Command Execution.",
                        matched=[f"session:{session_id}", f"exec_tool:{ctx.tool}"],
                    )
                )

        # Append current record to sliding window session history
        past_records.append(current_record)
        if len(past_records) > self.max_history:
            past_records.pop(0)

        return signals
