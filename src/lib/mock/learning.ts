import type { LevelId } from "@/store/useUserStore";
import type { Topic } from "./dashboard";

export type CodeLanguage = "Python" | "Java" | "C" | "C++" | "JavaScript" | "SQL" | "HTML/CSS";
export type CodeActionKind =
  | "Explain"
  | "Debug"
  | "Predict Output"
  | "Give Hint"
  | "Generate Test Cases"
  | "Run"
  | "Interview"
  | "Generate Exercise";
export type ExerciseDifficulty = "Easy" | "Medium" | "Hard";

export interface CodeExercise {
  id: string;
  title: string;
  topic: string;
  difficulty: ExerciseDifficulty;
  statement: string;
  examples: { input: string; output: string }[];
  starter: Partial<Record<CodeLanguage, string>>;
  solution: string;
  expectedOutput: string;
  hints: string[];
}
export interface CodeTestCase {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
}
export interface CodeActionResult {
  markdown: string;
  output?: string;
  tests?: CodeTestCase[];
  hints?: string[];
  exercise?: CodeExercise;
}

export const CODE_LANGUAGES: CodeLanguage[] = [
  "Python",
  "Java",
  "C",
  "C++",
  "JavaScript",
  "SQL",
  "HTML/CSS",
];
export const EXERCISE_TOPICS = ["loops", "arrays", "recursion", "SQL joins", "OOP"];
export const STARTERS: Record<CodeLanguage, string> = {
  Python: `# Find the sum of numbers from 1 through n
n = 5
total = 0

for number in range(1, n):  # Can you spot the boundary issue?
    total += number

print(total)`,
  Java: `class Main {
    public static void main(String[] args) {
        int n = 5;
        int total = 0;
        for (int number = 1; number < n; number++) {
            total += number;
        }
        System.out.println(total);
    }
}`,
  C: `#include <stdio.h>

int main(void) {
    int n = 5, total = 0;
    for (int number = 1; number < n; number++) total += number;
    printf("%d\\n", total);
    return 0;
}`,
  "C++": `#include <iostream>
using namespace std;

int main() {
    int n = 5, total = 0;
    for (int number = 1; number < n; number++) total += number;
    cout << total << endl;
}`,
  JavaScript: `const n = 5;
let total = 0;
for (let number = 1; number < n; number++) {
  total += number;
}
console.log(total);`,
  SQL: `-- Find each customer's total order amount
SELECT customer_id, SUM(amount) AS total
FROM orders
GROUP BY customer_id;`,
  "HTML/CSS": `<!doctype html>
<html>
  <body>
    <main class="card">
      <h1>Hello, learner!</h1>
      <p>Style this card with CSS.</p>
    </main>
  </body>
</html>

<style>
.card { padding: 1rem; border-radius: 1rem; }
</style>`,
};

export const LOOP_EXERCISE: CodeExercise = {
  id: "sum-loop",
  title: "Sum from 1 to n",
  topic: "loops",
  difficulty: "Easy",
  statement:
    "Given a positive integer n, calculate the sum of every integer from 1 through n, inclusive.",
  examples: [
    { input: "n = 5", output: "15" },
    { input: "n = 1", output: "1" },
  ],
  starter: { ...STARTERS },
  solution: `n = 5
total = 0

for number in range(1, n + 1):
    total += number

print(total)`,
  expectedOutput: "15",
  hints: [
    "Check whether the loop visits n itself.",
    "Python's range stop value is excluded. What stop value includes n?",
    "Use range(1, n + 1) so the loop includes the final number.",
  ],
};

