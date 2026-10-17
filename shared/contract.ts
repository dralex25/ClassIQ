/** Shared lecture contract — slice 1 types. Grow this module before adding UI fields. */

export type UserRole = "teacher" | "student";

export type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  studentId: string | null;
};

export type Course = {
  id: string;
  name: string;
  joinCode: string;
  teacherId: string;
};

export type JoinCode = {
  code: string;
  courseId: string;
};

export type RosterStudent = {
  id: string;
  name: string;
  email: string;
  studentId: string | null;
};

export type MeResponse = {
  user: User;
  course: Course | null;
};

export type McChoice = {
  id: string;
  text: string;
};

/** Multiple-choice item used by Plan now and Present later. */
export type Question = {
  id: string;
  courseId: string;
  stem: string;
  choices: McChoice[];
  /** Auto-grade key. Teacher Plan shows it; students never receive this field in later slices. */
  correctChoiceId: string;
  position: number;
};

/** Question payload pushed to students — no answer key. */
export type PublicQuestion = Omit<Question, "correctChoiceId">;

export type Fence = {
  lat: number;
  lng: number;
  radiusM: number;
};

export type LectureEvent =
  | { type: "waiting" }
  | {
      type: "question_open";
      question: PublicQuestion;
      openedAt: string;
      submitCount: number;
    }
  | { type: "question_closed"; closedAt: string };

export type Submission = {
  questionId: string;
  userId: string;
  choiceId: string;
  submittedAt: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  noLocation: boolean;
  correct: boolean | null;
};

export type SubmissionDot = Submission & {
  name: string;
  studentId: string | null;
  email: string;
};

export type GradebookItem = {
  questionId: string;
  stem: string;
  openedAt: string;
  closedAt: string | null;
  live: boolean;
  choiceId: string | null;
  choiceText: string | null;
  submittedAt: string | null;
  correct: boolean | null;
};

export type Gradebook = {
  scored: number;
  possible: number;
  items: GradebookItem[];
};

/** Student's own answers — no other students, no answer key. */
export type HistoryItem = {
  questionId: string;
  stem: string;
  choiceId: string;
  choiceText: string;
  submittedAt: string;
};
