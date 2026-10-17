# ClassIQ

Dummy-auth lecture shell: login, join, roster, **Plan** (MC + teacher-only geofence), **Present** (class board, no fence), **Analytics** (answers + CSV), student **Classroom** / **Gradebook**, auto-grade, silent location log. No homework, Google auth, or paywall. Students never see the geofence.

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
| Teacher | `teacher@classiq.local` | `password` | Course **AME 341a Fall 2026**, join code **AME341A** |
| Student | `student@classiq.local` | `password` | Student ID **S1001** |
| Student 2 | `student2@classiq.local` | `password` | Student ID **S1002** (3-browser demo) |

1. Browser A: sign in as the teacher. Copy the join code or join link (`/join/AME341A`).
2. Browser B (or a phone on the same network): sign in as the student, enter `AME341A` (or open the join link).
3. Student lands in **Classroom** (bottom nav: Classroom / Gradebook).
4. Refresh the teacher page: roster shows name, student ID, and email.

You can also register extra dummy accounts from the sign-in screen.

## Try Plan (slice 2)

1. Sign in as the teacher at http://localhost:5173.
2. **Plan** is the default tab. Add a question: stem, 2–6 choices, mark the correct one. Save.
3. Edit, reorder with Up/Down, add another question.
4. Reload the page — the list is still there (Postgres).
5. Student browser stays on Classroom (“We’ll notify you when something has been presented”) until Present starts.

## Try Present (slice 3) — three browsers

WebSocket lives on the same Node process (`/ws`, proxied by Vite in dev).

1. **Teacher** at http://localhost:5173 — `teacher@classiq.local` / `password` → **Present**.
2. **Student A** — `student@classiq.local` / `password` (already in AME341A after migrate).
3. **Student B** — `student2@classiq.local` / `password` (or register another student and join AME341A).
4. Teacher: pick a planned MC (seed includes “What is 2 + 2?”) → **Start**. Board shows stem + choices. Both student Classroom screens pop the same modal.
5. Students pick a choice → **Submit**. A ✓ appears; they can **Close** the modal and reopen it to change the answer. Last write wins. Teacher count ticks up.
6. Teacher **Close** — overlays disappear. Students open **Gradebook** for auto-scored items (1/1 ✓, 0/1 ✗, or no submission). Prior answers also remain on `GET /api/me/history`.
7. Teacher **Analytics** → **Export CSV** for answers + presence.

## Geofence (Plan) and Analytics

The fence is configured in **Plan**, never on the Present board (that view is for the class). Live events do not include fence coordinates.

1. Teacher → **Plan** → **Geofence**. Click the map to pin, set radius (~150 m).
2. **Present** → Start a question. Students only see stem + choices.
3. In-room: http://localhost:5173/?mockGeo=42.3601,-71.0589,12 — `student@classiq.local`
4. Dorm: http://localhost:5173/?mockGeo=42.3736,-71.1097,25 — `student2@classiq.local`
5. Both submit. Teacher → **Analytics**: choice counts, answer table (name, ID, choice, presence), map of dots.

Location is still logged on submit for Analytics. Submit is never blocked for geo.

## API

Slice 1:

| Method | Path | Who |
| --- | --- | --- |
| `POST` | `/api/auth/register` | anyone |
| `POST` | `/api/auth/login` | anyone |
| `POST` | `/api/auth/logout` | session |
| `GET` | `/api/me` | session |
| `GET` | `/api/me/history` | student |
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
| `POST` | `/api/submit` | student (optional lat/lng/accuracy or `noLocation`; never rejected for geo) |
| WS | `/ws` | session; room = course |

Slice 4 (fence + logged pings):

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/api/courses/:id/fence` | teacher |
| `PUT` | `/api/courses/:id/fence` | teacher |
| `GET` | `/api/courses/:id/submissions` | teacher |

Student gradebook / CSV:

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/api/me/history` | student (own answers, no key) |
| `GET` | `/api/me/gradebook` | student (presented items + auto-score) |
| `GET` | `/api/courses/:id/export.csv` | teacher |

Shared types live in `shared/contract.ts` and `shared/geo.ts`. Presence buckets: in / out / uncertain / no-location. Gradebook possible points = presented questions; scored = correct submits.
