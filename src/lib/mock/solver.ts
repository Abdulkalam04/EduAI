import type { LevelId } from "@/store/useUserStore";

export type SolveMode = "teach" | "exam";
export type SolveStyle = "Simple" | "Exam" | "Detailed";

export interface SolutionBlock {
  label: string;
  content: string;
}
export interface Solution {
  given: string[];
  steps: string[];
  therefore: string;
  answer: string;
  /** Theory answers use labelled blocks instead of steps. */
  blocks?: SolutionBlock[];
}
export interface PaperQuestion {
  id: string;
  n: number;
  text: string;
  marks: number;
  status: "solved" | "review";
  hints: [string, string];
  solution: Solution;
}

const young = (l: LevelId) => l === "c1-5" || l === "c6-8";

export function sampleQuestions(level: LevelId, style: SolveStyle): PaperQuestion[] {
  const detailed = style === "Detailed";
  const simple = style === "Simple";
  const qs: Omit<PaperQuestion, "id" | "n">[] = [
    {
      text: "Find $x$: $2x + 5 = 15$",
      marks: 2,
      status: "solved",
      hints: [
        "Try to get $2x$ alone on one side first.",
        "What do you do to both sides to remove $+5$? Then divide by 2.",
      ],
      solution: {
        given: ["$2x + 5 = 15$"],
        steps: [
          "Subtract 5 from both sides: $2x + 5 - 5 = 15 - 5$",
          "Simplify: $2x = 10$",
          "Divide both sides by 2: $x = \\dfrac{10}{2}$",
          ...(detailed ? ["Check: $2(5) + 5 = 15$ ✓"] : []),
        ],
        therefore: "$x = 5$",
        answer: "$x = 5$",
      },
    },
    {
      text: "Factorise $x^2 + 5x + 6$",
      marks: 3,
      status: "solved",
      hints: [
        "Find two numbers that multiply to 6 and add to 5.",
        "The numbers are 2 and 3 — split the middle term.",
      ],
      solution: {
        given: ["$x^2 + 5x + 6$", "Product $= 6$, Sum $= 5$"],
        steps: [
          "Split the middle term: $x^2 + 2x + 3x + 6$",
          "Group: $x(x + 2) + 3(x + 2)$",
          "Take out the common factor: $(x + 2)(x + 3)$",
          ...(detailed ? ["Check by expanding: $x^2 + 3x + 2x + 6 = x^2 + 5x + 6$ ✓"] : []),
        ],
        therefore: "$x^2 + 5x + 6 = (x+2)(x+3)$",
        answer: "$(x + 2)(x + 3)$",
      },
    },
    {
      text: "Find the area of a circle of radius 7 cm (use $\\pi = \\tfrac{22}{7}$).",
      marks: 2,
      status: "solved",
      hints: [
        "The area formula is $A = \\pi r^2$.",
        "Substitute $r = 7$ — the 7 cancels nicely with $\\tfrac{22}{7}$.",
      ],
      solution: {
        given: ["$r = 7$ cm", "$\\pi = \\tfrac{22}{7}$"],
        steps: [
          "Formula: $A = \\pi r^2$",
          "Substitute: $A = \\dfrac{22}{7} \\times 7 \\times 7$",
          "Simplify: $A = 22 \\times 7 = 154$",
        ],
        therefore: "The area of the circle is $154\\ \\text{cm}^2$.",
        answer: "$154\\ \\text{cm}^2$",
      },
    },
    {
      text: "Solve: $x + y = 10$ and $x - y = 2$",
      marks: 3,
      status: young(level) ? "review" : "solved",
      hints: [
        "Add the two equations — what happens to $y$?",
        "After finding $x$, substitute back to find $y$.",
      ],
      solution: {
        given: ["$x + y = 10 \\quad (1)$", "$x - y = 2 \\quad (2)$"],
        steps: [
          "Add (1) and (2): $2x = 12$",
          "So $x = 6$",
          "Substitute in (1): $6 + y = 10 \\Rightarrow y = 4$",
          ...(simple ? [] : ["Check in (2): $6 - 4 = 2$ ✓"]),
        ],
        therefore: "$x = 6$ and $y = 4$",
        answer: "$x = 6,\\ y = 4$",
      },
    },
    {
      text: "Define a rational number.",
      marks: 2,
      status: "solved",
      hints: [
        "Think about fractions — what form can every such number be written in?",
        "Remember the condition on the denominator.",
      ],
      solution: {
        given: [],
        steps: [],
        therefore: "",
        answer:
          "A rational number can be written as $\\tfrac{p}{q}$, where $p, q$ are integers and $q \\neq 0$.",
        blocks: [
          {
            label: "Definition",
            content:
              "A **rational number** is a number that can be written in the form $\\dfrac{p}{q}$, where $p$ and $q$ are integers and $q \\neq 0$.",
          },
          {
            label: "Explanation",
            content: young(level)
              ? "It is any number you can write as a fraction — like a share of a pizza."
              : "The set of rationals $\\mathbb{Q}$ includes all integers, terminating decimals and repeating decimals.",
          },
          {
            label: "Example",
            content:
              "$\\tfrac{3}{4},\\ -5 = \\tfrac{-5}{1},\\ 0.25 = \\tfrac{1}{4},\\ 0.\\overline{3} = \\tfrac{1}{3}$",
          },
          {
            label: "Conclusion",
            content:
              "Hence every number expressible as $\\tfrac{p}{q}$ with $q \\neq 0$ is rational.",
          },
        ],
      },
    },
  ];
  return qs.map((q, i) => ({ ...q, id: `q${i + 1}`, n: i + 1 }));
}

/** Generic solution for user-edited questions. */
export function genericSolution(text: string): Solution {
  return {
    given: [text.replace(/^find\s*/i, "")],
    steps: [
      "Identify what is given and what is asked.",
      "Apply the relevant formula or rule.",
      "Simplify carefully, showing each step.",
    ],
    therefore: "Hence the result follows from the steps above.",
    answer: "See the working above — verify with your teacher.",
  };
}

export function solutionAction(kind: "simpler" | "method" | "similar", q: PaperQuestion): string {
  if (kind === "simpler")
    return `**In simple words:** ${q.hints[0]} ${q.hints[1]} That's it — the answer is ${q.solution.answer}.`;
  if (kind === "method") {
    if (q.n === 1)
      return "**Method 2 — balancing:** Think of a scale. Take 5 off each side: $2x = 10$. Halve each side: $x = 5$.";
    if (q.n === 4)
      return "**Method 2 — substitution:** From (2), $x = y + 2$. Put in (1): $2y + 2 = 10 \\Rightarrow y = 4$, so $x = 6$.";
    if (q.n === 2)
      return "**Method 2 — quadratic formula:** $x = \\dfrac{-5 \\pm \\sqrt{25 - 24}}{2} = -2, -3$, so the factors are $(x+2)(x+3)$.";
    return "**Another way:** Work backwards from the answer and check that it satisfies every condition in the question.";
  }
  const similar: Record<number, string> = {
    1: "Find $x$: $3x - 4 = 11$ *(Answer: $x = 5$)*",
    2: "Factorise $x^2 + 7x + 12$ *(Answer: $(x+3)(x+4)$)*",
    3: "Find the area of a circle of radius 14 cm *(Answer: $616\\ \\text{cm}^2$)*",
    4: "Solve $x + y = 8,\\ x - y = 4$ *(Answer: $x = 6, y = 2$)*",
    5: "Define an irrational number and give two examples.",
  };
  return `**Try this:** ${similar[q.n] ?? "Make up a question with different numbers and solve it the same way."}`;
}
