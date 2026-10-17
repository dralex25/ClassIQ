import type {
  Course,
  Fence,
  LectureEvent,
  MeResponse,
  Question,
  RosterStudent,
  SubmissionDot,
} from "@shared/contract";
import type { GeoPing } from "@shared/geo";

export type QuestionInput = {
  stem: string;
  choices: string[];
  correctIndex: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body;
}

export const api = {
  me: () => request<MeResponse>("/api/me"),
  login: (email: string, password: string) =>
    request<MeResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (payload: {
    email: string;
    password: string;
    name: string;
    role: "teacher" | "student";
    studentId?: string;
  }) =>
    request<MeResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  createCourse: (name: string) =>
    request<{ course: Course }>("/api/courses", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  roster: (courseId: string) =>
    request<{ roster: RosterStudent[] }>(`/api/courses/${courseId}/roster`),
  lookupJoin: (code: string) => request<{ course: Course }>(`/api/join/${encodeURIComponent(code)}`),
  join: (joinCode: string) =>
    request<{ course: Course }>("/api/join", {
      method: "POST",
      body: JSON.stringify({ joinCode }),
    }),
  questions: (courseId: string) =>
    request<{ questions: Question[] }>(`/api/courses/${courseId}/questions`),
  createQuestion: (courseId: string, input: QuestionInput) =>
    request<{ question: Question }>(`/api/courses/${courseId}/questions`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateQuestion: (id: string, input: QuestionInput) =>
    request<{ question: Question }>(`/api/questions/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteQuestion: (id: string) =>
    request<{ ok: boolean }>(`/api/questions/${id}`, { method: "DELETE" }),
  reorderQuestions: (courseId: string, ids: string[]) =>
    request<{ questions: Question[] }>(`/api/courses/${courseId}/questions/reorder`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  openQuestion: (courseId: string, questionId: string) =>
    request<LectureEvent>(`/api/courses/${courseId}/present/open`, {
      method: "POST",
      body: JSON.stringify({ questionId }),
    }),
  closeQuestion: (courseId: string) =>
    request<LectureEvent>(`/api/courses/${courseId}/present/close`, { method: "POST" }),
  live: (courseId: string) => request<LectureEvent>(`/api/courses/${courseId}/live`),
  submit: (choiceId: string, geo: GeoPing) =>
    request<{ ok: boolean; submittedAt: string; choiceId: string }>("/api/submit", {
      method: "POST",
      body: JSON.stringify(
        "noLocation" in geo
          ? { choiceId, noLocation: true }
          : { choiceId, lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy },
      ),
    }),
  fence: (courseId: string) => request<{ fence: Fence | null }>(`/api/courses/${courseId}/fence`),
  setFence: (courseId: string, fence: Fence) =>
    request<{ fence: Fence }>(`/api/courses/${courseId}/fence`, {
      method: "PUT",
      body: JSON.stringify(fence),
    }),
  submissions: (courseId: string, questionId?: string) => {
    const q = questionId ? `?questionId=${encodeURIComponent(questionId)}` : "";
    return request<{ submissions: SubmissionDot[] }>(`/api/courses/${courseId}/submissions${q}`);
  },
};
