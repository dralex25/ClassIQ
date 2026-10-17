import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { PlanPanel } from "./PlanPanel";
import { PresentPanel } from "./PresentPanel";
import { pingLocation } from "./pingLocation";
import { useLive } from "./useLive";
import type { Course, MeResponse, RosterStudent, User } from "@shared/contract";

export default function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="shell">
        <p className="hint">Loading…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home me={me} setMe={setMe} />} />
      <Route path="/join/:code" element={<JoinLink me={me} setMe={setMe} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Home({
  me,
  setMe,
}: {
  me: MeResponse | null;
  setMe: (me: MeResponse | null) => void;
}) {
  if (!me) return <AuthScreen onAuthed={setMe} />;
  if (me.user.role === "teacher") return <TeacherHome me={me} setMe={setMe} />;
  if (!me.course) return <StudentJoin me={me} setMe={setMe} />;
  return <WaitingRoom me={me} setMe={setMe} />;
}

function Brand({ user, onLogout }: { user?: User; onLogout?: () => void }) {
  return (
    <header className="brand">
      <h1>ClassIQ</h1>
      {user && onLogout && (
        <button className="secondary" type="button" onClick={onLogout}>
          Sign out {user.name}
        </button>
      )}
    </header>
  );
}

function AuthScreen({
  onAuthed,
  embedded = false,
  defaultEmail = "teacher@classiq.local",
}: {
  onAuthed: (me: MeResponse) => void;
  embedded?: boolean;
  defaultEmail?: string;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("password");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"teacher" | "student">("teacher");
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me =
        mode === "login"
          ? await api.login(email, password)
          : await api.register({
              email,
              password,
              name,
              role,
              studentId: role === "student" ? studentId : undefined,
            });
      onAuthed(me);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <>
      <h2>{mode === "login" ? "Sign in" : "Create dummy account"}</h2>
      <p className="hint">
        Demo teacher: <code>teacher@classiq.local</code> / <code>password</code>
        <br />
        Demo student: <code>student@classiq.local</code> / <code>password</code>
      </p>
      <form onSubmit={submit}>
        {mode === "register" && (
          <>
            <label htmlFor="name">Name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            <label htmlFor="role">Role</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value as "teacher" | "student")}>
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
            </select>
            {role === "student" && (
              <>
                <label htmlFor="studentId">Student ID</label>
                <input
                  id="studentId"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  required
                />
              </>
            )}
          </>
        )}
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" disabled={busy}>
            {mode === "login" ? "Sign in" : "Register"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
          >
            {mode === "login" ? "Need an account?" : "Have an account?"}
          </button>
        </div>
      </form>
    </>
  );

  if (embedded) return form;

  return (
    <div className="shell">
      <Brand />
      <div className="card">{form}</div>
    </div>
  );
}

async function logout(setMe: (me: MeResponse | null) => void) {
  await api.logout().catch(() => undefined);
  setMe(null);
}

function TeacherHome({
  me,
  setMe,
}: {
  me: MeResponse;
  setMe: (me: MeResponse | null) => void;
}) {
  const [name, setName] = useState("Intro Physics");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"plan" | "present" | "analytics" | "class">("present");
  const [roster, setRoster] = useState<RosterStudent[] | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    if (!me.course) return;
    api.roster(me.course.id).then((r) => setRoster(r.roster)).catch(() => setRoster([]));
  }, [me.course]);

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { course } = await api.createCourse(name);
      setMe({ ...me, course });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  const joinLink = me.course ? `${window.location.origin}/join/${me.course.joinCode}` : "";

  return (
    <div className="shell">
      <Brand user={me.user} onLogout={() => logout(setMe)} />
      {!me.course ? (
        <div className="card">
          <h2>Create your course</h2>
          <p className="hint">Slice 1 is one course per teacher. Students join with a code or link.</p>
          <form onSubmit={createCourse}>
            <label htmlFor="courseName">Course name</label>
            <input id="courseName" value={name} onChange={(e) => setName(e.target.value)} required />
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button type="submit">Create course</button>
            </div>
          </form>
        </div>
      ) : (
        <>
          <div className="tabs">
            <button type="button" className={tab === "plan" ? "" : "secondary"} onClick={() => setTab("plan")}>
              Plan
            </button>
            <button type="button" className={tab === "present" ? "" : "secondary"} onClick={() => setTab("present")}>
              Present
            </button>
            <button type="button" className={tab === "analytics" ? "" : "secondary"} onClick={() => setTab("analytics")}>
              Analytics
            </button>
            <button type="button" className={tab === "class" ? "" : "secondary"} onClick={() => setTab("class")}>
              Class
            </button>
          </div>
          {tab === "plan" && <PlanPanel courseId={me.course.id} />}
          {tab === "present" && <PresentPanel courseId={me.course.id} />}
          {tab === "analytics" && <AnalyticsPanel courseId={me.course.id} />}
          {tab === "class" && (
          <>
          <div className="card">
            <h2>{me.course.name}</h2>
            <p className="hint">Share this code. Students land in the waiting room.</p>
            <div className="code">{me.course.joinCode}</div>
            <p>
              Join link: <a href={joinLink}>{joinLink}</a>
            </p>
            <div className="row">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(me.course!.joinCode);
                  setCopied("code");
                }}
              >
                {copied === "code" ? "Copied code" : "Copy join code"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(joinLink);
                  setCopied("link");
                }}
              >
                {copied === "link" ? "Copied link" : "Copy join link"}
              </button>
            </div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <h3>Roster</h3>
            {!roster || roster.length === 0 ? (
              <p className="hint">No students yet. Have someone join with the code.</p>
            ) : (
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Student ID</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.studentId ?? "—"}</td>
                      <td>{s.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          </>
          )}
        </>
      )}
    </div>
  );
}

