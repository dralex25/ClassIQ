import type { IncomingMessage, Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { LectureEvent } from "../../shared/contract.js";
import { pool } from "./db.js";
import { sessionIdFromCookieHeader, userFromSessionId } from "./auth.js";
import { questionFromRow, toPublicQuestion } from "./questions.js";

const rooms = new Map<string, Set<WebSocket>>();

export async function courseIdForUser(userId: string, role: string): Promise<string | null> {
  if (role === "teacher") {
    const result = await pool.query(`SELECT id FROM courses WHERE teacher_id = $1 LIMIT 1`, [userId]);
    return result.rows[0]?.id ?? null;
  }
  const result = await pool.query(
    `SELECT course_id FROM memberships WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.course_id ?? null;
}

export async function submitCount(questionId: string): Promise<number> {
  const result = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM submissions WHERE question_id = $1`,
    [questionId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

export async function buildSnapshot(courseId: string): Promise<LectureEvent> {
  const live = await pool.query<{ live_question_id: string | null; live_opened_at: Date | null }>(
    `SELECT live_question_id, live_opened_at FROM courses WHERE id = $1`,
    [courseId],
  );
  const row = live.rows[0];
  if (!row?.live_question_id || !row.live_opened_at) {
    return { type: "waiting" };
  }
  const q = await pool.query(
    `SELECT id, course_id, stem, choices, correct_choice_id, position FROM questions WHERE id = $1`,
    [row.live_question_id],
  );
  if (q.rowCount === 0) {
    return { type: "waiting" };
  }
  return {
    type: "question_open",
    question: toPublicQuestion(questionFromRow(q.rows[0])),
    openedAt: row.live_opened_at.toISOString(),
    submitCount: await submitCount(row.live_question_id),
  };
}

export function broadcastToCourse(courseId: string, event: LectureEvent) {
  const sockets = rooms.get(courseId);
  if (!sockets) return;
  const payload = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    }
  }
}

export async function pushSnapshot(courseId: string) {
  broadcastToCourse(courseId, await buildSnapshot(courseId));
}

function addSocket(courseId: string, socket: WebSocket) {
  let set = rooms.get(courseId);
  if (!set) {
    set = new Set();
    rooms.set(courseId, set);
  }
  set.add(socket);
}

function removeSocket(courseId: string, socket: WebSocket) {
  const set = rooms.get(courseId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) rooms.delete(courseId);
}

export function attachLive(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    void (async () => {
      const user = await userFromSessionId(sessionIdFromCookieHeader(req.headers.cookie));
      if (!user) {
        socket.close(4401, "Not signed in");
        return;
      }
      const courseId = await courseIdForUser(user.id, user.role);
      if (!courseId) {
        socket.close(4403, "No course");
        return;
      }
      addSocket(courseId, socket);
      socket.send(JSON.stringify(await buildSnapshot(courseId)));
      socket.on("close", () => removeSocket(courseId, socket));
    })();
  });
}
