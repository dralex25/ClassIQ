import { useEffect, useState } from "react";
import { api } from "./api";
import { FenceSettings } from "./FenceSettings";
import type { Question } from "@shared/contract";

type Draft = {
  stem: string;
  choices: string[];
  correctIndex: number;
};

const emptyDraft = (): Draft => ({
  stem: "",
  choices: ["", ""],
  correctIndex: 0,
});

function fromQuestion(q: Question): Draft {
  return {
    stem: q.stem,
    choices: q.choices.map((c) => c.text),
    correctIndex: Math.max(
      0,
      q.choices.findIndex((c) => c.id === q.correctChoiceId),
    ),
  };
}

export function PlanPanel({ courseId }: { courseId: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const { questions: next } = await api.questions(courseId);
    setQuestions(next);
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [courseId]);

  function setChoice(i: number, text: string) {
    setDraft({ ...draft, choices: draft.choices.map((c, idx) => (idx === i ? text : c)) });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      stem: draft.stem,
      choices: draft.choices,
      correctIndex: draft.correctIndex,
    };
    try {
      if (editingId) {
        await api.updateQuestion(editingId, payload);
      } else {
        await api.createQuestion(courseId, payload);
      }
      await reload();
      setDraft(emptyDraft());
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const i = questions.findIndex((q) => q.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= questions.length) return;
    const ids = questions.map((q) => q.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      const { questions: next } = await api.reorderQuestions(courseId, ids);
      setQuestions(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reorder failed");
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api.deleteQuestion(id);
      if (editingId === id) {
        setEditingId(null);
        setDraft(emptyDraft());
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <>
    <div className="card">
      <h2>Plan</h2>
      <p className="hint">
        Multiple choice only. Mark the correct choice — students never see the key on Present. Set
        the room geofence below (teacher-only).
      </p>

      {questions.length === 0 ? (
        <p className="hint">No questions yet. Add Q1 below.</p>
      ) : (
        <ol className="plan-list">
          {questions.map((q, i) => (
            <li key={q.id} className={editingId === q.id ? "editing" : undefined}>
              <div className="plan-item">
                <strong>
                  Q{i + 1}. {q.stem}
                </strong>
                <span className="hint">
                  {" "}
                  Correct: {q.correctChoiceId}. {q.choices.map((c) => `${c.id}) ${c.text}`).join(" · ")}
                </span>
                <div className="row">
                  <button type="button" className="secondary" onClick={() => move(q.id, -1)} disabled={i === 0}>
                    Up
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => move(q.id, 1)}
                    disabled={i === questions.length - 1}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setEditingId(q.id);
                      setDraft(fromQuestion(q));
                      setError(null);
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="secondary" onClick={() => remove(q.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={save} className="plan-form">
        <h3>{editingId ? "Edit question" : "New question"}</h3>
        <label htmlFor="stem">Stem</label>
        <textarea
          id="stem"
          rows={3}
          value={draft.stem}
          onChange={(e) => setDraft({ ...draft, stem: e.target.value })}
          required
        />
        {draft.choices.map((text, i) => (
          <div className="choice-row" key={i}>
            <label className="correct-pick">
              <input
                type="radio"
                name="correct"
                checked={draft.correctIndex === i}
                onChange={() => setDraft({ ...draft, correctIndex: i })}
              />
              <span>{String.fromCharCode(65 + i)}</span>
            </label>
            <input
              value={text}
              onChange={(e) => setChoice(i, e.target.value)}
              placeholder={`Choice ${String.fromCharCode(65 + i)}`}
              required
            />
            {draft.choices.length > 2 && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const next = draft.choices.filter((_, idx) => idx !== i);
                  setDraft({
                    ...draft,
                    choices: next,
                    correctIndex: Math.min(draft.correctIndex, next.length - 1),
                  });
                }}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {draft.choices.length < 6 && (
          <button
            type="button"
            className="secondary"
            onClick={() => setDraft({ ...draft, choices: [...draft.choices, ""] })}
          >
            Add choice
          </button>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" disabled={busy}>
            {editingId ? "Save changes" : "Add question"}
          </button>
          {editingId && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEditingId(null);
                setDraft(emptyDraft());
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
    <FenceSettings courseId={courseId} />
    </>
  );
}
