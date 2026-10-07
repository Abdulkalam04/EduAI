import { describe, expect, it } from "vitest";
import { generateDeckMock, generateDiagramMock, type PptTheme } from "./creative";

const level = "c9-10" as const;
const theme: PptTheme = "Indigo Modern";

describe("creative mock generators", () => {
  it("generates an even-or-odd flowchart with Start and End shapes", () => {
    const result = generateDiagramMock(
      "Flowchart to check if a number is even or odd",
      "Flowchart",
      level,
    );
    expect(result.code).toContain("flowchart");
    expect(result.code).toContain("number % 2 == 0?");
    expect(result.code).toContain("([Start])");
    expect(result.code).toContain("([End])");
  });

  it("returns the keyed mind map and ER diagram syntaxes", () => {
    expect(generateDiagramMock("Mind map for OOP", "Mind Map", level).code).toContain("mindmap");
    const er = generateDiagramMock("ER diagram for a library system", "ER Diagram", level);
    expect(er.code).toContain("erDiagram");
    expect(er.code).toContain("MEMBER");
    expect(er.code).toContain("LOAN");
  });

  it("adds terminal shapes to flowchart-generator results", () => {
    const result = generateDiagramMock("Explain SDLC", "Flowchart", level);
    expect(result.code).toContain("([Start])");
    expect(result.code).toContain("([End])");
    expect(result.code).toContain("Maintenance");
    const forced = generateDiagramMock("Mind map for OOP", "Mind Map", level, true);
    expect(forced.type).toBe("Flowchart");
    expect(forced.code).toContain("flowchart");
    expect(forced.code).toContain("([Start])");
    expect(forced.code).toContain("([End])");
    const forcedMindMap = generateDiagramMock(
      "ER diagram for a library system",
      "Flowchart",
      level,
      false,
      true,
    );
    expect(forcedMindMap.type).toBe("Mind Map");
    expect(forcedMindMap.code).toContain("mindmap");
  });

  it("keeps the requested Mermaid notation for other diagram types", () => {
    const fallbacks = [
      ["Concept Map", "graph TD"],
      ["UML Class", "classDiagram"],
      ["Sequence", "sequenceDiagram"],
      ["Network", "graph LR"],
      ["Block Diagram", "block-beta"],
    ] as const;
    for (const [type, syntax] of fallbacks) {
      expect(generateDiagramMock("A custom topic", type, level).code).toContain(syntax);
    }
  });

  it("creates a 10-slide AI deck and adds the digestive-system diagram", () => {
    const ai = generateDeckMock("Artificial Intelligence", level, 10, theme, true, true, false, "");
    expect(ai.slides).toHaveLength(10);
    expect(ai.slides[0]?.kind).toBe("title");
    expect(ai.slides.every((slide) => slide.notes.length > 0)).toBe(true);
    const withoutNotes = generateDeckMock(
      "Artificial Intelligence",
      level,
      5,
      theme,
      false,
      false,
      false,
      "",
    );
    expect(withoutNotes.slides.every((slide) => slide.notes === "")).toBe(true);
    const digestive = generateDeckMock(
      "Human Digestive System",
      level,
      10,
      theme,
      true,
      true,
      false,
      "",
    );
    expect(digestive.slides.find((slide) => slide.diagram)?.diagram).toContain("Mouth");
  });
});
