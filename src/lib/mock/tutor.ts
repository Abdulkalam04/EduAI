import type { LevelId } from "@/store/useUserStore";

export type AnswerStyle = "Simple" | "Exam Answer" | "Detailed";

export const SUGGESTIONS: Record<LevelId, string[]> = {
  "c1-5": [
    "Why is the sky blue?",
    "What do plants eat?",
    "What is gravity?",
    "Why do we have day and night?",
  ],
  "c6-8": [
    "How does the water cycle work?",
    "What is an atom?",
    "Explain SDLC",
    "What is gravity?",
  ],
  "c9-10": [
    "Explain Ohm's law with an example",
    "Solve 2x + 5 = 15",
    "What is gravity?",
    "Explain SDLC",
  ],
  "c11-12": [
    "Explain Newton's laws with examples",
    "What is gravity?",
    "Solve 2x + 5 = 15",
    "Explain SDLC",
  ],
  grad: ["Explain normalization in DBMS", "What is gravity?", "Explain SDLC", "Solve 2x + 5 = 15"],
};

const young = (l: LevelId) => l === "c1-5" || l === "c6-8";

const GRAVITY: Record<LevelId, string> = {
  "c1-5": `Gravity is an invisible force that pulls things toward the Earth. That's why when you throw a ball up, it comes back down. 🌍⚽

It's like the Earth is giving everything a gentle hug, pulling it close!

**Try it yourself:** 🧪 Hold a pencil and a small eraser at the same height and let go together. Watch them land — gravity pulls both down at the same time!`,
  "c6-8": `**Gravity** is the force that pulls objects toward each other. The Earth is huge, so its pull is strong enough to keep us on the ground and the Moon in orbit.

- Heavier (more massive) objects pull harder.
- Objects farther apart pull on each other less.

**Example:** An apple falls from a tree because the Earth pulls it down.`,
  "c9-10": `**Gravity** is the force of attraction between any two objects that have mass.

1. Every object attracts every other object.
2. The force increases with mass and decreases with distance.
3. Near Earth, objects fall with acceleration $g \\approx 9.8\\ \\text{m/s}^2$.

**Example:** The weight of a 10 kg bag is $W = mg = 10 \\times 9.8 = 98\\ \\text{N}$.`,
  "c11-12": `**Newton's law of universal gravitation** states that every particle attracts every other particle with a force proportional to the product of their masses and inversely proportional to the square of the distance between them:

$$
F = \\frac{G\\, m_1 m_2}{r^2}
$$

where $G = 6.674 \\times 10^{-11}\\ \\text{N m}^2/\\text{kg}^2$.

**Explanation:** Doubling either mass doubles the force; doubling the distance makes it four times weaker (inverse-square law).

**Example:** Two 1000 kg masses 1 m apart:

$$
F = \\frac{6.674\\times10^{-11} \\times 1000 \\times 1000}{1^2} \\approx 6.67\\times10^{-5}\\ \\text{N}
$$

This is tiny, which is why we only notice gravity from enormous bodies like Earth.`,
  grad: `### Gravitational field and potential

For a point mass $M$, the gravitational field at position $\\mathbf{r}$ is

$$
\\mathbf{g}(\\mathbf{r}) = -\\frac{GM}{r^2}\\,\\hat{\\mathbf{r}}
$$

and the potential is

$$
V(r) = -\\frac{GM}{r}, \\qquad \\mathbf{g} = -\\nabla V
$$

**Vector form of Newton's law** (force on $m_2$ due to $m_1$):

$$
\\mathbf{F}_{21} = -\\frac{G m_1 m_2}{|\\mathbf{r}_2 - \\mathbf{r}_1|^3}(\\mathbf{r}_2 - \\mathbf{r}_1)
$$

The field satisfies Gauss's law, $\\nabla \\cdot \\mathbf{g} = -4\\pi G \\rho$, equivalently Poisson's equation $\\nabla^2 V = 4\\pi G\\rho$.

> **Note on general relativity:** Einstein reinterprets gravity not as a force but as spacetime curvature, $G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4}T_{\\mu\\nu}$. Newtonian gravity is the weak-field, low-velocity limit — accurate for most engineering, but GPS satellites need relativistic corrections of ~38 µs/day.`,
};

const SOLVE = `**Given:** $2x + 5 = 15$

**Step 1 — Subtract 5 from both sides:**
$$2x + 5 - 5 = 15 - 5 \\implies 2x = 10$$

**Step 2 — Divide both sides by 2:**
$$\\frac{2x}{2} = \\frac{10}{2} \\implies x = 5$$

**Therefore,** substituting back: $2(5) + 5 = 15$ ✓

**Answer: x = 5**`;

const SDLC = (
  l: LevelId,
) => `The **Software Development Life Cycle (SDLC)** is the step-by-step process teams follow to plan, build and maintain software${young(l) ? " — like a recipe for making an app!" : "."}

\`\`\`mermaid
flowchart LR
  A[Planning] --> B[Requirements]
  B --> C[Design]
  C --> D[Development]
  D --> E[Testing]
  E --> F[Deployment]
  F --> G[Maintenance]
  G -.-> A
\`\`\`

| Phase | What happens |
|---|---|
| Planning | Decide goals, budget and timeline |
| Requirements | Gather what users need |
| Design | Plan architecture and screens |
| Development | Write the code |
| Testing | Find and fix bugs |
| Deployment | Release to users |
| Maintenance | Update and improve |`;