export function createExercise(
  topic: string,
  difficulty: ExerciseDifficulty,
  level: LevelId,
): CodeExercise {
  if (/loop/i.test(topic)) return { ...LOOP_EXERCISE, id: `loop-${Date.now()}`, topic, difficulty };
  const title = topic.toLowerCase().includes("sql")
    ? "Join the library tables"
    : `Practise ${topic}`;
  const statement = /sql/i.test(topic)
    ? "Write a query that lists each member's name and the title of every book they have borrowed. Use the MEMBER, LOAN, and BOOK tables."
    : `Write a ${difficulty.toLowerCase()}-level ${topic} solution. Explain your approach clearly and consider edge cases.`;
  return {
    ...LOOP_EXERCISE,
    id: `exercise-${Date.now()}`,
    title,
    topic,
    difficulty,
    statement: `${statement} Aim your explanation at ${level === "grad" ? "a technical audience" : "your class level"}.`,
    examples: [{ input: "sample input", output: "expected result" }],
    hints: [
      "Identify the inputs and the shape of the expected output.",
      "Break the task into smaller steps and try a small example.",
      "Check empty or boundary cases before you finish.",
    ],
  };
}

export interface VivaQuestion {
  id: string;
  question: string;
  topic: string;
  keywords: string[];
  explanation: string;
  followUp?: string;
}
export interface VivaAnswerFeedback {
  label: "Good" | "Partially correct" | "Needs work";
  score: number;
  explanation: string;
  ideal: string;
}
export interface VivaReport {
  id: string;
  subject: string;
  topic: string;
  level: LevelId;
  score: number;
  total: number;
  strengths: string[];
  improvements: string[];
  questions: { question: string; topic: string; answer: string; feedback: VivaAnswerFeedback }[];
  createdAt: string;
}

const DBMS_QUESTIONS: VivaQuestion[] = [
  {
    id: "dbms-1",
    question: "What is normalization, and why do we use it?",
    topic: "Normalization",
    keywords: ["redundancy", "anomaly", "data"],
    explanation:
      "Normalization organises relational data to reduce duplication and update anomalies.",
    followUp: "Can you name one anomaly that normalization helps prevent?",
  },
  {
    id: "dbms-2",
    question: "What is the key requirement for a table to be in Second Normal Form (2NF)?",
    topic: "2NF",
    keywords: ["1nf", "partial", "dependency", "key"],
    explanation:
      "A relation must be in 1NF, and every non-key attribute must depend on the whole candidate key.",
    followUp: "What is a partial dependency?",
  },
  {
    id: "dbms-3",
    question: "How does BCNF differ from 3NF?",
    topic: "BCNF",
    keywords: ["determinant", "superkey", "3nf"],
    explanation: "BCNF requires every determinant to be a superkey, a stricter rule than 3NF.",
    followUp: "What should be true of every determinant in BCNF?",
  },
  {
    id: "dbms-4",
    question: "What is a primary key?",
    topic: "Keys",
    keywords: ["unique", "identify", "row"],
    explanation: "A primary key uniquely identifies each row and cannot be null.",
    followUp: "Can a primary key contain more than one column?",
  },
  {
    id: "dbms-5",
    question: "What is a foreign key used for?",
    topic: "Relationships",
    keywords: ["reference", "table", "relationship"],
    explanation:
      "A foreign key references a key in another table and helps maintain referential integrity.",
    followUp: "What happens when a referenced row is deleted?",
  },
  {
    id: "dbms-6",
    question: "What is the difference between an INNER JOIN and a LEFT JOIN?",
    topic: "SQL joins",
    keywords: ["matching", "all", "left", "null"],
    explanation:
      "INNER JOIN returns matching rows; LEFT JOIN also retains all left-side rows, filling missing matches with NULL.",
    followUp: "What values appear for unmatched right-side columns in a LEFT JOIN?",
  },
  {
    id: "dbms-7",
    question: "What is a database transaction?",
    topic: "Transactions",
    keywords: ["operation", "atomic", "commit"],
    explanation: "A transaction is a logical unit of work that succeeds or rolls back as a whole.",
    followUp: "What does atomicity mean?",
  },
  {
    id: "dbms-8",
    question: "Name the four ACID properties.",
    topic: "ACID",
    keywords: ["atomicity", "consistency", "isolation", "durability"],
    explanation: "ACID stands for Atomicity, Consistency, Isolation, and Durability.",
    followUp: "Which property ensures committed data persists?",
  },
  {
    id: "dbms-9",
    question: "Why are indexes used in databases?",
    topic: "Indexes",
    keywords: ["search", "faster", "query"],
    explanation:
      "Indexes speed up lookups, though they require storage and add work during updates.",
    followUp: "What is one cost of adding many indexes?",
  },
  {
    id: "dbms-10",
    question: "What is a candidate key?",
    topic: "Keys",
    keywords: ["minimal", "unique", "identify"],
    explanation: "A candidate key is a minimal set of attributes that uniquely identifies a row.",
    followUp: "How is a candidate key different from a superkey?",
  },
  {
    id: "dbms-11",
    question: "What is a database view?",
    topic: "Views",
    keywords: ["query", "virtual", "table"],
    explanation: "A view is a named query presented like a virtual table.",
    followUp: "Does a standard view usually store its result rows?",
  },
  {
    id: "dbms-12",
    question: "What is referential integrity?",
    topic: "Relationships",
    keywords: ["foreign", "reference", "valid"],
    explanation: "Referential integrity ensures foreign-key references point to valid rows.",
    followUp: "Which constraint is commonly used to enforce it?",
  },
  {
    id: "dbms-13",
    question: "When can denormalization be useful?",
    topic: "Normalization",
    keywords: ["performance", "read", "trade"],
    explanation:
      "Denormalization can improve read performance when its duplication and update trade-offs are managed.",
    followUp: "What risk should be considered before denormalizing?",
  },
  {
    id: "dbms-14",
    question: "What is a composite key?",
    topic: "Keys",
    keywords: ["multiple", "columns", "together"],
    explanation: "A composite key uses multiple columns together to identify a row.",
    followUp: "Can either column alone always identify the row?",
  },
  {
    id: "dbms-15",
    question: "What is a functional dependency?",
    topic: "Dependencies",
    keywords: ["determines", "attribute", "value"],
    explanation:
      "A functional dependency X → Y means each value of X determines exactly one value of Y.",
    followUp: "In X → Y, which side is the determinant?",
  },
];

