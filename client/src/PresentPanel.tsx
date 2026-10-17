import { useEffect, useState } from "react";
import { api } from "./api";
import { useLive } from "./useLive";
import type { Question } from "@shared/contract";

export function PresentPanel({ courseId }: { courseId: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [picked, setPicked] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const live = useLive();

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

  async function start() {
    setError(null);
    try {
      await api.openQuestion(courseId, picked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
    }
  }

  async function closeQ() {
    setError(null);
    try {
      await api.closeQuestion(courseId);
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
                <button type="button" onClick={start} disabled={!picked}>
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
            <button type="button" className="secondary" style={{ marginLeft: 12 }} onClick={closeQ}>
              Close
            </button>
          </p>
          <h2 className="board-stem">{open.question.stem}</h2>
          <ol className="board-choices">
            {open.question.choices.map((c) => (
              <li key={c.id}>
                <strong>{c.id}.</strong> {c.text}
              </li>
            ))}
          </ol>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}
