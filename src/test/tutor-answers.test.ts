import { describe, expect, it } from "vitest";
import { mockAnswer, SUGGESTIONS } from "@/lib/mock/tutor";

describe("AI Tutor mock answers", () => {
  it("Class 1–5 gravity answer is the simple pull-toward-Earth explanation", () => {
    expect(mockAnswer("What is gravity?", "c1-5", "Simple")).toContain(
      "Gravity is an invisible force that pulls things toward the Earth",
    );
  });
  it("Class 11–12 gravity answer uses F = G m1 m2 / r^2", () => {
    expect(mockAnswer("What is gravity?", "c11-12", "Detailed")).toContain(
      "F = \\frac{G\\, m_1 m_2}{r^2}",
    );
  });
  it("Graduation gravity answer gives potential V = -GM/r", () => {
    expect(mockAnswer("What is gravity?", "grad", "Detailed")).toContain("V(r) = -\\frac{GM}{r}");
  });
  it("Solving 2x + 5 = 15 gives x = 5", () => {
    expect(mockAnswer("Solve 2x + 5 = 15", "c9-10", "Simple")).toContain("Answer: x = 5");
  });
  it("SDLC answer includes a mermaid flowchart", () => {
    expect(mockAnswer("Explain SDLC", "grad", "Simple")).toContain("```mermaid");
  });
  it("Exam Answer style uses Definition and Conclusion sections", () => {
    const a = mockAnswer("What is photosynthesis?", "c9-10", "Exam Answer");
    expect(a).toContain("### Definition");
    expect(a).toContain("### Conclusion");
  });
  it("Class 9–10 suggestions include Ohm's law", () => {
    expect(SUGGESTIONS["c9-10"]).toContain("Explain Ohm's law with an example");
  });
});

describe("Simple style keeps the key formula", () => {
  it("Class 11–12 simple gravity still shows the formula", () => {
    expect(mockAnswer("What is gravity?", "c11-12", "Simple")).toContain(
      "F = \\frac{G\\, m_1 m_2}{r^2}",
    );
  });
});
