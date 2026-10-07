import { describe, expect, it } from "vitest";
import { paperStructure } from "@/lib/types";
import { gradeLabel } from "@/components/practice/Results";

describe("practice paper structure", () => {
  it("splits 50 marks into the expected section totals", () => {
    expect(paperStructure(50).map((section) => section.marks)).toEqual([10, 10, 15, 15]);
  });

  it("keeps each supported paper total consistent", () => {
    for (const total of [20, 30, 50, 80, 100]) {
      expect(paperStructure(total).reduce((sum, section) => sum + section.marks, 0)).toBe(total);
    }
  });

  it("labels scores consistently", () => {
    expect(gradeLabel(80)).toBe("Excellent");
    expect(gradeLabel(76)).toBe("Good");
    expect(gradeLabel(40)).toBe("Keep practising");
  });
});
