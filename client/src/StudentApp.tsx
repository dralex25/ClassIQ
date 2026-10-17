import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import { pingLocation } from "./pingLocation";
import { useLive } from "./useLive";
import type { Course, Gradebook, GradebookItem, MeResponse } from "@shared/contract";

export function StudentApp({
  me,
  setMe,
}: {
  me: MeResponse & { course: Course };
  setMe: (me: MeResponse | null) => void;
}) {
  const [tab, setTab] = useState<"classroom" | "gradebook">("classroom");

  return (
    <div className="student-app">
      <header className="student-top">
        <div>
          <h1>{tab === "classroom" ? "Classroom" : "Gradebook"}</h1>
          <p className="course-sub">{me.course.name}</p>
          <p className="course-sub">
            Course Code: {me.course.joinCode}
            <span className="join-chip">Join {me.course.joinCode}</span>
          </p>
        </div>
        <button
          className="secondary"
          type="button"
          onClick={async () => {
            await api.logout().catch(() => undefined);
            setMe(null);
          }}
        >
          {me.user.name}
        </button>
      </header>
      {tab === "classroom" ? <Classroom me={me} /> : <GradebookView refreshKey={tab} />}
      <nav className="student-nav" aria-label="Student">
        <button type="button" className={tab === "classroom" ? "active" : ""} onClick={() => setTab("classroom")}>
          Classroom
        </button>
        <button type="button" className={tab === "gradebook" ? "active" : ""} onClick={() => setTab("gradebook")}>
          Gradebook
        </button>
      </nav>
    </div>
  );
}

function Classroom({ me }: { me: MeResponse & { course: Course } }) {
  const live = useLive();
  const open = live?.type === "question_open" ? live : null;
  const [choiceId, setChoiceId] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [savedChoice, setSavedChoice] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pingLocation();
  }, []);

  useEffect(() => {
    setChoiceId("");
    setSaved(null);
    setSavedChoice(null);
    setDismissed(false);
    setError(null);
    if (open) void pingLocation();
  }, [open?.question.id]);

  useEffect(() => {
    if (!open) return;
    api
      .history()
      .then((r) => {
        const mine = r.history.find((h) => h.questionId === open.question.id);
        if (!mine) return;
        setChoiceId(mine.choiceId);
        setSaved(mine.submittedAt);
        setSavedChoice(mine.choiceId);
      })
      .catch(() => undefined);
  }, [open?.question.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!choiceId) return;
    setBusy(true);
    setError(null);
    try {
      const geo = await pingLocation();
      const result = await api.submit(choiceId, geo);
      setSaved(result.submittedAt);
      setSavedChoice(result.choiceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  const showModal = !!open && !dismissed;

  return (
    <>
      <div className="classroom-idle">
        <div className="cap" aria-hidden>
          🎓
        </div>
        <h2>Classroom</h2>
        <p className="hint">We’ll notify you when something has been presented.</p>
        {open && dismissed && saved && (
          <button type="button" className="reopen" onClick={() => setDismissed(false)}>
            <span className="saved-mark" aria-hidden>
              ✓
            </span>
            Answer saved — open question
          </button>
        )}
      </div>
      {showModal && open && (
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
                <p className="saved-line">
                  <span className="saved-mark" aria-hidden>
                    ✓
                  </span>
                  Saved {new Date(saved).toLocaleTimeString()}
                  {savedChoice ? ` (${savedChoice})` : ""}. You can update and submit again.
                </p>
              )}
              <div className="row">
                <button type="submit" disabled={!choiceId || busy}>
                  {saved ? "Update answer" : "Submit"}
                </button>
                {saved && (
                  <button type="button" className="secondary" onClick={() => setDismissed(true)}>
                    Close
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function GradebookView({ refreshKey }: { refreshKey: string }) {
  const [book, setBook] = useState<Gradebook | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBook(null);
    api.gradebook().then(setBook).catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, [refreshKey]);

  if (!book) {
    return <p className="hint">{error ?? "Loading gradebook…"}</p>;
  }

  return (
    <div className="gradebook">
      <div className="grade-hero">
        <div>
          <p className="hint">Total Grade</p>
          <p className="grade-num">
            {book.scored.toFixed(2)} / {book.possible.toFixed(2)}
          </p>
        </div>
      </div>
      {book.items.length === 0 ? (
        <p className="hint">Nothing has been presented yet.</p>
      ) : (
        <ol className="grade-list">
          {book.items.map((item) => (
            <GradeRow key={`${item.questionId}-${item.openedAt}`} item={item} />
          ))}
        </ol>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function GradeRow({ item }: { item: GradebookItem }) {
  const mark =
    item.correct === true ? "✓" : item.correct === false ? "✗" : item.choiceId ? "…" : "—";
  const score =
    item.correct === true ? "1/1" : item.choiceId ? "0/1" : "0/1";
  const status =
    item.correct === true
      ? "Correct"
      : item.correct === false
        ? "Incorrect"
        : item.choiceId
          ? "Saved"
          : "No submission";
  return (
    <li>
      <div>
        <p className="grade-when">
          {new Date(item.openedAt).toLocaleString()}
          {item.live ? " · Live" : item.closedAt ? "" : ""}
        </p>
        <strong>{item.stem}</strong>
        <p className="hint">
          {item.choiceId ? `Your answer: ${item.choiceId}. ${item.choiceText ?? ""}` : status}
        </p>
      </div>
      <div className={`grade-mark ${item.correct === true ? "ok" : item.correct === false ? "bad" : ""}`}>
        {score} {mark}
      </div>
    </li>
  );
}

