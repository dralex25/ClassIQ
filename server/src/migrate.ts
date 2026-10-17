import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  student_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  join_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
`;

const DEMO_PASSWORD = "password";

async function migrate() {
  await pool.query(SCHEMA);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await pool.query(
    `INSERT INTO users (email, password_hash, name, student_id, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO NOTHING`,
    ["teacher@classiq.local", passwordHash, "Alex Teacher", null, "teacher"],
  );

  await pool.query(
    `INSERT INTO users (email, password_hash, name, student_id, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO NOTHING`,
    ["student@classiq.local", passwordHash, "Jamie Student", "S1001", "student"],
  );

  const teacher = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    ["teacher@classiq.local"],
  );
  const teacherId = teacher.rows[0].id;

  await pool.query(
    `INSERT INTO courses (teacher_id, name, join_code)
     SELECT $1, $2, $3
     WHERE NOT EXISTS (SELECT 1 FROM courses WHERE teacher_id = $1)`,
    [teacherId, "Intro Physics", "PHY101"],
  );

  console.log("Migration complete.");
  console.log("Demo teacher: teacher@classiq.local / password");
  console.log("Demo student: student@classiq.local / password (ID S1001)");
  console.log("Demo join code: PHY101");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
