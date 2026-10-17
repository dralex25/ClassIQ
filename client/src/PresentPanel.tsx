import { useEffect, useState } from "react";
import { api } from "./api";
import { useLive } from "./useLive";
import type { Question } from "@shared/contract";

export function PresentPanel({
  courseId,
  onViewAnalytics,
}: {
  courseId: string;
  onViewAnalytics?: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [picked, setPicked] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const { event: live, apply } = useLive(courseId);

  useEffect(() => {
    api
      .questions(courseId)
      .then((r) => {
        setQuestions(r.questions);
        setPicked((cur) => cur || r.questions[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [courseId]);

  const open = live?.type === "question_open" ? live : null;
  const choices = open && Array.isArray(open.question.choices) ? open.question.choices : [];

  async function start(questionId = picked) {
    if (!questionId) return;
    setError(null);
    try {
      if (live?.type === "question_open") {
        apply(await api.closeQuestion(courseId));
      }
      apply(await api.openQuestion(courseId, questionId));
      setPicked(questionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
    }
  }

  async function closeQ() {
    setError(null);
    try {
      apply(await api.closeQuestion(courseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close");
    }
  }

  return (
    <div className="card board-card">
      {!open ? (
        <>
          <h2>Present</h2>
          <p className="hint">
            This is the class board. Pick a planned question and Start — students see stem and
            choices only. Set the geofence in Plan; review answers in Analytics.
          </p>
          {questions.length === 0 ? (
            <p className="hint">Plan a question first.</p>
          ) : (
            <>
              <label htmlFor="pickQ">Question</label>
              <select id="pickQ" value={picked} onChange={(e) => setPicked(e.target.value)}>
                {questions.map((q, i) => (
                  <option key={q.id} value={q.id}>
                    Q{i + 1}. {q.stem}
                  </option>
                ))}
              </select>
              <div className="row">
                <button type="button" onClick={() => void start()} disabled={!picked}>
                  Start
                </button>
              </div>
            </>
          )}
          {error && <p className="error">{error}</p>}
        </>
      ) : (
        <div className="board">
          <p className="hint teacher-chrome">
            {open.submitCount} submitted
            <select
              aria-label="Switch question"
              value={open.question.id}
              onChange={(e) => void start(e.target.value)}
              style={{ width: "auto", marginLeft: 12 }}
            >
              {questions.map((q, i) => (
                <option key={q.id} value={q.id}>
                  Q{i + 1}. {q.stem}
                </option>
              ))}
            </select>
            <button type="button" className="secondary" style={{ marginLeft: 12 }} onClick={() => void closeQ()}>
              End presenting
            </button>
          </p>
          <p className="status-pill live">Accepting responses</p>
          <h2 className="board-stem">{open.question.stem}</h2>
          <ol className="board-choices">
            {choices.map((c) => (
              <li key={c.id}>
                <strong>{c.id}.</strong> {c.text}
              </li>
            ))}
          </ol>
          {error && <p className="error">{error}</p>}
        </div>
      )}
      {live?.type === "question_closed" && live.compiled && (
        <div style={{ marginTop: 16 }}>
          <h3>Presenting ended</h3>
          <p className="hint">
            Responses are locked. Compiled {live.compiled.total} answer
            {live.compiled.total === 1 ? "" : "s"}
            {live.question ? ` for “${live.question.stem}”` : ""}.
          </p>
          <ul className="plan-list">
            {live.compiled.byChoice.map((c) => (
              <li key={c.id}>
                <strong>{c.id}.</strong> {c.text} — {c.count}
              </li>
            ))}
          </ul>
          {onViewAnalytics && (
            <div className="row">
              <button type="button" onClick={onViewAnalytics}>
                Review answers
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
