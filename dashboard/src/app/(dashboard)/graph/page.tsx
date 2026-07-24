"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Users, Bot, Server, ShieldCheck, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { PageHeader, Panel } from "@/components/dashboard/primitives";
import { GuardianMark } from "@/components/brand/logo";
import { useTelemetry } from "@/features/telemetry/store";
import { cn, createListKey } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 *  Bespoke attack-propagation graph.
 *  A hand-built SVG edge layer beneath absolutely-positioned node cards -
 *  fully deterministic, with animated flow, threat highlighting, and hover
 *  focus. The marketing mini-graph uses React Flow; this view is custom for
 *  pixel control over the security narrative.
 * ------------------------------------------------------------------ */

type Kind = "user" | "agent" | "guardian" | "tool";
type Risk = "clean" | "warning" | "danger";

interface GNode {
  id: string;
  label: string;
  sub: string;
  kind: Kind;
  x: number;
  y: number;
  risk?: Risk;
}

interface GEdge {
  from: string;
  to: string;
  threat?: boolean;
}

const NW = 176;
const NH = 60;
const GW = 132;
const GH = 108;

const NODES: GNode[] = [
  { id: "u1", label: "Users", sub: "prompts", kind: "user", x: 40, y: 90 },
  { id: "u2", label: "API clients", sub: "sessions", kind: "user", x: 40, y: 300, risk: "warning" },
  { id: "a1", label: "orchestrator-01", sub: "claude-opus-4.8", kind: "agent", x: 320, y: 40 },
  { id: "a2", label: "support-copilot", sub: "sonnet-5", kind: "agent", x: 320, y: 190 },
  { id: "a3", label: "research-agent", sub: "quarantined", kind: "agent", x: 320, y: 340, risk: "danger" },
  { id: "g", label: "Guardian", sub: "inline firewall", kind: "guardian", x: 640, y: 186 },
  { id: "t1", label: "filesystem-mcp", sub: "stdio", kind: "tool", x: 900, y: 30 },
  { id: "t2", label: "github-mcp", sub: "http", kind: "tool", x: 900, y: 150 },
  { id: "t3", label: "postgres-mcp", sub: "sse", kind: "tool", x: 900, y: 270 },
  { id: "t4", label: "vault-mcp", sub: "error", kind: "tool", x: 900, y: 390, risk: "danger" },
];

const EDGES: GEdge[] = [
  { from: "u1", to: "a1" },
  { from: "u1", to: "a2" },
  { from: "u2", to: "a3", threat: true },
  { from: "a1", to: "g" },
  { from: "a2", to: "g" },
  { from: "a3", to: "g", threat: true },
  { from: "g", to: "t1" },
  { from: "g", to: "t2" },
  { from: "g", to: "t3" },
  { from: "g", to: "t4", threat: true },
];

const CANVAS_W = 1108;
const CANVAS_H = 470;

function dims(n: GNode) {
  return n.kind === "guardian" ? { w: GW, h: GH } : { w: NW, h: NH };
}
/** right-middle anchor (output) */
function outPoint(n: GNode) {
  const d = dims(n);
  return { x: n.x + d.w, y: n.y + d.h / 2 };
}
/** left-middle anchor (input) */
function inPoint(n: GNode) {
  const d = dims(n);
  return { x: n.x, y: n.y + d.h / 2 };
}

