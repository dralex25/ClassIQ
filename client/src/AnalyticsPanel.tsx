import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { PresentMap } from "./PresentMap";
import { classifyPresence, type Fence, type PresenceBucket } from "@shared/geo";
import type { Question, SubmissionDot } from "@shared/contract";

export function AnalyticsPanel({ courseId }: { courseId: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionId, setQuestionId] = useState("");
  const [rows, setRows] = useState<SubmissionDot[]>([]);
  const [fence, setFence] = useState<Fence | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .questions(courseId)
      .then((r) => {
        setQuestions(r.questions);
        setQuestionId((cur) => cur || r.questions[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    api.fence(courseId).then((r) => setFence(r.fence)).catch(() => undefined);
  }, [courseId]);

  useEffect(() => {
    if (!questionId) {
      setRows([]);
      return;
    }
    api
      .submissions(courseId, questionId)
      .then((r) => setRows(r.submissions))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load answers"));
  }, [courseId, questionId]);

  const question = questions.find((q) => q.id === questionId);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of question?.choices ?? []) map.set(c.id, 0);
    for (const row of rows) map.set(row.choiceId, (map.get(row.choiceId) ?? 0) + 1);
    return map;
  }, [question, rows]);

  const max = Math.max(1, ...counts.values());

  function bucketFor(row: SubmissionDot): PresenceBucket {
    const ping =
      row.noLocation || row.lat == null || row.lng == null
        ? { noLocation: true as const }
        : { lat: row.lat, lng: row.lng, accuracy: row.accuracy ?? 9999 };
    return classifyPresence(ping, fence);
  }

  return (
    <div className="card">
      <h2>Analytics</h2>
      <p className="hint">Teacher-only. Students never see this table or the fence map.</p>
      <div className="row">
        <button type="button" className="secondary" onClick={() => void api.exportCsv(courseId)}>
          Export CSV
        </button>
      </div>
      {questions.length === 0 ? (
        <p className="hint">No questions yet.</p>
      ) : (
        <>
          <label htmlFor="analyticsQ">Question</label>
          <select id="analyticsQ" value={questionId} onChange={(e) => setQuestionId(e.target.value)}>
            {questions.map((q, i) => (
              <option key={q.id} value={q.id}>
                Q{i + 1}. {q.stem}
              </option>
            ))}
          </select>
          <div className="counts">
            {(question?.choices ?? []).map((c) => {
              const n = counts.get(c.id) ?? 0;
              const correct = c.id === question?.correctChoiceId;
              return (
                <div key={c.id} className="count-row">
                  <span>
                    <strong>{c.id}</strong> {c.text}
                    {correct ? " (key)" : ""}
                  </span>
                  <span className="hint">{n}</span>
                  <div className="bar">
                    <div className="bar-fill" style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <h3>{rows.length} answers</h3>
          {rows.length === 0 ? (
            <p className="hint">No submits for this question yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Student ID</th>
                  <th>Answer</th>
                  <th>Presence</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.userId}>
                    <td>{row.name}</td>
                    <td>{row.studentId ?? "—"}</td>
                    <td>
                      {row.choiceId}
                      {row.choiceId === question?.correctChoiceId ? " ✓" : ""}
                    </td>
                    <td>{bucketFor(row)}</td>
                    <td>{new Date(row.submittedAt).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3>Map</h3>
          <p className="hint">Dots use the Plan geofence. Not shown in Present.</p>
          <PresentMap fence={fence} dots={rows} />
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
