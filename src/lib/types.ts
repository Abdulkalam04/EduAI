import type { LevelId } from "@/store/useUserStore";

export type AnswerStyle = "Simple" | "Exam Answer" | "Detailed";

export interface Topic {
  name: string;
  value: number;
}

export interface Activity {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: "tutor" | "solver" | "practice" | "book" | "ppt";
}

export interface PlanItem {
  id: string;
  title: string;
  meta: string;
  done: boolean;
}

export interface DashboardData {
  stats: { dailyProgress: number; streak: number; xpWeek: number; solved: number };
  mastery: Record<string, Topic[]>;
  suggestion: { strong: string; weak: string };
  activity: Activity[];
  plan: PlanItem[];
}

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

export const MARK_OPTIONS = [20, 30, 50, 80, 100] as const;

export const timeForMarks = (marks: number) => Math.round((marks * 1.8) / 5) * 5;

export function paperStructure(total: number): PaperSection[] {
  const short = Math.round((total * 0.2) / 2);
  const long = Math.max(1, Math.round((total * 0.3) / 5));
  const numerical = Math.max(1, Math.round((total * 0.3) / 5));
  const mcq = Math.max(1, total - short * 2 - long * 5 - numerical * 5);
  return [
    { id: "A", name: "Multiple Choice", marks: mcq, count: mcq, each: 1 },
    { id: "B", name: "Short Answer", marks: short * 2, count: short, each: 2 },
    { id: "C", name: "Long Answer", marks: long * 5, count: long, each: 5 },
    { id: "D", name: "Numerical Problems", marks: numerical * 5, count: numerical, each: 5 },
  ];
}

export type DiagramType =
  | "Flowchart"
  | "Mind Map"
  | "Concept Map"
  | "ER Diagram"
  | "UML Class"
  | "Sequence"
  | "Process"
  | "Network"
  | "Block Diagram";

export interface GeneratedDiagram {
  id: string;
  prompt: string;
  title: string;
  type: DiagramType;
  code: string;
  explanation: string;
  level: LevelId;
  createdAt: string;
}

export type PptTheme = "Indigo Modern" | "Clean White" | "Dark Elegant" | "Playful";

export interface DeckSlide {
  id: string;
  title: string;
  bullets: string[];
  notes: string;
  kind: "title" | "content" | "quiz" | "conclusion";
  diagram?: string | undefined;
}

export interface GeneratedDeck {
  id: string;
  topic: string;
  level: LevelId;
  theme: PptTheme;
  slides: DeckSlide[];
  createdAt: string;
  speakerNotes: boolean;
}

export type CodeLanguage = "Python" | "Java" | "C" | "C++" | "JavaScript" | "SQL" | "HTML/CSS";
export const CODE_LANGUAGES: CodeLanguage[] = [
  "Python",
  "Java",
  "C",
  "C++",
  "JavaScript",
  "SQL",
  "HTML/CSS",
];
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
  questions: {
    question: string;
    topic: string;
    answer: string;
    feedback: VivaAnswerFeedback;
  }[];
  createdAt: string;
}

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
