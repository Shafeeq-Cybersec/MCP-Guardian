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
<<<<<<< HEAD
=======
import {
  fetchStats,
  fetchEvents,
  fetchHealth,
  buildTrafficSeries,
  healthToComponents,
} from "@/lib/api/guardian";
import { ApiError } from "@/lib/api/client";
>>>>>>> origin/main

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
<<<<<<< HEAD
  hydrate: () => void;
=======
  // hydrateMock — always-available fallback used in demo mode.
  hydrateMock: () => void;
  // hydrateFromApi — fetches real data from the backend; falls back to mock on error.
  hydrateFromApi: () => Promise<void>;
  // refreshStats — lightweight poll of /api/stats to keep KPIs current.
  refreshStats: () => Promise<void>;
>>>>>>> origin/main
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

<<<<<<< HEAD
  hydrate: () => {
    if (get().events.length) return; // already hydrated
=======
  // ─── Demo / offline fallback ────────────────────────────────────────────
  hydrateMock: () => {
    if (get().events.length) return;
>>>>>>> origin/main
    const events = seedEvents(40);
    const traffic = seedTrafficSeries(24);
    const servers = seedServers();
    const agents = seedAgents();

<<<<<<< HEAD
    // Build seed totals from the traffic history so the KPIs read as "a real day".
=======
>>>>>>> origin/main
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
<<<<<<< HEAD

=======
>>>>>>> origin/main
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
<<<<<<< HEAD
      stats: computeStats(totals, agents, servers),
    });
  },

=======
      stats: statsFromTotals(totals, agents, servers),
    });
  },

  // ─── Live API hydration ─────────────────────────────────────────────────
  hydrateFromApi: async () => {
    try {
      // Fetch stats, events, and health in parallel.
      const [apiStats, apiEvents, apiHealth] = await Promise.all([
        fetchStats(),
        fetchEvents(250),
        fetchHealth(),
      ]);

      const traffic = buildTrafficSeries(apiEvents);
      const health = healthToComponents(apiHealth);

      // Build incidents from real high-risk events (riskScore ≥ 75).
      const incidents: Incident[] = apiEvents
        .filter((e) => e.riskScore >= 75 && e.category !== "benign")
        .slice(0, 40)
        .map((e) => ({
          id: `inc_${e.id}`,
          title: INCIDENT_TITLES[e.category] ?? "Threat detected",
          category: e.category,
          severity: e.severity,
          verdict: e.verdict,
          status: "open" as const,
          timestamp: e.timestamp,
          source: e.source,
          affected: [e.target, e.tool].filter(Boolean) as string[],
          riskScore: e.riskScore,
        }));

      // Derive in-memory totals from the authoritative /api/stats so the
      // ingest() delta calculations stay consistent.
      const totals = {
        inspected: apiStats.inspected,
        blocked: apiStats.blocked,
        quarantined: apiStats.quarantined,
        sanitized: apiStats.sanitized,
        allowed:
          apiStats.inspected -
          apiStats.blocked -
          apiStats.quarantined -
          apiStats.sanitized,
        threatsToday: apiStats.threatsToday,
        latencySum: apiStats.avgLatencyMs * Math.max(apiStats.inspected, 1),
        riskSum: apiStats.avgRiskScore * Math.max(apiStats.inspected, 1),
      };

      set({
        events: apiEvents,
        traffic,
        health,
        // Servers and agents have no real backend endpoint yet — keep mocks
        // so those panels aren't blank.
        servers: get().servers.length ? get().servers : seedServers(),
        agents: get().agents.length ? get().agents : seedAgents(),
        incidents,
        totals,
        stats: apiStats,
      });
    } catch (err) {
      // Backend unreachable — fall back to mock data silently.
      if (err instanceof ApiError && (err.status === 0 || err.status === 408)) {
        get().hydrateMock();
      }
      // Auth / server errors: leave state empty; the page will show zeros.
    }
  },

  // ─── Lightweight stats refresh (called on a 30s poll) ───────────────────
  refreshStats: async () => {
    try {
      const apiStats = await fetchStats();
      const totals = {
        inspected: apiStats.inspected,
        blocked: apiStats.blocked,
        quarantined: apiStats.quarantined,
        sanitized: apiStats.sanitized,
        allowed:
          apiStats.inspected -
          apiStats.blocked -
          apiStats.quarantined -
          apiStats.sanitized,
        threatsToday: apiStats.threatsToday,
        latencySum: apiStats.avgLatencyMs * Math.max(apiStats.inspected, 1),
        riskSum: apiStats.avgRiskScore * Math.max(apiStats.inspected, 1),
      };
      // Also rebuild traffic from the latest events so the chart stays current.
      const traffic = buildTrafficSeries(get().events);
      set({ stats: apiStats, totals, traffic });
    } catch {
      // Silently skip — stale stats are better than a crash.
    }
  },

  // ─── Live event ingestion (WS stream or demo simulator) ─────────────────
