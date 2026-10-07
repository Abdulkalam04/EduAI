import { describe, expect, it } from "vitest";
import { buildPaper, gradePaper, paperStructure } from "./practice";
import { gradeLabel } from "@/components/practice/Results";

describe("practice papers", () => {
  it("50 marks splits into A10 B10 C15 D15", () => {
    expect(paperStructure(50).map((s) => s.marks)).toEqual([10, 10, 15, 15]);
  });
  it("every mark option adds up to its total", () => {
    for (const t of [20, 30, 50, 80, 100])
      expect(paperStructure(t).reduce((s, x) => s + x.marks, 0)).toBe(t);
  });
  it("50-mark paper has 10 MCQs, 5 short, 3 long, 3 numericals", () => {
    const p = buildPaper({
      level: "c9-10",
      subject: "Science",
      chapter: "Electricity",
      difficulty: "Medium",
      totalMarks: 50,
      timeMin: 90,
      weakFocus: [],
    });
    const c = (t: string) => p.questions.filter((q) => q.type === t).length;
    expect([c("mcq"), c("short"), c("long"), c("numerical")]).toEqual([10, 5, 3, 3]);
  });
  it("blank answers are skipped and score 0", () => {
    const p = buildPaper({
      level: "c9-10",
      subject: "Science",
      chapter: "Electricity",
      difficulty: "Medium",
      totalMarks: 50,
      timeMin: 90,
      weakFocus: [],
    });
    const r = gradePaper(p, {}, 60);
    expect(r.score).toBe(0);
    expect(r.perQ.every((q) => q.status === "skipped")).toBe(true);
  });
  it("grade labels: 80%+ Excellent, 50%+ Good, else Keep practising", () => {
    expect(gradeLabel(80)).toBe("Excellent");
    expect(gradeLabel(76)).toBe("Good");
    expect(gradeLabel(40)).toBe("Keep practising");
  });
});
