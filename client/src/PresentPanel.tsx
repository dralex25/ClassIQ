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
    <div className="card">
      <h2>Present</h2>
      <p className="hint">
        Pick a planned question, Start for the projector, Close when done. Students get a popup over
        waiting. Duplicate answers: last write wins.
      </p>
      {!open ? (
        <>
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
        </>
      ) : (
        <div className="board">
          <p className="hint">
            Opened {new Date(open.openedAt).toLocaleTimeString()} · {open.submitCount} submitted
          </p>
          <h3>{open.question.stem}</h3>
          <ol className="board-choices">
            {open.question.choices.map((c) => (
              <li key={c.id}>
                <strong>{c.id}.</strong> {c.text}
              </li>
            ))}
          </ol>
          <div className="row">
            <button type="button" onClick={closeQ}>
              Close
            </button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
