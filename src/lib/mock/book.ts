import type { LevelId } from "@/store/useUserStore";

export interface BookDoc {
  id: string;
  title: string;
  pages: number;
  uploadedAt: string;
  sections: { title: string; page: number }[];
}
export interface Mcq {
  q: string;
  options: [string, string, string, string];
  correct: number;
  explanation: string;
}
export interface Flashcard {
  front: string;
  back: string;
}
export interface ImportantQ {
  q: string;
  marks: number;
}
export interface Source {
  page: number;
  quote: string;
}

export const seedDocs: BookDoc[] = [
  {
    id: "physics-ch5",
    title: "Physics_Chapter_5.pdf",
    pages: 18,
    uploadedAt: "2026-09-28",
    sections: [
      { title: "5.1 Universal law of gravitation", page: 1 },
      { title: "5.2 Free fall", page: 5 },
      { title: "5.3 Mass and weight", page: 9 },
      { title: "5.4 Thrust and pressure", page: 12 },
      { title: "5.5 Buoyancy & Archimedes", page: 15 },
    ],
  },
  {
    id: "dbms-u2",
    title: "DBMS_Unit_2.pdf",
    pages: 24,
    uploadedAt: "2026-10-02",
    sections: [
      { title: "2.1 Relational model", page: 1 },
      { title: "2.2 Keys", page: 6 },
      { title: "2.3 Functional dependencies", page: 11 },
      { title: "2.4 Normalization", page: 16 },
    ],
  },
];

export const pageQuotes: Record<number, string> = {
  3: "Every object in the universe attracts every other object with a force which is proportional to the product of their masses and inversely proportional to the square of the distance between them. F = G·m₁m₂ / d².",
  7: "Whenever objects fall towards the earth under this force alone, we say that the objects are in free fall. The acceleration due to gravity, g, is about 9.8 m/s² near the surface of the earth.",
  10: "The weight of an object is the force with which the earth attracts it: W = m × g. Mass remains constant everywhere, while weight changes with g.",
  16: "When a body is immersed fully or partially in a fluid, it experiences an upward force that is equal to the weight of the fluid displaced by it.",
};
export const quoteFor = (page: number) =>
  pageQuotes[page] ??
  `(Passage from page ${page} of your document.) The text on this page explains the concept in context, with examples and diagrams from your textbook.`;

export function chatAnswer(question: string, level: LevelId): { text: string; sources: Source[] } {
  const young = level === "c1-5" || level === "c6-8";
  const adv = level === "c11-12" || level === "grad";
  const text = young
    ? `Great question! According to your book, **gravity** is a pulling force. Everything pulls on everything else — the Earth pulls you down, which is why things fall.\n\n- Bigger things pull **harder**\n- Things far apart pull **less**\n\nWhen something falls with only gravity acting on it, it is in **free fall** and speeds up by about $9.8$ m/s every second.`
    : adv
      ? `From your chapter, the **universal law of gravitation** states:\n\n$$F = G\\frac{m_1 m_2}{d^2}, \\quad G = 6.67\\times10^{-11}\\ \\text{N m}^2\\text{kg}^{-2}$$\n\nNear Earth's surface this gives $g = \\dfrac{GM}{R^2} \\approx 9.8\\ \\text{m/s}^2$. Objects under gravity alone are in **free fall**; their acceleration is independent of mass, which is why a feather and a hammer fall together in vacuum.\n\n*Related to your question: "${question}"*`
      : `Your book explains that every object attracts every other object (**universal law of gravitation**):\n\n$$F = G\\frac{m_1 m_2}{d^2}$$\n\n- Force increases with mass\n- Force decreases with the **square** of distance\n\nAn object falling only under gravity is in **free fall**, with acceleration $g \\approx 9.8\\ \\text{m/s}^2$.`;
  return {
    text,
    sources: [
      { page: 3, quote: quoteFor(3) },
      { page: 7, quote: quoteFor(7) },
    ],
  };
}

export const suggestedQuestions = [
  "What is the universal law of gravitation?",
  "Why do all objects fall at the same rate?",
  "Difference between mass and weight?",
];

export const summaryMd = `### Chapter summary — Gravitation
- Every object attracts every other object with a force $F = G\\frac{m_1m_2}{d^2}$.
- $G = 6.67 \\times 10^{-11}$ N m² kg⁻² is the universal gravitational constant.
- Free fall: motion under gravity alone; $g \\approx 9.8$ m/s² on Earth.
- Mass is constant; weight $W = mg$ changes with location (on the Moon it is ⅙).
- Thrust is force perpendicular to a surface; pressure $= \\frac{\\text{thrust}}{\\text{area}}$.
- Buoyancy: fluids push up on immersed objects (Archimedes' principle).`;

