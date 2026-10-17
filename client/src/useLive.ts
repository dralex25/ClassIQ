import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { LectureEvent } from "@shared/contract";

function parseLecture(raw: string): LectureEvent | null {
  try {
    const data = JSON.parse(raw) as LectureEvent;
    if (!data || typeof data !== "object" || !("type" in data)) return null;
    if (data.type === "waiting") return data;
    if (data.type === "question_closed" && typeof data.closedAt === "string") return data;
    if (
      data.type === "question_open" &&
      data.question &&
      typeof data.question.stem === "string" &&
      Array.isArray(data.question.choices)
    ) {
      return data;
    }
  } catch {
    /* ignore HMR / garbage frames */
  }
  return null;
}

export function useLive(courseId?: string) {
  const [event, setEvent] = useState<LectureEvent | null>(null);

  const apply = useCallback((next: LectureEvent | null) => {
    if (!next) {
      setEvent(null);
      return;
    }
    const parsed = parseLecture(JSON.stringify(next));
    if (parsed) setEvent(parsed);
  }, []);

  useEffect(() => {
    if (!courseId) return;
    api
      .live(courseId)
      .then((snap) => apply(snap))
      .catch(() => undefined);
  }, [courseId, apply]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 800;

    function connect() {
      if (closed) return;
      if (socket) {
        socket.onclose = null;
        socket.onmessage = null;
        socket.onerror = null;
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      }
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${window.location.host}/live`);
      socket.onmessage = (msg) => {
        const parsed = parseLecture(String(msg.data));
        if (parsed) setEvent(parsed);
      };
      socket.onopen = () => {
        delay = 800;
      };
      socket.onclose = (ev) => {
        if (closed) return;
        if (ev.code === 4401 || ev.code === 4403) return;
        retry = setTimeout(connect, delay);
        delay = Math.min(5_000, delay * 2);
      };
    }

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, []);

  return { event, apply };
}
