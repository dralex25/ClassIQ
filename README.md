# ClassIQ

Dummy-auth lecture shell through **slice 2**: teacher + student login, one course, join code/link, waiting room, roster, and teacher **Plan** (multiple-choice questions). No Present, GPS, CSV, Google auth, paywall, LaTeX, or image upload yet.

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
5. Student browser stays on **Waiting for the instructor** (no quiz list yet).

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

Shared types live in `shared/contract.ts` (`User`, `Course`, `JoinCode`, `Question`).