const SCIENCE_QUESTIONS: VivaQuestion[] = [
  {
    id: "science-1",
    question: "What do plants need to make their food?",
    topic: "Photosynthesis",
    keywords: ["sunlight", "water", "carbon dioxide"],
    explanation: "Plants use sunlight, water, and carbon dioxide to make food.",
    followUp: "Which green substance captures sunlight?",
  },
  {
    id: "science-2",
    question: "What is the main job of the heart?",
    topic: "Circulation",
    keywords: ["pump", "blood"],
    explanation: "The heart pumps blood around the body.",
    followUp: "What does the blood carry to our body?",
  },
  {
    id: "science-3",
    question: "What happens to water when it is heated enough?",
    topic: "States of matter",
    keywords: ["evaporate", "gas", "vapour"],
    explanation: "Water changes from a liquid into water vapour, a gas.",
    followUp: "What is this change called?",
  },
  {
    id: "science-4",
    question: "Why do we need a balanced diet?",
    topic: "Nutrition",
    keywords: ["nutrients", "energy", "growth"],
    explanation: "A balanced diet gives our bodies nutrients for energy, growth, and health.",
    followUp: "Can you name one nutrient?",
  },
  {
    id: "science-5",
    question: "What force pulls objects towards Earth?",
    topic: "Forces",
    keywords: ["gravity", "earth"],
    explanation: "Gravity is the force that pulls objects towards Earth.",
    followUp: "What happens when you drop a ball?",
  },
];

export function vivaQuestions(subject: string, topic: string, count: number): VivaQuestion[] {
  const source = /dbms|computer science/i.test(subject) ? DBMS_QUESTIONS : SCIENCE_QUESTIONS;
  const questions = [...source];
  if (topic.trim()) {
    const matched = questions.filter((question) =>
      question.topic.toLowerCase().includes(topic.toLowerCase()),
    );
    if (matched.length)
      return Array.from({ length: count }, (_, index) => matched[index % matched.length]!);
  }
  return Array.from({ length: count }, (_, index) => questions[index % questions.length]!);
}

