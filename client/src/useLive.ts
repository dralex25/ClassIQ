import { useEffect, useState } from "react";
import type { LectureEvent } from "@shared/contract";

export function useLive() {
  const [event, setEvent] = useState<LectureEvent | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      ws.onmessage = (msg) => {
        try {
          setEvent(JSON.parse(String(msg.data)) as LectureEvent);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (closed) return;
        retry = setTimeout(connect, 800);
      };
    }

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return event;
}
