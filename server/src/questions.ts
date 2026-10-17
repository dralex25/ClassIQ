import type { McChoice, PublicQuestion, Question } from "../../shared/contract.js";

const LABELS = ["A", "B", "C", "D", "E", "F"] as const;

export function questionFromRow(row: {
  id: string;
  course_id: string;
  stem: string;
  choices: McChoice[] | string;
  correct_choice_id: string;
  position: number;
}): Question {
  const choices = typeof row.choices === "string" ? JSON.parse(row.choices) : row.choices;
  return {
    id: row.id,
    courseId: row.course_id,
    stem: row.stem,
    choices,
    correctChoiceId: row.correct_choice_id,
    position: row.position,
  };
}

export function toPublicQuestion(question: Question): PublicQuestion {
  const { correctChoiceId: _key, ...pub } = question;
  return pub;
}

export function parseQuestionBody(body: unknown):
  | { ok: true; stem: string; choices: McChoice[]; correctChoiceId: string }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Question body is required" };
  }
  const raw = body as {
    stem?: unknown;
    choices?: unknown;
    correctChoiceId?: unknown;
    correctIndex?: unknown;
  };
  const stem = typeof raw.stem === "string" ? raw.stem.trim() : "";
  if (!stem) {
    return { ok: false, error: "Stem is required" };
  }
  if (!Array.isArray(raw.choices)) {
    return { ok: false, error: "Provide 2–6 choices" };
  }
  const texts = raw.choices
    .map((c) => {
      if (typeof c === "string") return c.trim();
      if (c && typeof c === "object" && "text" in c && typeof (c as McChoice).text === "string") {
        return (c as McChoice).text.trim();
      }
      return "";
    })
    .filter((t) => t.length > 0);
  if (texts.length < 2 || texts.length > 6) {
    return { ok: false, error: "Need 2–6 non-empty choices" };
  }
  const choices: McChoice[] = texts.map((text, i) => ({ id: LABELS[i], text }));
  let correctChoiceId: string | null = null;
  if (typeof raw.correctChoiceId === "string") {
    const wanted = raw.correctChoiceId.trim().toUpperCase();
    if (choices.some((c) => c.id === wanted)) correctChoiceId = wanted;
  }
  if (correctChoiceId === null && typeof raw.correctIndex === "number") {
    const idx = raw.correctIndex;
    if (Number.isInteger(idx) && idx >= 0 && idx < choices.length) {
      correctChoiceId = choices[idx].id;
    }
  }
  if (!correctChoiceId) {
    return { ok: false, error: "Mark one correct choice" };
  }
  return { ok: true, stem, choices, correctChoiceId };
}
