// The ONLY module that talks to the backend.
import { dashboardMock, type DashboardData } from "./mock/dashboard";
import { useUiStore } from "@/store/useUiStore";

export function isMockMode(): boolean {
  if (typeof window === "undefined") return true;
  const saved = window.localStorage.getItem("useMock");
  return saved === null ? useUiStore.getState().useMock : saved !== "false";
}

export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("apiUrl");
    if (stored) return stored;
  }
  return (import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:8000";
}

const delay = () => new Promise((r) => setTimeout(r, 600 + Math.random() * 600));

export class ApiConnectionError extends Error {
  constructor(message = "Can't reach the AI server. Is the backend running?") {
    super(message);
    this.name = "ApiConnectionError";
  }
}

function apiUrl(path: string) {
  return `${getApiUrl().replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function notifyConnectionFailure(cause: unknown): never {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("eduai:backend-unavailable"));
  }
  throw new ApiConnectionError(
    cause instanceof Error && cause.message
      ? `Can't reach the AI server. Is the backend running? (${cause.message})`
      : undefined,
  );
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.clone().json()) as { message?: string; error?: string };
      message = payload.message ?? payload.error ?? message;
    } catch {
      // Keep the HTTP status message when the backend did not return JSON.
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function request<T>(
  path: string,
  mock: T | undefined,
  options: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  if (isMockMode()) {
    await delay();
    if (mock === undefined) throw new Error(`No mock data is configured for ${path}.`);
    return structuredClone(mock);
  }
  try {
    const response = await fetch(apiUrl(path), {
      method: options.method ?? "GET",
      ...(options.body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(options.body),
          }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return await parseResponse<T>(response);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    if (cause instanceof TypeError) return notifyConnectionFailure(cause);
    throw cause;
  }
}

export async function checkApiHealth(signal?: AbortSignal): Promise<void> {
  try {
    const response = await fetch(apiUrl("/health"), signal ? { signal } : {});
    if (!response.ok) throw new Error(`Health check returned ${response.status}`);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    if (cause instanceof TypeError) return notifyConnectionFailure(cause);
    throw cause;
  }
}

export function uploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl(path));
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Upload failed (${xhr.status})`));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as T);
      } catch {
        reject(new Error("The server returned an invalid upload response."));
      }
    });
    xhr.addEventListener("error", () => {
      try {
        notifyConnectionFailure(new TypeError("Network request failed"));
      } catch (error) {
        reject(error);
      }
    });
    xhr.addEventListener("abort", () => reject(new DOMException("Upload aborted", "AbortError")));
    xhr.send(formData);
  });
}

const api = {
  getDashboard: () => request<DashboardData>("/api/dashboard", dashboardMock),
};

export const dashboardQuery = {
  queryKey: ["dashboard"],
  queryFn: api.getDashboard,
  staleTime: 60_000,
};

import { mockAnswer, type AnswerStyle } from "./mock/tutor";
import type { LevelId } from "@/store/useUserStore";

export interface TutorRequest {
  question: string;
  level: LevelId;
  style: AnswerStyle;
  topic?: string;
  subject?: string;
  session_id?: string;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

/** Streams the tutor's answer chunk by chunk (word by word in mock mode). */
export async function* streamTutor(
  req: TutorRequest,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  if (!isMockMode()) {
    let response: Response;
    try {
      response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(req),
        ...(signal ? { signal } : {}),
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
      if (cause instanceof TypeError) return notifyConnectionFailure(cause);
      throw cause;
    }
    if (!response.ok) {
      await parseResponse<unknown>(response);
      throw new Error("The AI server closed the chat stream.");
    }
    if (!response.body) throw new Error("The AI server returned an empty chat stream.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trimStart();
          if (data === "[DONE]") return;
          if (!data) continue;
          let chunk = data;
          try {
            const parsed: unknown = JSON.parse(data);
            if (typeof parsed === "string") chunk = parsed;
            else if (parsed && typeof parsed === "object") {
              const item = parsed as {
                token?: unknown;
                delta?: unknown;
                text?: unknown;
                error?: unknown;
              };
              if (typeof item.error === "string") throw new Error(item.error);
              const value = item.token ?? item.delta ?? item.text;
              if (typeof value === "string") chunk = value;
            }
          } catch (cause) {
            if (cause instanceof Error && !(cause instanceof SyntaxError)) throw cause;
          }
          if (chunk) yield chunk;
        }
        if (done) break;
      }
      const finalLine = buffer.trim();
      if (finalLine.startsWith("data:")) {
        const data = finalLine.slice(5).trimStart();
        if (data && data !== "[DONE]") yield data;
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }
  await sleep(500 + Math.random() * 400, signal);
  if (/simulate error/i.test(req.question))
    throw new Error("The tutor couldn't respond. Please try again.");
  const text = mockAnswer(req.question, req.level, req.style, req.topic);
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    yield part;
    if (/\S/.test(part)) await sleep(12 + Math.random() * 22, signal);
  }
}

/* ---------- Exam Solver & Study From My Book (mock) ---------- */
import {
  sampleQuestions,
  genericSolution,
  solutionAction,
  type PaperQuestion,
  type SolveMode,
  type SolveStyle,
} from "./mock/solver";
import * as book from "./mock/book";

export async function solvePaper(opts: {
  file: File | null;
  sample?: boolean;
  level: LevelId;
  subject?: string;
  mode?: SolveMode;
  style: SolveStyle;
  onProgress?: (percent: number) => void;
}): Promise<PaperQuestion[]> {
  if (!isMockMode()) {
    const form = new FormData();
    if (opts.file) form.append("file", opts.file);
    form.append("sample", String(Boolean(opts.sample)));
    form.append("level", opts.level);
    if (opts.subject) form.append("subject", opts.subject);
    if (opts.mode) form.append("mode", opts.mode);
    form.append("style", opts.style);
    return uploadWithProgress<PaperQuestion[]>("/api/solve", form, opts.onProgress);
  }
  await sleep(400);
  if (opts.file && /unreadable|blur/i.test(opts.file.name))
    throw new Error("We couldn't read this file.");
  return sampleQuestions(opts.level, opts.style);
}

export async function resolveQuestion(
  q: PaperQuestion,
  text: string,
  level: LevelId,
  style: SolveStyle,
): Promise<PaperQuestion> {
  if (!isMockMode()) {
    return request<PaperQuestion>("/api/solve/resolve", q, {
      method: "POST",
      body: { question: q, text, level, style },
    });
  }
  await sleep(900);
  const match = sampleQuestions(level, style).find((s) => s.text === text);
  return { ...q, text, status: "solved", solution: match ? match.solution : genericSolution(text) };
}

export async function solutionFollowUp(
  kind: "simpler" | "method" | "similar",
  q: PaperQuestion,
): Promise<string> {
  if (!isMockMode()) {
    return request<string>("/api/solve/follow-up", "", {
      method: "POST",
      body: { kind, question: q },
    });
  }
  await sleep(700 + Math.random() * 400);
  return solutionAction(kind, q);
}

export async function uploadDoc(
  file: File,
  onStep: (step: number) => void,
  onProgress?: (percent: number) => void,
): Promise<book.BookDoc> {
  if (!isMockMode()) {
    const form = new FormData();
    form.append("file", file);
    return uploadWithProgress<book.BookDoc>("/api/docs/upload", form, onProgress);
  }
  for (let i = 0; i < 3; i++) {
    onStep(i);
    await sleep(800);
  }
  return {
    id: `doc-${Date.now()}`,
    title: file.name,
    pages: Math.max(4, Math.round(file.size / 60000)) || 12,
    uploadedAt: new Date().toISOString().slice(0, 10),
    sections: [
      { title: "Introduction", page: 1 },
      { title: "Core concepts", page: 4 },
      { title: "Examples", page: 8 },
      { title: "Summary", page: 11 },
    ],
  };
}

export async function askDoc(
  _docId: string,
  question: string,
  level: LevelId,
): Promise<{ text: string; sources: book.Source[] }> {
  if (!isMockMode()) {
    return request<{ text: string; sources: book.Source[] }>(
      `/api/docs/${encodeURIComponent(_docId)}/ask`,
      undefined,
      {
        method: "POST",
        body: { question, level },
      },
    );
  }
  await sleep(800);
  return book.chatAnswer(question, level);
}

export type DocTask = "explain" | "summary" | "notes" | "mcqs" | "flashcards" | "questions";
export type DocGenerationResult =
  | { kind: "explain" | "summary" | "notes"; md: string }
  | { kind: "mcqs"; mcqs: book.Mcq[] }
  | { kind: "flashcards"; cards: book.Flashcard[] }
  | { kind: "questions"; questions: book.ImportantQ[] };

export async function generateFromDoc(_docId: string, task: DocTask): Promise<DocGenerationResult> {
  if (!isMockMode()) {
    return request<DocGenerationResult>(
      `/api/docs/${encodeURIComponent(_docId)}/generate`,
      undefined,
      {
        method: "POST",
        body: { task },
      },
    );
  }
  await sleep(1000 + Math.random() * 500);
  switch (task) {
    case "explain":
      return { kind: task, md: book.explainMd } as const;
    case "summary":
      return { kind: task, md: book.summaryMd } as const;
    case "notes":
      return { kind: task, md: book.notesMd } as const;
    case "mcqs":
      return { kind: task, mcqs: book.mcqs } as const;
    case "flashcards":
      return { kind: task, cards: book.flashcards } as const;
    case "questions":
      return { kind: task, questions: book.importantQs } as const;
  }
}

/* ---------- Practice Papers & AI Paper Checking (mock) ---------- */
import {
  buildPaper,
  gradePaper,
  sampleEvaluations,
  reEvaluate,
  type Paper,
  type Evaluation,
  type Difficulty,
} from "./mock/practice";

export async function generatePaper(opts: {
  level: LevelId;
  subject: string;
  chapter: string;
  difficulty: Difficulty;
  totalMarks: number;
  timeMin: number;
  weakFocus: string[];
}): Promise<Paper> {
  if (!isMockMode()) {
    return request<Paper>("/api/practice/generate", undefined, { method: "POST", body: opts });
  }
  await sleep(1400);
  return buildPaper(opts);
}

export async function submitPaper(
  paper: Paper,
  answers: Record<string, string>,
  timeUsedSec: number,
) {
  if (!isMockMode()) {
    return request<Awaited<ReturnType<typeof gradePaper>>>(
      `/api/practice/${encodeURIComponent(paper.id)}/submit`,
      undefined,
      { method: "POST", body: { answers, timeUsedSec } },
    );
  }
  await sleep(1200);
  return gradePaper(paper, answers, timeUsedSec);
}

export async function checkHandwritten(
  files: { name: string; file?: File }[],
  onStep?: (i: number) => void,
  onProgress?: (percent: number) => void,
  paper?: { paperId?: string; questionPaper?: File },
): Promise<Evaluation[]> {
  if (!isMockMode()) {
    const form = new FormData();
    for (const item of files) {
      if (!item.file)
        throw new Error(`The file "${item.name}" is no longer available. Please select it again.`);
      form.append("answers", item.file, item.name);
    }
    if (paper?.paperId) form.append("paperId", paper.paperId);
    if (paper?.questionPaper) form.append("questionPaper", paper.questionPaper);
    return uploadWithProgress<Evaluation[]>("/api/practice/check", form, onProgress);
  }
  for (let i = 0; i < 4; i++) {
    onStep?.(i);
    await sleep(750);
  }
  return structuredClone(sampleEvaluations);
}

export async function reEvaluateAnswer(e: Evaluation, answer: string): Promise<Evaluation> {
  if (!isMockMode()) {
    return request<Evaluation>(`/api/practice/${encodeURIComponent(e.id)}/re-evaluate`, undefined, {
      method: "POST",
      body: { answer },
    });
  }
  await sleep(900);
  return reEvaluate(e, answer);
}

/* ---------- Diagram Maker & PPT Maker (mock) ---------- */
import {
  generateDeckMock,
  generateDiagramMock,
  refineDiagramMock,
  type DeckSlide,
  type DiagramType,
  type GeneratedDeck,
  type GeneratedDiagram,
  type PptTheme,
} from "./mock/creative";
import {
  CODE_LANGUAGES,
  LOOP_EXERCISE,
  createExercise,
  gradeVivaAnswer,
  vivaQuestions,
  type CodeActionKind,
  type CodeActionResult,
  type CodeLanguage,
  type ExerciseDifficulty,
  type ProgressSnapshot,
  type VivaAnswerFeedback,
  type VivaQuestion,
  type VivaReport,
} from "./mock/learning";
import { mockProgress } from "./mock/learning";

export async function generateDiagram(opts: {
  prompt: string;
  type: DiagramType;
  level: LevelId;
  forceFlowchart?: boolean;
  forceMindMap?: boolean;
}): Promise<GeneratedDiagram> {
  if (!isMockMode()) {
    return request<GeneratedDiagram>("/api/diagram", undefined, { method: "POST", body: opts });
  }
  await sleep(1100);
  if (/simulate error/i.test(opts.prompt))
    throw new Error("We couldn't generate this diagram. Try another prompt.");
  return generateDiagramMock(
    opts.prompt,
    opts.type,
    opts.level,
    opts.forceFlowchart,
    opts.forceMindMap,
  );
}

export async function refineDiagram(
  diagram: GeneratedDiagram,
  instruction: string,
  level: LevelId,
): Promise<GeneratedDiagram> {
  if (!isMockMode()) {
    return request<GeneratedDiagram>("/api/diagram", undefined, {
      method: "POST",
      body: { action: "refine", diagram, instruction, level },
    });
  }
  await sleep(850);
  if (/simulate error/i.test(instruction))
    throw new Error("We couldn't refine this diagram. Please try again.");
  return refineDiagramMock(diagram, instruction, level);
}

export async function generatePpt(
  opts: {
    topic: string;
    level: LevelId;
    slides: number;
    theme: PptTheme;
    speakerNotes: boolean;
    includeDiagrams: boolean;
    includeQuiz: boolean;
    extra: string;
  },
  onStep?: (step: number) => void,
): Promise<GeneratedDeck> {
  if (!isMockMode()) {
    onStep?.(0);
    const result = await request<GeneratedDeck>("/api/ppt", undefined, {
      method: "POST",
      body: opts,
    });
    onStep?.(4);
    return result;
  }
  for (let step = 0; step < 5; step++) {
    onStep?.(step);
    await sleep(420);
  }
  if (/simulate error/i.test(opts.topic))
    throw new Error("We couldn't build this deck. Please try again.");
  return generateDeckMock(
    opts.topic,
    opts.level,
    opts.slides,
    opts.theme,
    opts.speakerNotes,
    opts.includeDiagrams,
    opts.includeQuiz,
    opts.extra,
  );
}

export async function exportPptx(opts: {
  topic: string;
  theme: PptTheme;
  slides: DeckSlide[];
  speakerNotes: boolean;
}): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(apiUrl("/api/pptx"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
  } catch (cause) {
    if (cause instanceof TypeError) return notifyConnectionFailure(cause);
    throw cause;
  }
  if (!response.ok) {
    let message = `PowerPoint export failed (${response.status})`;
    try {
      const payload = (await response.clone().json()) as {
        detail?: string;
        message?: string;
        error?: string;
      };
      message = payload.detail ?? payload.message ?? payload.error ?? message;
    } catch {
      // Keep the HTTP status message when the backend did not return JSON.
    }
    throw new Error(message);
  }
  return response.blob();
}

/* ---------- Coding Practice, Viva Mode, and Progress (mock) ---------- */
export async function codeAction(opts: {
  action: CodeActionKind;
  code: string;
  language: CodeLanguage;
  level: LevelId;
  topic?: string;
  difficulty?: ExerciseDifficulty;
  hintIndex?: number;
  input?: string;
}): Promise<CodeActionResult> {
  if (!isMockMode()) {
    return request<CodeActionResult>("/api/code", undefined, { method: "POST", body: opts });
  }
  await sleep(opts.action === "Run" ? 700 : 850);
  if (/simulate error/i.test(opts.code + (opts.topic ?? "")))
    throw new Error("The coding assistant couldn't complete that action. Please try again.");
  const levelText =
    opts.level === "c1-5"
      ? "In simple words,"
      : opts.level === "grad"
        ? "Technically,"
        : "Here's the key idea:";
  switch (opts.action) {
    case "Explain":
      return {
        markdown: `${levelText} the loop stops before it reaches the stop value. Here, \`range(1, n)\` visits 1, 2, 3, and 4, so the sum is **10** rather than 15.\n\n\`\`\`python\nfor number in range(1, n + 1):\n    total += number\n\`\`\`\n\nAdding one to the stop value includes n.`,
      };
    case "Debug":
      return {
        markdown: `**Bug found: off-by-one boundary.** The upper bound of \`range\` is exclusive, so the last intended value is skipped.\n\n\`\`\`python\nfor number in range(1, n + 1):\n    total += number\n\`\`\`\n\nThis fix includes both endpoints.`,
      };
    case "Predict Output":
      return {
        markdown: "With `n = 5`, the loop visits **1, 2, 3, 4**. The values add up to **10**.",
        output: "10",
      };
    case "Give Hint":
      return {
        markdown: `Hint ${Math.min((opts.hintIndex ?? 0) + 1, LOOP_EXERCISE.hints.length)}: ${LOOP_EXERCISE.hints[Math.min(opts.hintIndex ?? 0, LOOP_EXERCISE.hints.length - 1)]}`,
      };
    case "Generate Test Cases":
      return {
        markdown:
          "A useful test set checks a normal case, the smallest valid input, a larger input, and a boundary.",
        tests: [
          { input: "n = 5", expected: "15", actual: "10", passed: false },
          { input: "n = 1", expected: "1", actual: "0", passed: false },
          { input: "n = 10", expected: "55", actual: "45", passed: false },
          { input: "n = 0", expected: "0", actual: "0", passed: true },
        ],
      };
    case "Run":
      return {
        markdown: "Demo sandbox output for the starter code.",
        output:
          opts.language === "Python"
            ? "10\nProcess finished (demo sandbox)"
            : "Run is available for Python in demo mode.",
      };
    case "Interview":
      return {
        markdown:
          "## Mock interview feedback\n\n- **Code quality:** The accumulator is clear and easy to follow.\n- **Complexity:** O(n) time and O(1) extra space.\n- **Edge cases:** Check n = 0 and n = 1.\n- **Next improvement:** Fix the exclusive loop boundary and add a test for the smallest input.",
      };
    case "Generate Exercise":
      return {
        markdown: `A ${opts.difficulty ?? "Easy"} practice exercise for ${opts.topic ?? "loops"}.`,
        exercise: createExercise(opts.topic ?? "loops", opts.difficulty ?? "Easy", opts.level),
      };
    default:
      return {
        markdown: CODE_LANGUAGES.includes(opts.language)
          ? "Ready for the next coding action."
          : "Select a supported language.",
      };
  }
}

