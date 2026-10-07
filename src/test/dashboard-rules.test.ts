import { describe, expect, it } from "vitest";
import { getLevel } from "@/store/useUserStore";

describe("EduAI learning levels", () => {
  it("Class 1–5 teaching style uses stories and simple examples", () => {
    expect(getLevel("c1-5").style).toBe("Stories and simple examples");
  });
  it("Class 9–10 is exam-focused", () => {
    expect(getLevel("c9-10").style).toBe("Exam-focused, step-by-step");
  });
});
