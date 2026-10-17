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
