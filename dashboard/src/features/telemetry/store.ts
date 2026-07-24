"use client";

import { create } from "zustand";
import type {
  GuardianEvent,
  MetricPoint,
  SystemHealthComponent,
  McpServer,
  ConnectedAgent,
  Incident,
  DashboardStats,
  ThreatCategory,
  Verdict,
} from "@/lib/types";
import {
  seedEvents,
  seedTrafficSeries,
  seedSystemHealth,
  seedServers,
  seedAgents,
  seedIncidents,
} from "./mock-stream";

const EVENT_CAP = 250;

export type ConnectionStatus = "connecting" | "live" | "demo" | "offline";

interface TelemetryState {
  connection: ConnectionStatus;
  events: GuardianEvent[];
  traffic: MetricPoint[];
  health: SystemHealthComponent[];
  servers: McpServer[];
  agents: ConnectedAgent[];
  incidents: Incident[];
  stats: DashboardStats;
  totals: {
    inspected: number;
    blocked: number;
    quarantined: number;
    sanitized: number;
    allowed: number;
    threatsToday: number;
    latencySum: number;
    riskSum: number;
  };
  hydrate: () => void;
  ingest: (event: GuardianEvent) => void;
  setConnection: (c: ConnectionStatus) => void;
}

function emptyStats(): DashboardStats {
  return {
    inspected: 0,
    blocked: 0,
    quarantined: 0,
    sanitized: 0,
    threatsToday: 0,
    avgRiskScore: 0,
    avgLatencyMs: 0,
    activeAgents: 0,
    connectedServers: 0,
    blockRate: 0,
  };
}

export const useTelemetry = create<TelemetryState>((set, get) => ({
  connection: "connecting",
  events: [],
  traffic: [],
  health: [],
  servers: [],
  agents: [],
  incidents: [],
  stats: emptyStats(),
  totals: {
    inspected: 0,
    blocked: 0,
    quarantined: 0,
    sanitized: 0,
    allowed: 0,
    threatsToday: 0,
    latencySum: 0,
    riskSum: 0,
  },

  hydrate: () => {
    if (get().events.length) return; // already hydrated
    const events = seedEvents(40);
    const traffic = seedTrafficSeries(24);
    const servers = seedServers();
    const agents = seedAgents();

    // Build seed totals from the traffic history so the KPIs read as "a real day".
    const base = traffic.reduce(
      (acc, p) => {
        acc.inspected += p.inspected;
        acc.blocked += p.blocked;
        acc.quarantined += p.quarantined;
        acc.sanitized += p.sanitized;
        acc.allowed += p.allowed;
        return acc;
      },
      { inspected: 0, blocked: 0, quarantined: 0, sanitized: 0, allowed: 0 },
    );

    const totals = {
      ...base,
      threatsToday: base.blocked + base.quarantined,
      latencySum: base.inspected * 17,
      riskSum: base.inspected * 11,
    };

    set({
      events,
      traffic,
      servers,
      agents,
      health: seedSystemHealth(),
      incidents: seedIncidents(),
      totals,
      stats: computeStats(totals, agents, servers),
    });
  },

  ingest: (event) => {
    const s = get();
    const events = [event, ...s.events].slice(0, EVENT_CAP);

    const totals = { ...s.totals };
    totals.inspected += 1;
    totals.latencySum += event.latencyMs;
    totals.riskSum += event.riskScore;
    if (event.verdict === "BLOCK") totals.blocked += 1;
    else if (event.verdict === "QUARANTINE") totals.quarantined += 1;
    else if (event.verdict === "SANITIZE") totals.sanitized += 1;
    else totals.allowed += 1;
    if (event.category !== "benign") totals.threatsToday += 1;

    // Roll the latest traffic bucket forward.
    const traffic = [...s.traffic];
    if (traffic.length) {
      const last = { ...traffic[traffic.length - 1] };
      last.inspected += 1;
      if (event.verdict === "BLOCK") last.blocked += 1;
      else if (event.verdict === "QUARANTINE") last.quarantined += 1;
      else if (event.verdict === "SANITIZE") last.sanitized += 1;
      else last.allowed += 1;
      traffic[traffic.length - 1] = last;
    }

    // Promote high-risk events into incidents (dedup by rough title).
    let incidents = s.incidents;
    if (event.riskScore >= 75 && Math.random() < 0.5) {
      incidents = [
        {
          id: `inc_${event.id}`,
          title: incidentTitle(event.category),
          category: event.category,
          severity: event.severity,
          verdict: event.verdict,
          status: "open" as const,
          timestamp: event.timestamp,
          source: event.source,
          affected: [event.target, event.tool].filter(Boolean) as string[],
          riskScore: event.riskScore,
        },
        ...s.incidents,
      ].slice(0, 40);
    }

    set({
      events,
      totals,
      traffic,
      incidents,
      stats: computeStats(totals, s.agents, s.servers),
    });
  },

  setConnection: (connection) => set({ connection }),
}));

function computeStats(
  totals: TelemetryState["totals"],
  agents: ConnectedAgent[],
  servers: McpServer[],
): DashboardStats {
  const inspected = totals.inspected || 1;
  return {
    inspected: totals.inspected,
    blocked: totals.blocked,
    quarantined: totals.quarantined,
    sanitized: totals.sanitized,
    threatsToday: totals.threatsToday,
    avgRiskScore: Math.round((totals.riskSum / inspected) * 10) / 10,
    avgLatencyMs: Math.round((totals.latencySum / inspected) * 10) / 10,
    activeAgents: agents.filter((a) => a.status === "active").length,
    connectedServers: servers.filter((s) => s.status === "connected").length,
    blockRate: Math.round((totals.blocked / inspected) * 1000) / 10,
  };
}

const TITLES: Record<ThreatCategory, string> = {
  prompt_injection: "Prompt injection attempt blocked",
  tool_poisoning: "Poisoned tool payload intercepted",
  pii_leakage: "Outbound PII leak prevented",
  toxicity: "Toxic content flagged",
  policy_violation: "Policy violation held for review",
  encoded_payload: "Encoded exfiltration attempt caught",
  schema_anomaly: "Schema anomaly rejected",
  benign: "Anomalous benign spike",
};
function incidentTitle(c: ThreatCategory) {
  return TITLES[c];
}

/** Selectors */
export function selectCategoryBreakdown(events: GuardianEvent[]) {
  const map = new Map<ThreatCategory, number>();
  for (const e of events) {
    if (e.category === "benign") continue;
    map.set(e.category, (map.get(e.category) ?? 0) + 1);
  }
  return map;
}

export function selectVerdictBreakdown(events: GuardianEvent[]) {
  const map = new Map<Verdict, number>();
  for (const e of events) map.set(e.verdict, (map.get(e.verdict) ?? 0) + 1);
  return map;
}