export async function startViva(opts: {
  subject: string;
  topic: string;
  level: LevelId;
  count: number;
  adaptive: boolean;
}): Promise<VivaQuestion[]> {
  if (!isMockMode()) {
    return request<VivaQuestion[]>("/api/viva/start", undefined, { method: "POST", body: opts });
  }
  await sleep(650);
  if (/simulate error/i.test(opts.topic))
    throw new Error("The viva could not start. Please try again.");
  return vivaQuestions(opts.subject, opts.topic, opts.count);
}

export async function answerViva(
  question: VivaQuestion,
  answer: string,
  level: LevelId,
): Promise<VivaAnswerFeedback> {
  if (!isMockMode()) {
    return request<VivaAnswerFeedback>("/api/viva/answer", undefined, {
      method: "POST",
      body: { question, answer, level },
    });
  }
  await sleep(650);
  if (/simulate error/i.test(answer))
    throw new Error("We couldn't evaluate that answer. Please try again.");
  return gradeVivaAnswer(question, answer, level);
}

export async function getProgress(
  snapshot: ProgressSnapshot = mockProgress,
): Promise<ProgressSnapshot> {
  if (!isMockMode()) return request<ProgressSnapshot>("/api/progress", undefined);
  await sleep(350);
  return structuredClone(snapshot);
}

