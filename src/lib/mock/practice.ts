import type { LevelId } from "@/store/useUserStore";

export type Difficulty = "Easy" | "Medium" | "Hard";
export type QType = "mcq" | "short" | "long" | "numerical";

export interface PQuestion {
  id: string;
  section: "A" | "B" | "C" | "D";
  type: QType;
  text: string;
  marks: number;
  options?: string[];
  correct?: number;
  model: string;
  topic: string;
  keywords?: string[];
}
export interface PaperSection {
  id: "A" | "B" | "C" | "D";
  name: string;
  marks: number;
  count: number;
  each: number;
}
export interface Paper {
  id: string;
  title: string;
  subject: string;
  level: LevelId;
  chapter: string;
  difficulty: Difficulty;
  totalMarks: number;
  timeMin: number;
  createdAt: string;
  weakFocus: string[];
  sections: PaperSection[];
  questions: PQuestion[];
}
export interface QResult {
  id: string;
  awarded: number;
  status: "correct" | "partial" | "wrong" | "skipped";
  feedback: string;
}
export interface PaperResult {
  score: number;
  total: number;
  timeUsedSec: number;
  perQ: QResult[];
  sections: { id: string; name: string; score: number; max: number }[];
  weakTopics: string[];
}

export const CHAPTER_SUGGESTIONS = [
  "Electricity",
  "Algebra",
  "Photosynthesis",
  "Light – Reflection",
  "Chemical Reactions",
  "Trigonometry",
  "Life Processes",
  "Magnetic Effects of Current",
];
export const MARK_OPTIONS = [20, 30, 50, 80, 100] as const;
export const timeForMarks = (m: number) => Math.round((m * 1.8) / 5) * 5;

/** Section structure for a given total. 50 marks → A 10 · B 10 · C 15 · D 15. */
export function paperStructure(total: number): PaperSection[] {
  const short = Math.round((total * 0.2) / 2);
  const long = Math.max(1, Math.round((total * 0.3) / 5));
  const num = Math.max(1, Math.round((total * 0.3) / 5));
  const mcq = Math.max(1, total - short * 2 - long * 5 - num * 5);
  return [
    { id: "A", name: "Multiple Choice", marks: mcq, count: mcq, each: 1 },
    { id: "B", name: "Short Answer", marks: short * 2, count: short, each: 2 },
    { id: "C", name: "Long Answer", marks: long * 5, count: long, each: 5 },
    { id: "D", name: "Numerical Problems", marks: num * 5, count: num, each: 5 },
  ];
}