function StudentJoin({
  me,
  setMe,
}: {
  me: MeResponse;
  setMe: (me: MeResponse | null) => void;
}) {
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { course } = await api.join(joinCode);
      setMe({ ...me, course });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <Brand user={me.user} onLogout={() => logout(setMe)} />
      <div className="card">
        <h2>Join a course</h2>
        <form onSubmit={submit}>
          <label htmlFor="joinCode">Join code</label>
          <input
            id="joinCode"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="PHY101"
            required
          />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button type="submit" disabled={busy}>
              Join
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WaitingRoom({
  me,
  setMe,
}: {
  me: MeResponse;
  setMe: (me: MeResponse | null) => void;
}) {
  const live = useLive();
  const open = live?.type === "question_open" ? live : null;
  const [choiceId, setChoiceId] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void pingLocation();
  }, []);

  useEffect(() => {
    setChoiceId("");
    setSaved(null);
    setError(null);
    if (open) void pingLocation();
  }, [open?.question.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!choiceId) return;
    setBusy(true);
    setError(null);
    try {
      const geo = await pingLocation();
      const result = await api.submit(choiceId, geo);
      setSaved(result.submittedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <Brand user={me.user} onLogout={() => logout(setMe)} />
      <div className="card waiting">
        <div className="pulse" />
        <h2>Waiting for the instructor</h2>
        <p className="hint">
          You are in <strong>{me.course?.name}</strong>. A question popup will appear when class
          starts.
        </p>
      </div>
      {open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="live-q">
          <div className="card modal">
            <h2 id="live-q">{open.question.stem}</h2>
            <form onSubmit={submit}>
              {open.question.choices.map((c) => (
                <label key={c.id} className="choice-option">
                  <input
                    type="radio"
                    name="choice"
                    value={c.id}
                    checked={choiceId === c.id}
                    onChange={() => setChoiceId(c.id)}
                  />
                  <span>
                    <strong>{c.id}.</strong> {c.text}
                  </span>
                </label>
              ))}
              {error && <p className="error">{error}</p>}
              {saved && (
                <p className="hint">
                  Saved {new Date(saved).toLocaleTimeString()} (you can change and submit again).
                </p>
              )}
              <div className="row">
                <button type="submit" disabled={!choiceId || busy}>
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function JoinLink({
  me,
  setMe,
}: {
  me: MeResponse | null;
  setMe: (me: MeResponse | null) => void;
}) {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    if (me.user.role !== "student") {
      navigate("/", { replace: true });
      return;
    }
    if (me.course) {
      navigate("/", { replace: true });
      return;
    }
    api
      .join(code)
      .then(({ course }) => {
        setMe({ ...me, course });
        navigate("/", { replace: true });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not join"));
  }, [me, code, navigate, setMe, location.pathname]);

  if (!me) {
    return (
      <div className="shell">
        <Brand />
        <div className="card">
          <h2>Join {code.toUpperCase()}</h2>
          <p className="hint">Sign in as a student, then this link will enroll you.</p>
          <AuthScreen onAuthed={setMe} embedded defaultEmail="student@classiq.local" />
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <Brand user={me.user} onLogout={() => logout(setMe)} />
      <div className="card">
        {error ? <p className="error">{error}</p> : <p className="hint">Joining {code}…</p>}
      </div>
    </div>
  );
}