export function gradeVivaAnswer(
  question: VivaQuestion,
  answer: string,
  level: LevelId,
): VivaAnswerFeedback {
  const text = answer.toLowerCase();
  const hits = question.keywords.filter((word) => text.includes(word.toLowerCase())).length;
  const threshold = level === "grad" ? 0.65 : 0.45;
  if (hits >= Math.max(2, Math.ceil(question.keywords.length * threshold))) {
    return {
      label: "Good",
      score: 1,
      explanation: "Clear answer — you covered the main idea.",
      ideal: question.explanation,
    };
  }
  if (hits > 0 || answer.trim().length > 30) {
    return {
      label: "Partially correct",
      score: 0.5,
      explanation: "Good start. Add one key detail to make your answer more complete.",
      ideal: question.explanation,
    };
  }
  return {
    label: "Needs work",
    score: 0,
    explanation: "Take a moment to review this idea; it will become clearer with practice.",
    ideal: question.explanation,
  };
}

export const progressMastery: Record<string, Topic[]> = {
  ...{
    Maths: [
      { name: "Algebra", value: 90 },
      { name: "Geometry", value: 70 },
      { name: "Trigonometry", value: 40 },
    ],
    Science: [
      { name: "Motion", value: 82 },
      { name: "Chemical Reactions", value: 64 },
      { name: "Electricity", value: 45 },
    ],
    CS: [
      { name: "Loops", value: 88 },
      { name: "Arrays", value: 73 },
      { name: "Recursion", value: 38 },
    ],
  },
  DBMS: [
    { name: "Normalization", value: 54 },
    { name: "SQL joins", value: 72 },
    { name: "Keys and constraints", value: 68 },
    { name: "Transactions", value: 42 },
  ],
  Biology: [
    { name: "Cells", value: 78 },
    { name: "Nutrition", value: 62 },
    { name: "Human body", value: 71 },
  ],
};

export interface ProgressSnapshot {
  mastery: Record<string, Topic[]>;
  streak: number;
  longestStreak: number;
  questionsAttempted: number;
  averageScore: number;
  weeklyMinutes: { week: string; minutes: number }[];
  activity: { date: string; count: number }[];
  weakTopics: { subject: string; topic: string; mastery: number; lastPractised: string }[];
  studyPlan: { day: string; task: string; minutes: number; subject: string }[];
}

export const mockProgress: ProgressSnapshot = {
  mastery: progressMastery,
  streak: 6,
  longestStreak: 14,
  questionsAttempted: 87,
  averageScore: 76,
  weeklyMinutes: [
    { week: "W-6", minutes: 84 },
    { week: "W-5", minutes: 112 },
    { week: "W-4", minutes: 96 },
    { week: "W-3", minutes: 138 },
    { week: "W-2", minutes: 124 },
    { week: "W-1", minutes: 164 },
    { week: "This week", minutes: 142 },
  ],
  activity: Array.from({ length: 84 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (83 - index));
    const seed = (index * 19 + 7) % 11;
    return {
      date: date.toISOString().slice(0, 10),
      count: seed < 3 ? 0 : seed < 6 ? 1 : seed < 9 ? 2 : 3,
    };
  }),
  weakTopics: [
    { subject: "Maths", topic: "Trigonometry", mastery: 40, lastPractised: "3 days ago" },
    { subject: "Science", topic: "Electricity", mastery: 45, lastPractised: "Yesterday" },
    { subject: "DBMS", topic: "Transactions", mastery: 42, lastPractised: "5 days ago" },
    { subject: "CS", topic: "Recursion", mastery: 38, lastPractised: "1 week ago" },
  ],
  studyPlan: [
    { day: "Mon", task: "Review key formulas", minutes: 15, subject: "Maths" },
    { day: "Tue", task: "Practise circuit numericals", minutes: 20, subject: "Science" },
    { day: "Wed", task: "Solve a SQL join challenge", minutes: 15, subject: "DBMS" },
    { day: "Thu", task: "Explain recursion aloud", minutes: 10, subject: "CS" },
    { day: "Fri", task: "Revise weak topics", minutes: 20, subject: "Mixed" },
    { day: "Sat", task: "Take a short practice quiz", minutes: 25, subject: "Mixed" },
    { day: "Sun", task: "Reflect and plan next week", minutes: 10, subject: "Mixed" },
  ],
};
