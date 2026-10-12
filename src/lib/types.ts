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
  subject?: string;
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

// ── Chat model catalogue ────────────────────────────────────────────────────
export interface ChatModelCapabilities {
  vision: boolean;
  reasoning: boolean;
  thinking: boolean;
  long_context: boolean;
}

export type ModelHealth = "healthy" | "slow" | "cooling_down" | "unknown";
export type ModelTier = "free" | "paid";

export interface ChatModel {
  /** Stable identifier to send as the `model` field in chat requests. */
  id: string;
  /** One of: groq, gemini, openai, anthropic, … */
  provider: string;
  /** Human-readable label to show in the picker. */
  label: string;
  /** Accurate, model-specific picker description. */
  description: string;
  capabilities: ChatModelCapabilities;
  /** True only after the model passed the school-answer correctness benchmark. */
  smart: boolean;
  /** True only after a real image-understanding check passed. */
  vision_verified: boolean;
  tier: ModelTier;
  /** When true the model cannot be selected by the user (paid + disabled). */
  locked: boolean;
  health: ModelHealth;
  /** Rolling median time-to-first-token in ms over the last 20 requests, or null. */
  median_ttft_ms: number | null;
  /** ISO timestamp until which the model is in cooldown, or null. */
  cooldown_until: string | null;
  /**
   * When true, this model is a hidden alias/duplicate and should not appear in the
   * picker UI, but is valid for fallback routing. Default: false.
   */
  hidden?: boolean;
}

const CHAT_MODEL_LABELS: Record<string, string> = {
  "gemini/gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini/gemini-3.5-flash-lite": "Gemini Flash Lite",
  "gemini/gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini/gemini-3.7-flash": "Gemini 3.7 Flash",
  "gemini/gemini-3.8-flash": "Gemini 3.8 Flash",
  "gemini/gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite",
  "gemini/gemini-flash-lite-latest": "Gemini Flash Lite",
  "gemini/gemma-4-26b-a4b-it": "Gemma 4 26B IT",
  "gemini/gemma-4-31b-it": "Gemma 4 31B IT",
  "groq/llama-3.3-70b-versatile": "Llama 3.3 70B",
  "groq/meta-llama/llama-4-scout-17b-16e-instruct": "Llama 4 Scout 17B",
  "groq/qwen/qwen3.6-27b": "Qwen3.6 27B",
  "groq/qwen/qwen3.8-27b": "Qwen3.8 27B",
  "groq/openai/gpt-oss-safeguard-20b": "GPT-OSS Safeguard 20B (Groq)",
};

export function chatModelLabel(modelId: string): string {
  const known = CHAT_MODEL_LABELS[modelId];
  if (known) return known;
  const name = modelId.split("/").at(-1) ?? modelId;
  return name.replace(/[-_]+/g, " ").replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
}

export interface ChatModelsResponse {
  models: ChatModel[];
}

/** Metadata resolved by streamTutor after the first token arrives. */
export interface TutorStreamMeta {
  /** The model that actually generated the response (from X-Model-Used). */
  modelUsed?: string;
  /** The model the user originally requested (from X-Model-Requested). */
  modelRequested?: string;
  /** The model that was tried but failed and caused a fallback (from X-Model-Fallback). */
  modelFallback?: string;
  /** Measured time from fetch start to first token, in milliseconds. */
  ttftMs?: number;
}

// ── Todos ───────────────────────────────────────────────────────────────────
export interface TodoItem {
  id: string;
  list_id: string;
  user_id: string;
  text: string;
  done: boolean;
  done_at: string | null;
  due_date: string | null;
  position: number;
  created_at: string;
}

export interface TodoList {
  id: string;
  user_id: string;
  title: string;
  plan_date: string;
  is_active: boolean;
  total: number;
  done: number;
  created_at: string;
  updated_at: string;
  items: TodoItem[];
}

export interface TodoListSummary {
  id: string;
  title: string;
  plan_date: string;
  total: number;
  done: number;
  is_active: boolean;
  updated_at: string;
  previewItems: string[];
}

export interface TodoItemInput {
  text: string;
  due_date?: string | null;
}

export interface CreateTodoListInput {
  title?: string;
  plan_date: string;
  items: TodoItemInput[];
}

export interface PatchTodoListInput {
  title?: string;
  plan_date?: string;
}

export interface CopyTodoListInput {
  only_unfinished: boolean;
  plan_date: string;
  title?: string;
}

export interface PatchTodoItemInput {
  text?: string;
  done?: boolean;
  due_date?: string | null;
}