export default function GraphPage() {
  const blocked = useTelemetry((s) => s.stats.blocked);
  const [hover, setHover] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(1);

  const byId = React.useMemo(() => Object.fromEntries(NODES.map((n) => [n.id, n])), []);

  const edgeActive = (e: GEdge) =>
    hover === null || hover === e.from || hover === e.to;

  return (
    <>
      <PageHeader
        title="Attack Propagation Graph"
        description="Trace how threats move across users, agents, Guardian, and MCP tools."
      />

      <Panel contentClassName="p-0">
        <div className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-3 text-xs text-muted">
          <Legend color="var(--primary)" label="Clean flow" />
          <Legend color="var(--block)" label="Attack path (contained)" />
          <Legend color="var(--quarantine)" label="At-risk node" />
          <span className="ml-auto flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-allow" />
            {blocked} attacks contained
          </span>
        </div>

        <div className="relative h-[560px] w-full overflow-hidden bg-dots">
          {/* zoom controls */}
          <div className="absolute right-4 top-4 z-20 flex flex-col gap-1 rounded-lg border border-border bg-card/80 p-1 backdrop-blur">
            <IconBtn onClick={() => setZoom((z) => Math.min(z + 0.15, 1.6))} label="Zoom in"><ZoomIn className="size-4" /></IconBtn>
            <IconBtn onClick={() => setZoom((z) => Math.max(z - 0.15, 0.6))} label="Zoom out"><ZoomOut className="size-4" /></IconBtn>
            <IconBtn onClick={() => setZoom(1)} label="Reset"><Maximize className="size-4" /></IconBtn>
          </div>

          <div
            className="absolute left-1/2 top-1/2 origin-center transition-transform duration-300"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              transform: `translate(-50%, -50%) scale(${zoom})`,
            }}
          >
            {/* edges */}
            <svg
              width={CANVAS_W}
              height={CANVAS_H}
              className="absolute inset-0 overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="edge-clean" x1="0" x2="1">
                  <stop offset="0" stopColor="color-mix(in oklch, var(--primary) 20%, transparent)" />
                  <stop offset="1" stopColor="var(--primary)" />
                </linearGradient>
                <linearGradient id="edge-threat" x1="0" x2="1">
                  <stop offset="0" stopColor="color-mix(in oklch, var(--block) 30%, transparent)" />
                  <stop offset="1" stopColor="var(--block)" />
                </linearGradient>
              </defs>

              {EDGES.map((e) => {
                const a = outPoint(byId[e.from]);
                const b = inPoint(byId[e.to]);
                const midX = (a.x + b.x) / 2;
                const d = `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
                const active = edgeActive(e);
                return (
                  <g key={`${e.from}-${e.to}`} style={{ opacity: active ? 1 : 0.15, transition: "opacity 0.25s" }}>
                    <path
                      d={d}
                      fill="none"
                      stroke={e.threat ? "url(#edge-threat)" : "url(#edge-clean)"}
                      strokeWidth={e.threat ? 2 : 1.5}
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke={e.threat ? "var(--block)" : "var(--primary-bright)"}
                      strokeWidth={e.threat ? 2.5 : 2}
                      strokeLinecap="round"
                      strokeDasharray="4 10"
                      className="[animation:dash_1.2s_linear_infinite]"
                      style={{ opacity: 0.9 }}
                    />
                    {e.threat && (
                      <text x={midX} y={(a.y + b.y) / 2 - 6} textAnchor="middle" className="fill-block text-[10px] font-semibold">
                        attack
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* nodes */}
            {NODES.map((n, index) => (
              <NodeCard
                key={createListKey(n, index)}
                node={n}
                dimmed={hover !== null && hover !== n.id && !isNeighbor(n.id, hover)}
                onHover={setHover}
              />
            ))}
          </div>

          <style>{`@keyframes dash { to { stroke-dashoffset: -28; } }`}</style>
        </div>
      </Panel>
    </>
  );
}

function isNeighbor(id: string, other: string) {
  return EDGES.some(
    (e) => (e.from === id && e.to === other) || (e.to === id && e.from === other),
  );
}

function NodeCard({
  node,
  dimmed,
  onHover,
}: {
  node: GNode;
  dimmed: boolean;
  onHover: (id: string | null) => void;
}) {
  const d = dims(node);
  const Icon = node.kind === "user" ? Users : node.kind === "agent" ? Bot : Server;
  const risk = node.risk ?? "clean";
  const ring =
    risk === "danger"
      ? "border-block/60 shadow-[0_0_28px_-6px_var(--block)]"
      : risk === "warning"
        ? "border-quarantine/50 shadow-[0_0_22px_-8px_var(--quarantine)]"
        : "border-border";
  const iconColor =
    risk === "danger" ? "var(--block)" : risk === "warning" ? "var(--quarantine)" : "var(--primary-bright)";

  if (node.kind === "guardian") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: dimmed ? 0.4 : 1, scale: 1 }}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(null)}
        className="glow-primary absolute flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-primary/40 bg-primary/10 backdrop-blur"
        style={{ left: node.x, top: node.y, width: d.w, height: d.h }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div
            className="animate-scan absolute inset-x-0 h-10 opacity-60"
            style={{ background: "linear-gradient(to bottom, transparent, color-mix(in oklch, var(--primary) 30%, transparent), transparent)" }}
          />
        </div>
        <GuardianMark className="size-8" animated />
        <div className="text-center">
          <div className="text-sm font-semibold text-foreground">Guardian</div>
          <div className="text-[0.65rem] text-primary-bright">{node.sub}</div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: dimmed ? 0.4 : 1, y: 0 }}
      whileHover={{ scale: 1.03 }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "absolute flex cursor-pointer items-center gap-3 rounded-xl border bg-card/90 px-3.5 backdrop-blur-sm",
        ring,
      )}
      style={{ left: node.x, top: node.y, width: d.w, height: d.h }}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface" style={{ color: iconColor }}>
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{node.label}</div>
        <div className="truncate font-mono text-[0.65rem] text-subtle">{node.sub}</div>
      </div>
      {risk === "danger" && (
        <span className="absolute -right-1 -top-1 flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-block opacity-70" />
          <span className="relative inline-flex size-3 rounded-full bg-block" />
        </span>
      )}
    </motion.div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground"
    >
      {children}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-0.5 w-5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
