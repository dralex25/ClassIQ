# ClassIQ

Dummy-auth lecture shell through **slice 3**: login, join, roster, teacher **Plan** (MC), teacher **Present** (live question + WebSocket), student submit popup. No GPS, map, banner, CSV, Google auth, or paywall.

**Duplicate submits:** last write wins (same student + question upserts the choice and `submitted_at`).

## Local run

Needs Node 22+ and Postgres. App data lives in Postgres only (no lecture files on disk).

### 1. Start Postgres

```bash
docker compose up -d
```

If you are not using Docker, create a database that matches `.env.example`:

```text
postgres://classiq:classiq@localhost:5432/classiq
```

### 2. Install, migrate, run

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

- UI (Vite): http://localhost:5173
- API: http://localhost:3000 (`0.0.0.0:$PORT`)
- Health: http://localhost:3000/health

Production-style (one process serves the built UI + API):

```bash
npm run build
npm start
```

Then open http://localhost:3000. Render should set `PORT` and `DATABASE_URL`; the process already binds `0.0.0.0`.

## Try login / join (two browsers)

Seeded by `npm run db:migrate`:

| Role | Email | Password | Notes |
| --- | --- | --- | --- |
| Teacher | `teacher@classiq.local` | `password` | Course **Intro Physics**, join code **PHY101** |
| Student | `student@classiq.local` | `password` | Student ID **S1001** |
| Student 2 | `student2@classiq.local` | `password` | Student ID **S1002** (3-browser demo) |

1. Browser A: sign in as the teacher. Copy the join code or join link (`/join/PHY101`).
2. Browser B (or a phone on the same network): sign in as the student, enter `PHY101` (or open the join link).
3. Student lands on **Waiting for the instructor**.
4. Refresh the teacher page: roster shows name, student ID, and email.

You can also register extra dummy accounts from the sign-in screen.

## Try Plan (slice 2)

1. Sign in as the teacher at http://localhost:5173.
2. **Plan** is the default tab. Add a question: stem, 2–6 choices, mark the correct one. Save.
3. Edit, reorder with Up/Down, add another question.
4. Reload the page — the list is still there (Postgres).
5. Student browser stays on **Waiting for the instructor** until Present starts.

## Try Present (slice 3) — three browsers

WebSocket lives on the same Node process (`/ws`, proxied by Vite in dev).

1. **Teacher** at http://localhost:5173 — `teacher@classiq.local` / `password` → **Present**.
2. **Student A** — `student@classiq.local` / `password` (already in PHY101 after migrate).
3. **Student B** — `student2@classiq.local` / `password` (or register another student and join PHY101).
4. Teacher: pick a planned MC (seed includes “What is 2 + 2?”) → **Start**. Board shows stem + choices. Both student waiting screens pop the same modal.
5. Students pick a choice → **Submit**. Teacher count ticks up (“N submitted”). Submit again: last write wins.
6. Teacher **Close** — overlays disappear; waiting returns.

## API

Slice 1:

| Method | Path | Who |
| --- | --- | --- |
| `POST` | `/api/auth/register` | anyone |
| `POST` | `/api/auth/login` | anyone |
| `POST` | `/api/auth/logout` | session |
| `GET` | `/api/me` | session |
| `POST` | `/api/courses` | teacher |
| `GET` | `/api/courses/mine` | session |
| `GET` | `/api/courses/:id/roster` | teacher |
| `GET` | `/api/join/:code` | session |
| `POST` | `/api/join` | student |

Slice 2 (teacher Plan):

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/api/courses/:id/questions` | teacher |
| `POST` | `/api/courses/:id/questions` | teacher |
| `PUT` | `/api/questions/:id` | teacher |
| `DELETE` | `/api/questions/:id` | teacher |
| `POST` | `/api/courses/:id/questions/reorder` | teacher |

Slice 3 (Present + submit):

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/api/courses/:id/live` | member |
| `POST` | `/api/courses/:id/present/open` | teacher |
| `POST` | `/api/courses/:id/present/close` | teacher |
| `POST` | `/api/submit` | student |
| WS | `/ws` | session; room = course |

Shared types live in `shared/contract.ts` (`User`, `Course`, `JoinCode`, `Question`, `LectureEvent`, `Submission`).
