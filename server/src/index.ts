import "dotenv/config";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import {
  clearSession,
  createSession,
  mapUser,
  requireAuth,
  requireRole,
  type AuthedRequest,
} from "./auth.js";
import { randomJoinCode } from "./join-code.js";
import type { Course, MeResponse, Question, RosterStudent } from "../../shared/contract.js";
import { parseQuestionBody, questionFromRow } from "./questions.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const clientOrigin = process.env.CLIENT_ORIGIN;

app.use(express.json());
app.use(cookieParser());

if (clientOrigin) {
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", clientOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
}

function courseFromRow(row: {
  id: string;
  name: string;
  join_code: string;
  teacher_id: string;
}): Course {
  return {
    id: row.id,
    name: row.name,
    joinCode: row.join_code,
    teacherId: row.teacher_id,
  };
}

async function courseForUser(userId: string, role: string): Promise<Course | null> {
  if (role === "teacher") {
    const result = await pool.query(
      `SELECT id, name, join_code, teacher_id FROM courses WHERE teacher_id = $1 LIMIT 1`,
      [userId],
    );
    return result.rows[0] ? courseFromRow(result.rows[0]) : null;
  }
  const result = await pool.query(
    `SELECT c.id, c.name, c.join_code, c.teacher_id
     FROM memberships m
     JOIN courses c ON c.id = m.course_id
     WHERE m.user_id = $1
     LIMIT 1`,
    [userId],
  );
  return result.rows[0] ? courseFromRow(result.rows[0]) : null;
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const { email, password, name, role, studentId } = req.body ?? {};
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof name !== "string" ||
    (role !== "teacher" && role !== "student")
  ) {
    res.status(400).json({ error: "email, password, name, and role (teacher|student) are required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  const trimmedStudentId =
    role === "student" && typeof studentId === "string" && studentId.trim()
      ? studentId.trim()
      : null;
  if (role === "student" && !trimmedStudentId) {
    res.status(400).json({ error: "Student ID is required" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, student_id, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role, student_id`,
      [email.trim().toLowerCase(), passwordHash, name.trim(), trimmedStudentId, role],
    );
    const user = mapUser(result.rows[0]);
    await createSession(res, user.id);
    const body: MeResponse = { user, course: null };
    res.status(201).json(body);
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (code === "23505") {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    throw err;
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "email and password are required" });
    return;
  }
  const result = await pool.query(
    `SELECT id, email, name, role, student_id, password_hash FROM users WHERE email = $1`,
    [email.trim().toLowerCase()],
  );
  const row = result.rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  await createSession(res, row.id);
  const user = mapUser(row);
  const course = await courseForUser(user.id, user.role);
  const body: MeResponse = { user, course };
  res.json(body);
});

app.post("/api/auth/logout", async (req, res) => {
  await clearSession(req, res);
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, async (req, res) => {
  const user = (req as AuthedRequest).user;
  const course = await courseForUser(user.id, user.role);
  const body: MeResponse = { user, course };
  res.json(body);
});

app.post("/api/courses", requireAuth, requireRole("teacher"), async (req, res) => {
  const user = (req as AuthedRequest).user;
  const existing = await courseForUser(user.id, "teacher");
  if (existing) {
    res.status(409).json({ error: "Slice 1 supports one course per teacher", course: existing });
    return;
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "Course name is required" });
    return;
  }
  let course: Course | null = null;
  for (let i = 0; i < 8; i++) {
    const joinCode = randomJoinCode();
    try {
      const result = await pool.query(
        `INSERT INTO courses (teacher_id, name, join_code)
         VALUES ($1, $2, $3)
         RETURNING id, name, join_code, teacher_id`,
        [user.id, name, joinCode],
      );
      course = courseFromRow(result.rows[0]);
      break;
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      if (code !== "23505") throw err;
    }
  }
  if (!course) {
    res.status(500).json({ error: "Could not allocate a join code" });
    return;
  }
  res.status(201).json({ course });
});

app.get("/api/courses/mine", requireAuth, async (req, res) => {
  const user = (req as AuthedRequest).user;
  const course = await courseForUser(user.id, user.role);
  res.json({ course });
});

app.get(
  "/api/courses/:id/roster",
  requireAuth,
  requireRole("teacher"),
  async (req, res) => {
    const user = (req as AuthedRequest).user;
    const courseId = req.params.id;
    const owned = await pool.query(
      `SELECT id FROM courses WHERE id = $1 AND teacher_id = $2`,
      [courseId, user.id],
    );
    if (owned.rowCount === 0) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.student_id
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.course_id = $1 AND u.role = 'student'
       ORDER BY u.name`,
      [courseId],
    );
    const roster: RosterStudent[] = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      studentId: row.student_id,
    }));
    res.json({ roster });
  },
);

app.get("/api/join/:code", requireAuth, async (req, res) => {
  const code = String(req.params.code ?? "").trim().toUpperCase();
  const result = await pool.query(
    `SELECT id, name, join_code, teacher_id FROM courses WHERE join_code = $1`,
    [code],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Unknown join code" });
    return;
  }
  res.json({ course: courseFromRow(result.rows[0]) });
});

async function requireOwnedCourse(teacherId: string, courseId: string) {
  const owned = await pool.query(
    `SELECT id FROM courses WHERE id = $1 AND teacher_id = $2`,
    [courseId, teacherId],
  );
  return (owned.rowCount ?? 0) > 0;
}

