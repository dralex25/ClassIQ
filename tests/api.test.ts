import { beforeAll, describe, expect, it } from "vitest";
import { ApiClient, requireApi } from "./http";

const TEACHER = "teacher@classiq.local";
const STUDENT = "student@classiq.local";

describe("ClassIQ API (running server)", () => {
  beforeAll(async () => {
    await requireApi();
  });

  it("serves health", async () => {
    const res = await fetch(`${process.env.CLASSIQ_BASE_URL ?? "http://127.0.0.1:3000"}/health`);
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("logs in the demo teacher to AME341A", async () => {
    const teacher = new ApiClient();
    const { status, body } = await teacher.login(TEACHER);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      user: { email: TEACHER, role: "teacher" },
      course: { name: "AME 341a Fall 2026", joinCode: "AME341A" },
    });
  });

  it("logs in the demo student and returns a gradebook", async () => {
    const student = new ApiClient();
    const login = await student.login(STUDENT);
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({
      user: { email: STUDENT, role: "student", studentId: "S1001" },
      course: { joinCode: "AME341A" },
    });
    const book = await student.request("/api/me/gradebook");
    expect(book.status).toBe(200);
    expect(book.body).toMatchObject({
      scored: expect.any(Number),
      possible: expect.any(Number),
      items: expect.any(Array),
    });
  });

  it("blocks students from CSV export", async () => {
    const student = new ApiClient();
    await student.login(STUDENT);
    const me = await student.request<{ course: { id: string } }>("/api/me");
    const csv = await fetch(
      `${process.env.CLASSIQ_BASE_URL ?? "http://127.0.0.1:3000"}/api/courses/${me.body.course.id}/export.csv`,
      { headers: { cookie: student.cookies } },
    );
    expect(csv.status).toBe(403);
  });

  it("opens a question, last-write-wins submit, auto-grades, and exports CSV", async () => {
    const teacher = new ApiClient();
    const student = new ApiClient();
    await teacher.login(TEACHER);
    await student.login(STUDENT);

    const me = await teacher.request<{ course: { id: string } }>("/api/me");
    const courseId = me.body.course.id;
    const qs = await teacher.request<{ questions: { id: string; correctChoiceId: string; choices: { id: string }[] }[] }>(
      `/api/courses/${courseId}/questions`,
    );
    expect(qs.body.questions.length).toBeGreaterThan(0);
    const question = qs.body.questions[0];
    const wrong = question.choices.find((c) => c.id !== question.correctChoiceId)?.id;
    expect(wrong).toBeTruthy();

    await teacher.request(`/api/courses/${courseId}/present/close`, { method: "POST" });
    const opened = await teacher.request(`/api/courses/${courseId}/present/open`, {
      method: "POST",
      body: JSON.stringify({ questionId: question.id }),
    });
    expect(opened.status).toBe(200);
    expect(opened.body).toMatchObject({ type: "question_open" });

    const first = await student.request("/api/submit", {
      method: "POST",
      body: JSON.stringify({ choiceId: wrong, noLocation: true }),
    });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, choiceId: wrong, correct: false });

    const second = await student.request("/api/submit", {
      method: "POST",
      body: JSON.stringify({ choiceId: question.correctChoiceId, noLocation: true }),
    });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ ok: true, choiceId: question.correctChoiceId, correct: true });

    const closed = await teacher.request(`/api/courses/${courseId}/present/close`, { method: "POST" });
    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({
      type: "question_closed",
      submitCount: expect.any(Number),
      compiled: { total: expect.any(Number), byChoice: expect.any(Array) },
    });

    const locked = await student.request("/api/submit", {
      method: "POST",
      body: JSON.stringify({ choiceId: question.correctChoiceId, noLocation: true }),
    });
    expect(locked.status).toBe(409);

    const who = await student.request<{ user: { id: string } }>("/api/me");
    const profile = await teacher.request(`/api/courses/${courseId}/students/${who.body.user.id}`);
    expect(profile.status).toBe(200);
    expect(profile.body).toMatchObject({
      student: { email: STUDENT },
      items: expect.any(Array),
    });
    const asStudent = await student.request(`/api/courses/${courseId}/students/${who.body.user.id}`);
    expect(asStudent.status).toBe(403);

    const book = await student.request<{
      scored: number;
      possible: number;
      items: { choiceId: string; correct: boolean | null }[];
    }>("/api/me/gradebook");
    expect(book.status).toBe(200);
    expect(book.body.possible).toBeGreaterThan(0);
    expect(book.body.items[0]?.choiceId).toBe(question.correctChoiceId);
    expect(book.body.items[0]?.correct).toBe(true);

    const csv = await fetch(
      `${process.env.CLASSIQ_BASE_URL ?? "http://127.0.0.1:3000"}/api/courses/${courseId}/export.csv`,
      { headers: { cookie: teacher.cookies } },
    );
    expect(csv.status).toBe(200);
    const text = await csv.text();
    expect(text).toContain("Name");
    expect(text).toContain("Jamie Student");
  });
});