const MCQ: Omit<PQuestion, "id" | "section" | "type" | "marks">[] = [
  {
    text: "The SI unit of electric current is:",
    options: ["Volt", "Ampere", "Ohm", "Watt"],
    correct: 1,
    model: "Ampere (A).",
    topic: "Electric current",
  },
  {
    text: "Ohm's law states that, at constant temperature, V is proportional to:",
    options: ["R", "I", "P", "1/I"],
    correct: 1,
    model: "V ∝ I, i.e. V = IR.",
    topic: "Ohm's law",
  },
  {
    text: "Three 6 Ω resistors in parallel have an equivalent resistance of:",
    options: ["18 Ω", "6 Ω", "2 Ω", "3 Ω"],
    correct: 2,
    model: "1/R = 3/6 ⇒ R = 2 Ω.",
    topic: "Parallel circuits",
  },
  {
    text: "In a series circuit, which quantity is the same through every resistor?",
    options: ["Voltage", "Current", "Power", "Resistance"],
    correct: 1,
    model: "Current is the same in series.",
    topic: "Series circuits",
  },
  {
    text: "1 kWh is equal to:",
    options: ["3.6 × 10⁶ J", "3.6 × 10³ J", "1000 J", "36 J"],
    correct: 0,
    model: "1 kWh = 1000 W × 3600 s = 3.6 × 10⁶ J.",
    topic: "Electric power",
  },
  {
    text: "The resistance of a wire is inversely proportional to its:",
    options: ["Length", "Area of cross-section", "Resistivity", "Temperature"],
    correct: 1,
    model: "R = ρL/A, so R ∝ 1/A.",
    topic: "Resistivity",
  },
  {
    text: "A fuse works on the principle of:",
    options: ["Magnetic effect", "Heating effect of current", "Chemical effect", "Induction"],
    correct: 1,
    model: "Heating effect — the fuse wire melts.",
    topic: "Heating effect",
  },
  {
    text: "The device used to measure potential difference is:",
    options: ["Ammeter", "Galvanometer", "Voltmeter", "Rheostat"],
    correct: 2,
    model: "Voltmeter, connected in parallel.",
    topic: "Electric circuits",
  },
  {
    text: "Power P can be written as:",
    options: ["V/I", "I²R", "IR", "V/R"],
    correct: 1,
    model: "P = VI = I²R = V²/R.",
    topic: "Electric power",
  },
  {
    text: "Resistivity of a material depends on:",
    options: ["Length", "Area", "Nature of material", "Shape"],
    correct: 2,
    model: "Only on the material (and temperature).",
    topic: "Resistivity",
  },
  {
    text: "Filaments of bulbs are made of tungsten because it has:",
    options: ["Low melting point", "High melting point", "Low resistivity", "Low cost"],
    correct: 1,
    model: "Very high melting point (3380 °C).",
    topic: "Heating effect",
  },
  {
    text: "1 coulomb of charge is carried by approximately how many electrons?",
    options: ["6.25 × 10¹⁸", "1.6 × 10⁻¹⁹", "6.02 × 10²³", "10⁶"],
    correct: 0,
    model: "1/1.6×10⁻¹⁹ ≈ 6.25 × 10¹⁸.",
    topic: "Electric current",
  },
];
const SHORT: Omit<PQuestion, "id" | "section" | "type" | "marks">[] = [
  {
    text: "State Ohm's law and write its mathematical form.",
    model:
      "At constant temperature, the current through a conductor is directly proportional to the potential difference across it: V = IR.",
    topic: "Ohm's law",
    keywords: ["proportional", "temperature", "v = ir", "v=ir"],
  },
  {
    text: "Why are household appliances connected in parallel?",
    model:
      "Each appliance gets the full mains voltage, can be switched independently, and one failure doesn't break the others.",
    topic: "Parallel circuits",
    keywords: ["voltage", "independent", "same"],
  },
  {
    text: "Define electric power and give its SI unit.",
    model: "Rate at which electrical energy is consumed; SI unit watt (W) = 1 J/s.",
    topic: "Electric power",
    keywords: ["rate", "watt", "energy"],
  },
  {
    text: "What is meant by 'resistivity'? Give its SI unit.",
    model: "Resistance of a conductor of unit length and unit cross-sectional area; unit Ω m.",
    topic: "Resistivity",
    keywords: ["unit length", "area", "ohm"],
  },
  {
    text: "Give two applications of the heating effect of electric current.",
    model: "Electric iron, heater, toaster, fuse, filament bulb.",
    topic: "Heating effect",
    keywords: ["iron", "heater", "fuse", "bulb", "toaster"],
  },
  {
    text: "Draw (describe) the symbol for a variable resistor and state its use.",
    model: "A resistor with an arrow through it — a rheostat, used to change current in a circuit.",
    topic: "Electric circuits",
    keywords: ["rheostat", "arrow", "current"],
  },
];
const LONG: Omit<PQuestion, "id" | "section" | "type" | "marks">[] = [
  {
    text: "Derive the expression for the equivalent resistance of three resistors connected in series.",
    model:
      "Same current I flows; V = V₁ + V₂ + V₃ = IR₁ + IR₂ + IR₃. Since V = IRₛ, Rₛ = R₁ + R₂ + R₃.",
    topic: "Series circuits",
    keywords: ["same current", "v1", "sum", "r1 + r2"],
  },
  {
    text: "Derive the expression for the equivalent resistance of resistors in parallel, and state two advantages of parallel connection.",
    model:
      "Same V; I = I₁+I₂+I₃ = V/R₁+V/R₂+V/R₃ ⇒ 1/Rₚ = 1/R₁+1/R₂+1/R₃. Advantages: full voltage to each, independent switching.",
    topic: "Parallel circuits",
    keywords: ["same voltage", "1/r", "independent"],
  },
  {
    text: "Explain Joule's law of heating and derive H = I²Rt.",
    model:
      "Work done moving charge Q through V is W = VQ = VIt = I²Rt, appearing as heat H = I²Rt. Heat ∝ I², R, t.",
    topic: "Heating effect",
    keywords: ["i²rt", "i2rt", "work", "charge"],
  },
  {
    text: "Describe an experiment to verify Ohm's law, with a circuit description and expected graph.",
    model:
      "Connect cell, ammeter (series), resistor, rheostat, voltmeter (parallel). Vary current, record V and I. V–I graph is a straight line through the origin.",
    topic: "Ohm's law",
    keywords: ["ammeter", "voltmeter", "straight line", "graph"],
  },
];
const NUM: Omit<PQuestion, "id" | "section" | "type" | "marks">[] = [
  {
    text: "A 4 Ω and a 6 Ω resistor are connected in series to a 12 V battery. Find (a) total resistance, (b) current, (c) potential difference across the 4 Ω resistor.",
    model: "R = 10 Ω; I = 12/10 = 1.2 A; V = 1.2 × 4 = 4.8 V.",
    topic: "Numericals on circuits",
    keywords: ["10", "1.2", "4.8"],
  },
  {
    text: "An electric heater of 1500 W is used 2 hours daily. Find the energy consumed in 30 days and the cost at ₹6 per unit.",
    model: "E = 1.5 kW × 2 h × 30 = 90 kWh; cost = 90 × 6 = ₹540.",
    topic: "Numericals on power",
    keywords: ["90", "540"],
  },
  {
    text: "Calculate the heat produced when 2 A flows through a 50 Ω resistor for 5 minutes.",
    model: "H = I²Rt = 4 × 50 × 300 = 60 000 J = 60 kJ.",
    topic: "Numericals on power",
    keywords: ["60000", "60 000", "60 kj", "60kj"],
  },
  {
    text: "Two resistors of 3 Ω and 6 Ω are connected in parallel across 6 V. Find the equivalent resistance and the total current.",
    model: "1/R = 1/3 + 1/6 = 1/2 ⇒ R = 2 Ω; I = 6/2 = 3 A.",
    topic: "Numericals on circuits",
    keywords: ["2", "3"],
  },
];

