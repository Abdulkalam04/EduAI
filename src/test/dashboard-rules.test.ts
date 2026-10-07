import { describe, expect, it } from "vitest";
import { getLevel } from "@/store/useUserStore";
import { dashboardMock } from "@/lib/mock/dashboard";

describe("EduAI rules", () => {
  it("Class 1–5 teaching style uses stories and simple examples", () => {
    expect(getLevel("c1-5").style).toBe("Stories and simple examples");
  });
  it("Class 9–10 is exam-focused", () => {
    expect(getLevel("c9-10").style).toBe("Exam-focused, step-by-step");
  });
  it("dashboard daily progress starts at 72%", () => {
    expect(dashboardMock.stats.dailyProgress).toBe(72);
  });
});
