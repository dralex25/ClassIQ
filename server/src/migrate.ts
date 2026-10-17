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

CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  stem TEXT NOT NULL,
  choices JSONB NOT NULL,
  correct_choice_id TEXT NOT NULL,
  position INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS questions_course_position_idx ON questions(course_id, position);

ALTER TABLE courses ADD COLUMN IF NOT EXISTS live_question_id UUID REFERENCES questions(id) ON DELETE SET NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS live_opened_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS submissions (
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  choice_id TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, user_id)
);

CREATE INDEX IF NOT EXISTS submissions_course_question_idx ON submissions(course_id, question_id);

ALTER TABLE courses ADD COLUMN IF NOT EXISTS fence_lat DOUBLE PRECISION;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS fence_lng DOUBLE PRECISION;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS fence_radius_m DOUBLE PRECISION;

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS accuracy DOUBLE PRECISION;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS no_location BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS is_correct BOOLEAN;

CREATE TABLE IF NOT EXISTS presented_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS presented_items_course_opened_idx ON presented_items(course_id, opened_at DESC);

UPDATE submissions s
SET is_correct = (s.choice_id = q.correct_choice_id)
FROM questions q
WHERE q.id = s.question_id AND s.is_correct IS NULL;

INSERT INTO presented_items (course_id, question_id, opened_at, closed_at)
SELECT s.course_id, s.question_id, MIN(s.submitted_at),
       CASE WHEN c.live_question_id = s.question_id THEN NULL ELSE MAX(s.submitted_at) END
FROM submissions s
JOIN courses c ON c.id = s.course_id
WHERE NOT EXISTS (
  SELECT 1 FROM presented_items p
  WHERE p.course_id = s.course_id AND p.question_id = s.question_id
)
GROUP BY s.course_id, s.question_id, c.live_question_id;

INSERT INTO presented_items (course_id, question_id, opened_at)
SELECT c.id, c.live_question_id, COALESCE(c.live_opened_at, now())
FROM courses c
WHERE c.live_question_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM presented_items p
    WHERE p.course_id = c.id AND p.question_id = c.live_question_id AND p.closed_at IS NULL
  );
`

const DEMO_PASSWORD = "password";

async function migrate() {
  await pool.query(SCHEMA);

  if (process.env.SEED_DEMO === "false") {
    console.log("Migration complete (demo seed skipped).");
    await pool.end();
    return;
  }

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

  await pool.query(
    `INSERT INTO users (email, password_hash, name, student_id, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO NOTHING`,
    ["student2@classiq.local", passwordHash, "Riley Student", "S1002", "student"],
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
    [teacherId, "AME 341a Fall 2026", "AME341A"],
  );
  await pool.query(
    `UPDATE courses SET name = $2, join_code = $3 WHERE teacher_id = $1`,
    [teacherId, "AME 341a Fall 2026", "AME341A"],
  );

  console.log("Migration complete.");
  console.log("Demo teacher: teacher@classiq.local / password");
  const course = await pool.query<{ id: string }>(
    `SELECT id FROM courses WHERE teacher_id = $1`,
    [teacherId],
  );
  const courseId = course.rows[0]?.id;
  if (courseId) {
    for (const email of ["student@classiq.local", "student2@classiq.local"]) {
      const u = await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
      if (u.rows[0]) {
        await pool.query(
          `INSERT INTO memberships (course_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [courseId, u.rows[0].id],
        );
      }
    }
    await pool.query(
      `INSERT INTO questions (course_id, stem, choices, correct_choice_id, position)
       SELECT $1, $2, $3::jsonb, $4, 0
       WHERE NOT EXISTS (SELECT 1 FROM questions WHERE course_id = $1)`,
      [
        courseId,
        "What is 2 + 2?",
        JSON.stringify([
          { id: "A", text: "3" },
          { id: "B", text: "4" },
          { id: "C", text: "5" },
        ]),
        "B",
      ],
    );
  }

  console.log("Demo student: student@classiq.local / password (ID S1001)");
  console.log("Demo student 2: student2@classiq.local / password (ID S1002)");
  console.log("Demo join code: AME341A");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