const pick = <T>(bank: T[], n: number, offset: number) =>
  Array.from({ length: n }, (_, i) => bank[(i + offset) % bank.length]!);

export function buildPaper(opts: {
  level: LevelId;
  subject: string;
  chapter: string;
  difficulty: Difficulty;
  totalMarks: number;
  timeMin: number;
  weakFocus: string[];
}): Paper {
  const sections = paperStructure(opts.totalMarks);
  const off = opts.difficulty === "Hard" ? 2 : opts.difficulty === "Easy" ? 1 : 0;
  const banks = { A: MCQ, B: SHORT, C: LONG, D: NUM } as const;
  const types = { A: "mcq", B: "short", C: "long", D: "numerical" } as const;
  let n = 0;
  const questions = sections.flatMap((s) =>
    pick<Omit<PQuestion, "id" | "section" | "type" | "marks">>(banks[s.id], s.count, off).map(
      (q) => ({ ...q, id: `q${++n}`, section: s.id, type: types[s.id], marks: s.each }),
    ),
  );
  return {
    id: `p-${Date.now()}`,
    title: `${opts.subject.toUpperCase()} TEST`,
    subject: opts.subject,
    level: opts.level,
    chapter: opts.chapter || "Electricity",
    difficulty: opts.difficulty,
    totalMarks: opts.totalMarks,
    timeMin: opts.timeMin,
    createdAt: new Date().toISOString(),
    weakFocus: opts.weakFocus,
    sections,
    questions,
  };
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function gradePaper(
  paper: Paper,
  answers: Record<string, string>,
  timeUsedSec: number,
): PaperResult {
  const perQ: QResult[] = paper.questions.map((q) => {
    const a = (answers[q.id] ?? "").trim();
    if (!a)
      return {
        id: q.id,
        awarded: 0,
        status: "skipped",
        feedback:
          "You skipped this one — no worries. Read the model answer and try a similar question next time.",
      };
    if (q.type === "mcq") {
      const ok = Number(a) === q.correct;
      return {
        id: q.id,
        awarded: ok ? 1 : 0,
        status: ok ? "correct" : "wrong",
        feedback: ok
          ? "Spot on!"
          : `Close! The right option is "${q.options![q.correct!]}". ${q.model}`,
      };
    }
    const lower = a.toLowerCase();
    const hits = (q.keywords ?? []).filter((k) => lower.includes(k)).length;
    const lengthScore = Math.min(1, words(a) / (q.marks * 10));
    const kwScore = q.keywords?.length
      ? Math.min(1, hits / Math.max(1, Math.ceil(q.keywords.length / 2)))
      : lengthScore;
    const awarded = Math.min(
      q.marks,
      Math.round(q.marks * (0.45 * lengthScore + 0.55 * kwScore) * 2) / 2,
    );
    const status = awarded >= q.marks ? "correct" : awarded > 0 ? "partial" : "wrong";
    const feedback =
      status === "correct"
        ? "Excellent — complete and well explained."
        : status === "partial"
          ? "Good start! Add the key points from the model answer to get full marks."
          : "Nice try. Compare with the model answer — focus on the main formula or definition.";
    return { id: q.id, awarded, status, feedback };
  });
  const score = perQ.reduce((s, r) => s + r.awarded, 0);
  const sections = paper.sections.map((s) => ({
    id: s.id,
    name: s.name,
    max: s.marks,
    score: paper.questions
      .filter((q) => q.section === s.id)
      .reduce((t, q) => t + (perQ.find((r) => r.id === q.id)?.awarded ?? 0), 0),
  }));
  const byTopic = new Map<string, { got: number; max: number }>();
  paper.questions.forEach((q) => {
    const r = perQ.find((x) => x.id === q.id)!;
    const t = byTopic.get(q.topic) ?? { got: 0, max: 0 };
    byTopic.set(q.topic, { got: t.got + r.awarded, max: t.max + q.marks });
  });
  let weakTopics = [...byTopic.entries()]
    .filter(([, v]) => v.got < v.max)
    .sort((a, b) => a[1].got / a[1].max - b[1].got / b[1].max)
    .slice(0, 3)
    .map(([k]) => k);
  if (weakTopics.length === 0) weakTopics = [];
  return { score, total: paper.totalMarks, timeUsedSec, perQ, sections, weakTopics };
}

/* ---------- AI Paper Checking ---------- */
export interface RubricRow {
  label: string;
  got: number;
  max: number;
}
export interface Evaluation {
  id: string;
  question: string;
  marks: number;
  answer: string;
  rubric: RubricRow[];
  good: string;
  improve: string;
  model: string;
  topic: string;
}

export const sampleEvaluations: Evaluation[] = [
  {
    id: "e1",
    topic: "Ohm's law",
    marks: 5,
    question: "State Ohm's law. Explain it with an example and a graph.",
    answer:
      "Ohm's law says that the current flowing through a conductor is directly proportional to the voltage across it if temperature stays same. V = IR. The graph of V vs I is a straight line.",
    rubric: [
      { label: "Concept", got: 2, max: 2 },
      { label: "Explanation", got: 1, max: 2 },
      { label: "Example", got: 0, max: 1 },
      { label: "Presentation", got: 1, max: 1 },
    ],
    good: "Your concept is correct and the formula V = IR is written clearly.",
    improve:
      "Your concept is correct, but you missed the example. Add a quick one like 'a 2 Ω resistor with 4 V gives 2 A'.",
    model:
      "At constant temperature, I ∝ V, so V = IR. Example: a 2 Ω resistor across 4 V carries I = 2 A. The V–I graph is a straight line through the origin whose slope is R.",
  },
  {
    id: "e2",
    topic: "Series circuits",
    marks: 5,
    question: "Derive the equivalent resistance of three resistors in series.",
    answer:
      "In series the same current flows. V = V1 + V2 + V3 = IR1 + IR2 + IR3 so Rs = R1 + R2 + R3.",
    rubric: [
      { label: "Concept", got: 2, max: 2 },
      { label: "Derivation", got: 2, max: 2 },
      { label: "Diagram", got: 0, max: 1 },
    ],
    good: "Clean, correct derivation — every step follows logically.",
    improve: "Add a small circuit diagram to secure the last mark.",
    model:
      "Same current I flows through R₁, R₂, R₃. V = V₁+V₂+V₃ = I(R₁+R₂+R₃). Since V = IRₛ, Rₛ = R₁+R₂+R₃.",
  },
  {
    id: "e3",
    topic: "Numericals on power",
    marks: 5,
    question:
      "A 1500 W heater runs 2 hours a day. Find the energy used in 30 days and the cost at ₹6/unit.",
    answer: "E = 1500 x 2 x 30 = 90000 units. Cost = 90000 x 6",
    rubric: [
      { label: "Formula", got: 1, max: 1 },
      { label: "Units", got: 0, max: 2 },
      { label: "Calculation", got: 0, max: 1 },
      { label: "Final answer", got: 0, max: 1 },
    ],
    good: "You picked the right formula E = P × t.",
    improve: "Convert 1500 W to 1.5 kW first — then energy is 90 kWh (units) and the cost is ₹540.",
    model: "E = 1.5 kW × 2 h × 30 = 90 kWh. Cost = 90 × ₹6 = ₹540.",
  },
  {
    id: "e4",
    topic: "Electric power",
    marks: 2,
    question: "Define electric power and write its SI unit.",
    answer:
      "Electric power is the rate at which electrical energy is consumed. Its SI unit is watt.",
    rubric: [
      { label: "Definition", got: 1, max: 1 },
      { label: "Unit", got: 1, max: 1 },
    ],
    good: "Perfect definition and the correct unit.",
    improve: "Nothing to fix — you could add 1 W = 1 J/s for extra polish.",
    model:
      "Electric power is the rate of consumption of electrical energy, P = W/t. SI unit: watt (W), 1 W = 1 J/s.",
  },
];

export function reEvaluate(e: Evaluation, answer: string): Evaluation {
  const longer = answer.trim().split(/\s+/).length > e.answer.trim().split(/\s+/).length + 5;
  const rubric = e.rubric.map((r) => ({ ...r, got: longer ? Math.min(r.max, r.got + 1) : r.got }));
  return {
    ...e,
    answer,
    rubric,
    improve: longer ? "Much better — your added detail earned extra marks." : e.improve,
  };
}