export const explainMd = `### Explanation
Think of gravity as an invisible rope between any two objects. The heavier the objects, the stronger the rope; the farther apart, the weaker it gets — and it weakens fast (with the **square** of distance).

On Earth this pull gives everything the same acceleration, $g \\approx 9.8$ m/s², which is why a stone and a ball dropped together land together (ignoring air).`;

export const notesMd = `# Gravitation — Notes

## 1. Universal law of gravitation
Every object attracts every other object. $F = G\\dfrac{m_1 m_2}{d^2}$

> **Definition — Gravitational force:** The force of attraction between any two objects having mass.

> **Definition — Universal gravitational constant (G):** The force between two 1 kg masses 1 m apart; $G = 6.67 \\times 10^{-11}$ N m² kg⁻².

## 2. Free fall
Motion of a body under the influence of gravity alone.

> **Definition — Acceleration due to gravity (g):** The acceleration produced in a freely falling body; $g = GM/R^2 \\approx 9.8$ m/s².

## 3. Mass and weight
| Mass | Weight |
|---|---|
| Quantity of matter | Force of gravity on the body |
| Constant everywhere | Varies with $g$ |
| Unit: kg | Unit: N |

> **Definition — Weight:** $W = m \\times g$, the force with which Earth attracts a body.

## 4. Buoyancy
> **Definition — Archimedes' principle:** A body immersed in a fluid experiences an upward force equal to the weight of fluid displaced.

## Exam Questions
1. State the universal law of gravitation. *(2 marks)*
2. Differentiate between mass and weight. *(3 marks)*
3. Why does a body weigh less on the Moon? *(2 marks)*`;

export const mcqs: Mcq[] = [
  {
    q: "The SI unit of G is:",
    options: ["N m² kg⁻²", "N kg⁻¹", "m s⁻²", "N m kg⁻²"],
    correct: 0,
    explanation: "From $F = Gm_1m_2/d^2$, $G = Fd^2/(m_1m_2)$, giving N m² kg⁻².",
  },
  {
    q: "If the distance between two masses is doubled, the force becomes:",
    options: ["Double", "Half", "One-fourth", "Four times"],
    correct: 2,
    explanation: "Force varies as $1/d^2$, so doubling $d$ makes it $1/4$.",
  },
  {
    q: "The value of g on Earth's surface is about:",
    options: ["6.67 m/s²", "9.8 m/s²", "1.6 m/s²", "98 m/s²"],
    correct: 1,
    explanation: "Near Earth's surface $g \\approx 9.8$ m/s².",
  },
  {
    q: "Weight of an object on the Moon is about ___ of its weight on Earth.",
    options: ["1/2", "1/4", "1/6", "Same"],
    correct: 2,
    explanation: "The Moon's g is about one-sixth of Earth's.",
  },
  {
    q: "Which quantity stays constant everywhere?",
    options: ["Weight", "Mass", "g", "Thrust"],
    correct: 1,
    explanation: "Mass is the amount of matter and does not change with location.",
  },
  {
    q: "Buoyant force equals the weight of:",
    options: ["The object", "Fluid displaced", "The container", "Air above"],
    correct: 1,
    explanation: "Archimedes' principle: upward force = weight of displaced fluid.",
  },
];

export const flashcards: Flashcard[] = [
  { front: "Universal law of gravitation", back: "$F = G\\dfrac{m_1m_2}{d^2}$" },
  { front: "Value of G", back: "$6.67\\times10^{-11}$ N m² kg⁻²" },
  { front: "Free fall", back: "Motion under gravity alone" },
  { front: "Value of g on Earth", back: "≈ 9.8 m/s²" },
  { front: "Weight formula", back: "$W = mg$" },
  { front: "Mass vs weight", back: "Mass is constant; weight varies with g" },
  { front: "Pressure", back: "Thrust ÷ Area (unit: pascal)" },
  { front: "Archimedes' principle", back: "Upthrust = weight of fluid displaced" },
];

export const importantQs: ImportantQ[] = [
  { q: "State the universal law of gravitation and write its formula.", marks: 2 },
  { q: "Differentiate between mass and weight.", marks: 3 },
  { q: "What is free fall? Why do all objects fall with the same acceleration?", marks: 3 },
  { q: "Derive the relation between g and G.", marks: 5 },
  { q: "Why does a body weigh less on the Moon than on Earth?", marks: 2 },
  { q: "State Archimedes' principle and give two applications.", marks: 3 },
];
