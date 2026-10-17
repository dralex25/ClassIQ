import { useEffect, useState } from "react";
import { api } from "./api";
import { PresentMap } from "./PresentMap";
import { classifyPresence, type Fence } from "@shared/geo";
import type { StudentProfile as Profile, StudentResponse, SubmissionDot } from "@shared/contract";

export function StudentProfile({
  courseId,
  studentId,
  onBack,
}: {
  courseId: string;
  studentId: string;
  onBack: () => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fence, setFence] = useState<Fence | null>(null);
  const [picked, setPicked] = useState<StudentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPicked(null);
    api
      .studentProfile(courseId, studentId)
      .then(setProfile)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    api.fence(courseId).then((r) => setFence(r.fence)).catch(() => undefined);
  }, [courseId, studentId]);

  if (!profile) {
    return (
      <div className="card">
        <button type="button" className="secondary" onClick={onBack}>
          Back
        </button>
        <p className="hint">{error ?? "Loading student…"}</p>
      </div>
    );
  }

  const { student, items } = profile;
  const focusDot: SubmissionDot | null =
    picked && picked.lat != null && picked.lng != null
      ? {
          questionId: picked.questionId,
          userId: student.id,
          choiceId: picked.choiceId ?? "",
          submittedAt: picked.submittedAt ?? "",
          lat: picked.lat,
          lng: picked.lng,
          accuracy: picked.accuracy,
          noLocation: picked.noLocation,
          correct: picked.correct,
          name: student.name,
          studentId: student.studentId,
          email: student.email,
        }
      : null;

  return (
    <div className="card">
      <div className="row" style={{ marginTop: 0 }}>
        <button type="button" className="secondary" onClick={onBack}>
          Back
        </button>
      </div>
      <h2>{student.name}</h2>
      <p className="hint">
        {student.studentId ?? "No student ID"} · {student.email}
      </p>
      <h3>Question response history</h3>
      {items.length === 0 ? (
        <p className="hint">Nothing presented yet.</p>
      ) : (
        <ul className="history">
          {items.map((item) => {
            const presence =
              item.choiceId && (item.lat != null || item.noLocation)
                ? classifyPresence(
                    item.noLocation || item.lat == null
                      ? { noLocation: true }
                      : { lat: item.lat, lng: item.lng ?? 0, accuracy: item.accuracy ?? 9999 },
                    fence,
                  )
                : null;
            const selected = picked?.questionId === item.questionId && picked?.openedAt === item.openedAt;
            return (
              <li key={`${item.questionId}-${item.openedAt}`}>
                <button
                  type="button"
                  className={`history-hit ${selected ? "active" : ""}`}
                  onClick={() => setPicked(item)}
                >
                  <span className={`status-pill ${item.live ? "live" : "closed"}`}>
                    {item.live ? "Accepting responses" : "[CLOSED]"}
                  </span>
                  <strong>{item.stem}</strong>
                  <p className="hint">
                    {item.choiceId
                      ? `${item.choiceId}. ${item.choiceText ?? ""} · ${item.correct ? "correct" : "incorrect"}`
                      : "No submission"}
                    {presence ? ` · ${presence}` : ""}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {picked && (
        <>
          <h3>Answer location</h3>
          <p className="hint">Fence is the acceptable radius. Pin is where this student submitted.</p>
          {focusDot ? (
            <PresentMap fence={fence} dots={[focusDot]} />
          ) : (
            <p className="hint">No location was logged for this answer.</p>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