app.get(
  "/api/courses/:id/questions",
  requireAuth,
  requireRole("teacher"),
  async (req, res) => {
    const user = (req as AuthedRequest).user;
    const courseId = String(req.params.id);
    if (!(await requireOwnedCourse(user.id, courseId))) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    const result = await pool.query(
      `SELECT id, course_id, stem, choices, correct_choice_id, position
       FROM questions WHERE course_id = $1 ORDER BY position, created_at`,
      [courseId],
    );
    const questions: Question[] = result.rows.map(questionFromRow);
    res.json({ questions });
  },
);

app.post(
  "/api/courses/:id/questions",
  requireAuth,
  requireRole("teacher"),
  async (req, res) => {
    const user = (req as AuthedRequest).user;
    const courseId = String(req.params.id);
    if (!(await requireOwnedCourse(user.id, courseId))) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    const parsed = parseQuestionBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const pos = await pool.query<{ n: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM questions WHERE course_id = $1`,
      [courseId],
    );
    const result = await pool.query(
      `INSERT INTO questions (course_id, stem, choices, correct_choice_id, position)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       RETURNING id, course_id, stem, choices, correct_choice_id, position`,
      [courseId, parsed.stem, JSON.stringify(parsed.choices), parsed.correctChoiceId, pos.rows[0].n],
    );
    res.status(201).json({ question: questionFromRow(result.rows[0]) });
  },
);

app.put("/api/questions/:id", requireAuth, requireRole("teacher"), async (req, res) => {
  const user = (req as AuthedRequest).user;
  const found = await pool.query(
    `SELECT q.id, q.course_id FROM questions q
     JOIN courses c ON c.id = q.course_id
     WHERE q.id = $1 AND c.teacher_id = $2`,
    [String(req.params.id), user.id],
  );
  if (found.rowCount === 0) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  const parsed = parseQuestionBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const result = await pool.query(
    `UPDATE questions
     SET stem = $2, choices = $3::jsonb, correct_choice_id = $4, updated_at = now()
     WHERE id = $1
     RETURNING id, course_id, stem, choices, correct_choice_id, position`,
    [String(req.params.id), parsed.stem, JSON.stringify(parsed.choices), parsed.correctChoiceId],
  );
  res.json({ question: questionFromRow(result.rows[0]) });
});

app.delete("/api/questions/:id", requireAuth, requireRole("teacher"), async (req, res) => {
  const user = (req as AuthedRequest).user;
  const found = await pool.query(
    `SELECT q.id FROM questions q
     JOIN courses c ON c.id = q.course_id
     WHERE q.id = $1 AND c.teacher_id = $2`,
    [String(req.params.id), user.id],
  );
  if (found.rowCount === 0) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  await pool.query(`DELETE FROM questions WHERE id = $1`, [String(req.params.id)]);
  res.json({ ok: true });
});

app.post(
  "/api/courses/:id/questions/reorder",
  requireAuth,
  requireRole("teacher"),
  async (req, res) => {
    const user = (req as AuthedRequest).user;
    const courseId = String(req.params.id);
    if (!(await requireOwnedCourse(user.id, courseId))) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.filter((id: unknown) => typeof id === "string")
      : [];
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM questions WHERE course_id = $1`,
      [courseId],
    );
    const have = new Set(existing.rows.map((r) => r.id));
    if (ids.length !== have.size || ids.some((id: string) => !have.has(id))) {
      res.status(400).json({ error: "Reorder must include every question id exactly once" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < ids.length; i++) {
        await client.query(`UPDATE questions SET position = $2, updated_at = now() WHERE id = $1`, [
          ids[i],
          i,
        ]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    const result = await pool.query(
      `SELECT id, course_id, stem, choices, correct_choice_id, position
       FROM questions WHERE course_id = $1 ORDER BY position, created_at`,
      [courseId],
    );
    res.json({ questions: result.rows.map(questionFromRow) });
  },
);

app.post("/api/join", requireAuth, requireRole("student"), async (req, res) => {
  const user = (req as AuthedRequest).user;
  const raw = typeof req.body?.joinCode === "string" ? req.body.joinCode : "";
  const joinCode = raw.trim().toUpperCase();
  if (!joinCode) {
    res.status(400).json({ error: "joinCode is required" });
    return;
  }
  const existing = await courseForUser(user.id, "student");
  if (existing) {
    if (existing.joinCode === joinCode) {
      res.json({ course: existing });
      return;
    }
    res.status(409).json({ error: "Already in a course for this demo", course: existing });
    return;
  }
  const found = await pool.query(
    `SELECT id, name, join_code, teacher_id FROM courses WHERE join_code = $1`,
    [joinCode],
  );
  if (found.rowCount === 0) {
    res.status(404).json({ error: "Unknown join code" });
    return;
  }
  const course = courseFromRow(found.rows[0]);
  await pool.query(
    `INSERT INTO memberships (course_id, user_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [course.id, user.id],
  );
  res.json({ course });
});

const clientDist = path.resolve(process.cwd(), "client/dist");

app.use(express.static(clientDist));
app.get("/{*path}", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    next();
    return;
  }
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`ClassIQ listening on 0.0.0.0:${port}`);
});
