"use client";

import * as React from "react";
import { useTelemetry } from "./store";
import { generateEvent } from "./mock-stream";
import { DEMO_MODE, WS_URL } from "@/lib/api/config";
import type { GuardianEvent } from "@/lib/types";

/**
 * Drives the live telemetry. In demo mode it runs the in-browser simulator with
 * a naturally jittered cadence. When a backend is configured it connects to the
 * WebSocket stream and falls back to the simulator if the socket fails.
 */
export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useTelemetry((s) => s.hydrate);
  const ingest = useTelemetry((s) => s.ingest);
  const setConnection = useTelemetry((s) => s.setConnection);

  React.useEffect(() => {
    hydrate();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let ws: WebSocket | null = null;

    const runSimulator = () => {
      setConnection("demo");
      const tick = () => {
        if (stopped) return;
        // burst occasionally to feel like real traffic
        const burst = Math.random() < 0.15 ? 3 : 1;
        for (let i = 0; i < burst; i++) ingest(generateEvent());
        timer = setTimeout(tick, 700 + Math.random() * 1600);
      };
      tick();
    };

    if (DEMO_MODE) {
      runSimulator();
    } else {
      setConnection("connecting");
      try {
        ws = new WebSocket(WS_URL);
        const connectTimeout = setTimeout(() => {
          if (ws && ws.readyState !== WebSocket.OPEN) {
            ws.close();
            runSimulator();
          }
        }, 3000);

        ws.onopen = () => {
          clearTimeout(connectTimeout);
          setConnection("live");
        };
        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data) as GuardianEvent;
            ingest(data);
          } catch {
            /* ignore malformed frames */
          }
        };
        ws.onerror = () => {
          clearTimeout(connectTimeout);
        };
        ws.onclose = () => {
          if (!stopped) runSimulator();
        };
      } catch {
        runSimulator();
      }
    }

    return () => {
      stopped = true;
      clearTimeout(timer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