export async function createVivaReport(opts: {
  subject: string;
  topic: string;
  level: LevelId;
  answers: { question: VivaQuestion; answer: string; feedback: VivaAnswerFeedback }[];
}): Promise<VivaReport> {
  if (!isMockMode()) {
    return request<VivaReport>("/api/viva/report", undefined, {
      method: "POST",
      body: opts,
    });
  }
  await sleep(400);
  const score = opts.answers.reduce((sum, item) => sum + item.feedback.score, 0);
  const topics = new Map<string, number>();
  for (const item of opts.answers)
    topics.set(item.question.topic, (topics.get(item.question.topic) ?? 0) + item.feedback.score);
  const ordered = [...topics.entries()].sort((a, b) => b[1] - a[1]);
  return {
    id: `viva-${Date.now()}`,
    subject: opts.subject,
    topic: opts.topic,
    level: opts.level,
    score,
    total: opts.answers.length,
    strengths: ordered.filter(([, points]) => points >= 1).map(([name]) => name),
    improvements: ordered.filter(([, points]) => points < 1).map(([name]) => name),
    questions: opts.answers.map(({ question, answer, feedback }) => ({
      question: question.question,
      topic: question.topic,
      answer,
      feedback,
    })),
    createdAt: new Date().toISOString(),
  };
}