const OHM = `**Ohm's law** says the current through a conductor is directly proportional to the voltage across it, at constant temperature:

$$V = I R$$

**Example:** A 12 V battery is connected to a 4 Ω resistor.
$$I = \\frac{V}{R} = \\frac{12}{4} = 3\\ \\text{A}$$`;

const NORMALIZATION = `**Normalization** organises a relational schema to reduce redundancy and update anomalies by decomposing tables based on functional dependencies.

| Normal form | Rule |
|---|---|
| 1NF | Atomic values, no repeating groups |
| 2NF | 1NF + no partial dependency on a composite key |
| 3NF | 2NF + no transitive dependency on non-key attributes |
| BCNF | Every determinant is a candidate key |

\`\`\`sql
-- Before: Orders(order_id, customer_id, customer_name, product)
-- After (3NF):
CREATE TABLE customers (customer_id INT PRIMARY KEY, customer_name TEXT);
CREATE TABLE orders (order_id INT PRIMARY KEY, customer_id INT REFERENCES customers, product TEXT);
\`\`\``;

function canned(q: string, level: LevelId): string | null {
  const s = q.toLowerCase();
  if (s.includes("gravity")) return GRAVITY[level];
  if (/2x\s*\+\s*5\s*=\s*15/.test(s)) return SOLVE;
  if (s.includes("sdlc")) return SDLC(level);
  if (s.includes("ohm")) return OHM;
  if (s.includes("normaliz") || s.includes("normalis")) return NORMALIZATION;
  return null;
}

function generic(q: string, level: LevelId): string {
  if (young(level))
    return `Great question! 🌟 Let's explore **"${q}"** together.

Think of it like a little story: everything around us follows simple rules, and once we spot the rule, it all makes sense.

- First, notice what happens.
- Then, ask *why* it happens.
- Finally, try it yourself!

Want me to give you an example or a mini quiz? 😊`;
  if (level === "grad")
    return `Here's a technical overview of **"${q}"**.

1. **Core idea:** define the concept precisely and its underlying assumptions.
2. **Formal model:** express it mathematically or as an algorithm, noting complexity and constraints.
3. **Industry context:** where it's used in practice and common trade-offs.

\`\`\`python
# Sketch: model the idea, then validate with data
def analyse(inputs):
    return {k: v for k, v in inputs.items() if v is not None}
\`\`\``;
  return `Let's break down **"${q}"** step by step.

1. **What it is:** a clear definition in simple words.
2. **How it works:** the key steps or rules behind it.
3. **Why it matters:** where it appears in your syllabus and exams.

**Tip:** Write the definition in your own words — examiners reward clarity.`;
}

function firstPara(md: string) {
  return md.split(/\n\s*\n/)[0] ?? md;
}

function applyStyle(body: string, q: string, style: AnswerStyle, level: LevelId): string {
  if (style === "Simple") return body;
  if (style === "Exam Answer") {
    return `### Definition
${firstPara(body)}

### Explanation
${
  body
    .split(/\n\s*\n/)
    .slice(1)
    .join("\n\n") || "The concept follows directly from the definition above."
}

### Example
A standard textbook example applies this to a real situation — see the worked steps above.

### Diagram
\`\`\`mermaid
flowchart LR
  A[Concept] --> B[Rule]
  B --> C[Example]
  C --> D[Conclusion]
\`\`\`

### Conclusion
Thus, **${q.replace(/[?.]$/, "")}** can be summarised by its definition, the rule behind it and a clear example.`;
  }
  return `${body}

### Going deeper
- Connect this idea to related topics you've already studied.
- Watch for common mistakes: mixing up units, skipping steps, or memorising without understanding.

### Key takeaways
1. Understand the definition.
2. Practise with at least two examples.
3. Revise it again in 3 days to lock it in.`;
}

export function mockAnswer(q: string, level: LevelId, style: AnswerStyle, topic?: string): string {
  const s = q.toLowerCase().trim();
  const about = topic ?? "this topic";
  if (s === "explain simpler")
    return young(level)
      ? `Sure! 😊 Here's ${about} in the simplest way: imagine a tiny helper doing one easy job, again and again. That's really all it is!`
      : `In one line: **${about}** comes down to a single core idea — learn that first, and the details follow naturally.`;
  if (s === "give an example")
    return `Here's an example for **${about}**:\n\n> Imagine you're applying it to something from daily life — like a ball rolling, a phone charging, or sorting your books. Notice which rule from the explanation is at work.`;
  if (s === "quiz me on this")
    return `Quiz time on **${about}**! ✏️\n\n1. In your own words, what is it?\n2. Give one real-life example.\n3. What's a common mistake people make with it?\n\nReply with your answers and I'll check them.`;
  const body = canned(q, level);
  if (body && /2x\s*\+\s*5/.test(s)) return body; // worked solutions keep their exam steps
  return applyStyle(body ?? generic(q, level), q, style, level);
}