>>>>>>> origin/main
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

<<<<<<< HEAD
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
=======
    // Rebuild the full traffic series from the updated event list so the
    // chart always has correct data regardless of whether hydration has
    // completed yet.  buildTrafficSeries is O(n) over ≤250 events — fast.
    const traffic = buildTrafficSeries(events);

    // Promote high-risk events into incidents.
    let incidents = s.incidents;
    if (event.riskScore >= 75 && event.category !== "benign") {
      incidents = [
        {
          id: `inc_${event.id}`,
          title: INCIDENT_TITLES[event.category] ?? "Threat detected",
>>>>>>> origin/main
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
<<<<<<< HEAD
      stats: computeStats(totals, s.agents, s.servers),
=======
      stats: statsFromTotals(totals, s.agents, s.servers),
>>>>>>> origin/main
    });
  },

  setConnection: (connection) => set({ connection }),
}));

<<<<<<< HEAD
function computeStats(
=======
// ─── Internal helpers ──────────────────────────────────────────────────────

function statsFromTotals(
>>>>>>> origin/main
  totals: TelemetryState["totals"],
  agents: ConnectedAgent[],
  servers: McpServer[],
): DashboardStats {
<<<<<<< HEAD
  const inspected = totals.inspected || 1;
=======
  const n = totals.inspected || 1;
>>>>>>> origin/main
  return {
    inspected: totals.inspected,
    blocked: totals.blocked,
    quarantined: totals.quarantined,
    sanitized: totals.sanitized,
    threatsToday: totals.threatsToday,
<<<<<<< HEAD
    avgRiskScore: Math.round((totals.riskSum / inspected) * 10) / 10,
    avgLatencyMs: Math.round((totals.latencySum / inspected) * 10) / 10,
    activeAgents: agents.filter((a) => a.status === "active").length,
    connectedServers: servers.filter((s) => s.status === "connected").length,
    blockRate: Math.round((totals.blocked / inspected) * 1000) / 10,
  };
}

const TITLES: Record<ThreatCategory, string> = {
=======
    avgRiskScore: Math.round((totals.riskSum / n) * 10) / 10,
    avgLatencyMs: Math.round((totals.latencySum / n) * 10) / 10,
    activeAgents: agents.filter((a) => a.status === "active").length,
    connectedServers: servers.filter((s) => s.status === "connected").length,
    blockRate: Math.round((totals.blocked / n) * 1000) / 10,
  };
}

const INCIDENT_TITLES: Record<ThreatCategory, string> = {
>>>>>>> origin/main
  prompt_injection: "Prompt injection attempt blocked",
  tool_poisoning: "Poisoned tool payload intercepted",
  pii_leakage: "Outbound PII leak prevented",
  toxicity: "Toxic content flagged",
  policy_violation: "Policy violation held for review",
  encoded_payload: "Encoded exfiltration attempt caught",
  schema_anomaly: "Schema anomaly rejected",
  benign: "Anomalous benign spike",
};
<<<<<<< HEAD
function incidentTitle(c: ThreatCategory) {
  return TITLES[c];
}

/** Selectors */
=======

// ─── Selectors ─────────────────────────────────────────────────────────────

>>>>>>> origin/main
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
<<<<<<< HEAD
=======

/**
 * Compute the percentage change between the most recent half of the traffic
 * series and the preceding half.  Used by the overview page to replace the
 * hardcoded delta values with real numbers.
 *
 * Returns null when there is insufficient data (< 4 buckets).
 */
export function selectTrafficDeltas(
  traffic: MetricPoint[],
): {
  inspectedDelta: number | null;
  blockedDelta: number | null;
  quarantinedDelta: number | null;
  riskDelta: number | null;
} {
  if (traffic.length < 4) {
    return { inspectedDelta: null, blockedDelta: null, quarantinedDelta: null, riskDelta: null };
  }

  const mid = Math.floor(traffic.length / 2);
  const prev = traffic.slice(0, mid);
  const curr = traffic.slice(mid);

  const sum = (pts: MetricPoint[], key: keyof MetricPoint) =>
    pts.reduce((a, p) => a + (p[key] as number), 0);

  const pct = (cur: number, old: number): number | null => {
    if (old === 0) return null;
    return Math.round(((cur - old) / old) * 1000) / 10;
  };

  const prevInspected = sum(prev, "inspected");
  const currInspected = sum(curr, "inspected");
  const prevBlocked = sum(prev, "blocked");
  const currBlocked = sum(curr, "blocked");
  const prevQuarantined = sum(prev, "quarantined");
  const currQuarantined = sum(curr, "quarantined");

  return {
    inspectedDelta: pct(currInspected, prevInspected),
    blockedDelta: pct(currBlocked, prevBlocked),
    quarantinedDelta: pct(currQuarantined, prevQuarantined),
    riskDelta: null, // avgRiskScore is a mean, not a sum — can't compute from MetricPoint
  };
}
>>>>>>> origin/main
