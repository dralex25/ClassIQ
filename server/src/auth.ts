import type { Request, Response, NextFunction } from "express";
import { pool } from "./db.js";
import type { User, UserRole } from "../../shared/contract.js";

const COOKIE = "classiq_session";
const SESSION_DAYS = 14;

export type AuthedRequest = Request & { user: User };

export function cookieName() {
  return COOKIE;
}

export async function createSession(res: Response, userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO sessions (user_id, expires_at) VALUES ($1, $2) RETURNING id`,
    [userId, expiresAt],
  );
  res.cookie(COOKIE, result.rows[0].id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function clearSession(req: Request, res: Response) {
  const id = req.cookies?.[COOKIE];
  if (id) {
    await pool.query(`DELETE FROM sessions WHERE id = $1`, [id]);
  }
  res.clearCookie(COOKIE, { path: "/" });
}

export function mapUser(row: {
  id: string;
  email: string;
  name: string;
  role: string;
  student_id: string | null;
}): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    studentId: row.student_id,
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const id = req.cookies?.[COOKIE];
  if (!id) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  const result = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.student_id
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [id],
  );
  if (result.rowCount === 0) {
    res.clearCookie(COOKIE, { path: "/" });
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  (req as AuthedRequest).user = mapUser(result.rows[0]);
  next();
}

export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthedRequest).user;
    if (!user || user.role !== role) {
      res.status(403).json({ error: `Requires ${role}` });
      return;
    }
    next();
  };
}
