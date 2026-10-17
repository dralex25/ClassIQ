# ClassIQ

Dummy-auth lecture shell (slice 1): teacher + student login, one course, join code/link, waiting room, teacher roster. No questions, Present, GPS, CSV, Google auth, or paywall.

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

## Slice 1 API

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

Shared types live in `shared/contract.ts` (`User`, `Course`, `JoinCode`).
