import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { PresentMap } from "./PresentMap";
import { pingLocation } from "./pingLocation";
import { useLive } from "./useLive";
import {
  classifyPresence,
  DEFAULT_FENCE_RADIUS_M,
  type Fence,
  type PresenceBucket,
} from "@shared/geo";
import type { Question, SubmissionDot } from "@shared/contract";

const LABELS: Record<PresenceBucket, string> = {
  in: "in",
  out: "out",
  uncertain: "uncertain",
  "no-location": "no-location",
};

export function PresentPanel({ courseId }: { courseId: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [picked, setPicked] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [fence, setFence] = useState<Fence | null>(null);
  const [dots, setDots] = useState<SubmissionDot[]>([]);
  const live = useLive();

  useEffect(() => {
    api
      .questions(courseId)
      .then((r) => {
        setQuestions(r.questions);
        setPicked((cur) => cur || r.questions[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    api.fence(courseId).then((r) => setFence(r.fence)).catch(() => undefined);
  }, [courseId]);

  const open = live?.type === "question_open" ? live : null;
  const liveFence = open?.fence ?? fence;

  useEffect(() => {
    if (open?.fence) setFence(open.fence);
  }, [open?.fence?.lat, open?.fence?.lng, open?.fence?.radiusM]);

  useEffect(() => {
    if (!open) {
      setDots([]);
      return;
    }
    api.submissions(courseId, open.question.id).then((r) => setDots(r.submissions)).catch(() => undefined);
  }, [courseId, open?.question.id, open?.submitCount]);

  const buckets = useMemo(() => {
    const counts: Record<PresenceBucket, number> = { in: 0, out: 0, uncertain: 0, "no-location": 0 };
    for (const d of dots) {
      const ping =
        d.noLocation || d.lat == null || d.lng == null
          ? { noLocation: true as const }
          : { lat: d.lat, lng: d.lng, accuracy: d.accuracy ?? 9999 };
      counts[classifyPresence(ping, liveFence)] += 1;
    }
    return counts;
  }, [dots, liveFence]);

  async function saveFence(next: Fence) {
    setFence(next);
    try {
      await api.setFence(courseId, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save fence");
    }
  }

  async function useGps() {
    setError(null);
    const ping = await pingLocation();
    if ("noLocation" in ping) {
      setError("No GPS fix — click the map to drop a pin.");
      return;
    }
    await saveFence({
      lat: ping.lat,
      lng: ping.lng,
      radiusM: fence?.radiusM ?? DEFAULT_FENCE_RADIUS_M,
    });
  }

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
    <div className="present-layout">
      <div className="card">
        <h2>Present</h2>
        <p className="hint">
          Pin the room (or use GPS), set the radius, then Start. Presence is classified on this map
          — the server still accepts every submit.
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
      <div className="card">
        <h3>Fence map</h3>
        <p className="hint">Click the map to pin. Slider is meters. Origin is saved in Postgres.</p>
        <PresentMap
          fence={liveFence}
          dots={dots}
          onPin={(lat, lng) =>
            void saveFence({ lat, lng, radiusM: liveFence?.radiusM ?? DEFAULT_FENCE_RADIUS_M })
          }
        />
        <label htmlFor="radius">
          Radius {liveFence?.radiusM ?? DEFAULT_FENCE_RADIUS_M} m
        </label>
        <input
          id="radius"
          type="range"
          min={20}
          max={400}
          value={liveFence?.radiusM ?? DEFAULT_FENCE_RADIUS_M}
          onChange={(e) => {
            const radiusM = Number(e.target.value);
            if (!liveFence) return;
            void saveFence({ ...liveFence, radiusM });
          }}
        />
        <div className="row">
          <button type="button" className="secondary" onClick={() => void useGps()}>
            Use my GPS
          </button>
        </div>
        <p className="legend">
          {(["in", "out", "uncertain", "no-location"] as PresenceBucket[]).map((b) => (
            <span key={b} className={`swatch ${b}`}>
              {LABELS[b]} {buckets[b]}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
