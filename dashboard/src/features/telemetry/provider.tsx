"use client";

import * as React from "react";
import { useTelemetry } from "./store";
import { generateEvent } from "./mock-stream";
import { DEMO_MODE, WS_URL } from "@/lib/api/config";
import type { GuardianEvent } from "@/lib/types";

function getTelemetrySeeded() {
  return typeof window !== "undefined" && window.sessionStorage.getItem("mcg-telemetry-seeded") === "1";
}

/**
 * Drives the live telemetry. In explicit demo mode it runs the in-browser
 * simulator with a naturally jittered cadence. Otherwise it connects to the
 * live backend WebSocket and stays in live/offline mode instead of falling back
 * to mocked events.
 */
export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useTelemetry((s) => s.hydrate);
  const ingest = useTelemetry((s) => s.ingest);
  const setConnection = useTelemetry((s) => s.setConnection);

  React.useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const clearTimers = () => {
      if (timer) clearTimeout(timer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };

    const runSimulator = () => {
      setConnection("demo");
      if (!getTelemetrySeeded()) hydrate();
      const tick = () => {
        if (stopped) return;
        // burst occasionally to feel like real traffic
        const burst = Math.random() < 0.15 ? 3 : 1;
        for (let i = 0; i < burst; i++) ingest(generateEvent());
        timer = setTimeout(tick, 700 + Math.random() * 1600);
      };
      tick();
    };

    const connectLiveStream = () => {
      if (stopped) return;
      setConnection("connecting");

      try {
        ws = new WebSocket(WS_URL);
        const connectTimeout = setTimeout(() => {
          if (ws && ws.readyState !== WebSocket.OPEN) {
            ws.close();
            setConnection("offline");
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
          setConnection("offline");
        };
        ws.onclose = () => {
          if (!stopped) {
            setConnection("offline");
            reconnectTimer = setTimeout(connectLiveStream, 2000);
          }
        };
      } catch {
        setConnection("offline");
        reconnectTimer = setTimeout(connectLiveStream, 2000);
      }
    };

    if (DEMO_MODE) {
      hydrate();
      runSimulator();
    } else {
      connectLiveStream();
    }

    return () => {
      stopped = true;
      clearTimers();
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
