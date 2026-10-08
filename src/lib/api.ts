// The ONLY module that talks to the backend.
import type {
  AnswerStyle,
  BookDoc,
  CodeActionKind,
  CodeActionResult,
  CodeLanguage,
  DashboardData,
  DeckSlide,
  DiagramType,
  Difficulty,
  Evaluation,
  ExerciseDifficulty,
  Flashcard,
  GeneratedDeck,
  GeneratedDiagram,
  ImportantQ,
  Mcq,
  Paper,
  PaperQuestion,
  PaperResult,
  ProgressSnapshot,
  PptTheme,
  SolveMode,
  SolveStyle,
  Source,
  VivaAnswerFeedback,
  VivaQuestion,
  VivaReport,
} from "./types";
import type { LevelId } from "@/store/useUserStore";

export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("apiUrl");
    if (stored?.trim()) return stored;
    const configured = import.meta.env["VITE_API_URL"] as string | undefined;
    if (configured) return configured;

    const { hostname, protocol } = window.location;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      return `${protocol}//${hostname}:8000`;
    }
  }
  return (import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:8000";
}

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
      const payload = (await response.clone().json()) as {
        message?: string;
        error?: string;
        detail?: string;
      };
      message = payload.message ?? payload.error ?? payload.detail ?? message;
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
  options: {
    method?: "GET" | "POST" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
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
        let message = `Upload failed (${xhr.status})`;
        try {
          const payload = JSON.parse(xhr.responseText) as {
            message?: string;
            error?: string;
            detail?: string;
          };
          message = payload.message ?? payload.error ?? payload.detail ?? message;
        } catch {
          // Keep the HTTP status message when the upload response is not JSON.
        }
        reject(new Error(message));
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

export const dashboardQuery = {
  queryKey: ["dashboard"],
  queryFn: () => request<DashboardData>("/api/dashboard"),
  staleTime: 60_000,
};

export interface TutorRequest {
  question: string;
  level: LevelId;
  style: AnswerStyle;
  topic?: string;
  subject?: string;
  session_id?: string;
}

export async function* streamTutor(
  req: TutorRequest,
  signal?: AbortSignal,
): AsyncGenerator<string> {
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
}

export async function listDocs(): Promise<BookDoc[]> {
  return request<BookDoc[]>("/api/docs");
}

export async function solvePaper(opts: {
  file: File;
  level: LevelId;
  subject?: string;
  mode?: SolveMode;
  style: SolveStyle;
  onProgress?: (percent: number) => void;
}): Promise<PaperQuestion[]> {
  const form = new FormData();
  form.append("file", opts.file);
  form.append("level", opts.level);
  if (opts.subject) form.append("subject", opts.subject);
  if (opts.mode) form.append("mode", opts.mode);
  form.append("style", opts.style);
  return uploadWithProgress<PaperQuestion[]>("/api/solve", form, opts.onProgress);
}

export async function resolveQuestion(
  question: PaperQuestion,
  text: string,
  level: LevelId,
  style: SolveStyle,
): Promise<PaperQuestion> {
  return request<PaperQuestion>("/api/solve/resolve", {
    method: "POST",
    body: { question, text, level, style },
  });
}

export async function solutionFollowUp(
  kind: "simpler" | "method" | "similar",
  question: PaperQuestion,
): Promise<string> {
  return request<string>("/api/solve/follow-up", {
    method: "POST",
    body: { kind, question },
  });
}

export async function uploadDoc(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<BookDoc> {
  const form = new FormData();
  form.append("file", file);
  return uploadWithProgress<BookDoc>("/api/docs/upload", form, onProgress);
}

export async function askDoc(
  docId: string,
  question: string,
  level: LevelId,
): Promise<{ text: string; sources: Source[] }> {
  return request<{ text: string; sources: Source[] }>(
    `/api/docs/${encodeURIComponent(docId)}/ask`,
    {
      method: "POST",
      body: { question, level },
    },
  );
}

export type DocTask = "explain" | "summary" | "notes" | "mcqs" | "flashcards" | "questions";
export type DocGenerationResult =
  | { kind: "explain" | "summary" | "notes"; md: string }
  | { kind: "mcqs"; mcqs: Mcq[] }
  | { kind: "flashcards"; cards: Flashcard[] }
  | { kind: "questions"; questions: ImportantQ[] };

export async function generateFromDoc(docId: string, task: DocTask): Promise<DocGenerationResult> {
  return request<DocGenerationResult>(`/api/docs/${encodeURIComponent(docId)}/generate`, {
    method: "POST",
    body: { task },
  });
}

export async function generatePaper(opts: {
  level: LevelId;
  subject: string;
  chapter: string;
  difficulty: Difficulty;
  totalMarks: number;
  timeMin: number;
  weakFocus: string[];
}): Promise<Paper> {
  return request<Paper>("/api/practice/generate", { method: "POST", body: opts });
}

export async function submitPaper(
  paper: Paper,
  answers: Record<string, string>,
  timeUsedSec: number,
): Promise<PaperResult> {
  return request<PaperResult>(`/api/practice/${encodeURIComponent(paper.id)}/submit`, {
    method: "POST",
    body: { answers, timeUsedSec },
  });
}

export async function checkHandwritten(
  files: { name: string; file?: File }[],
  onProgress?: (percent: number) => void,
  paper?: { paperId?: string; questionPaper?: File },
): Promise<Evaluation[]> {
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

export async function reEvaluateAnswer(
  evaluation: Evaluation,
  answer: string,
): Promise<Evaluation> {
  return request<Evaluation>(`/api/practice/${encodeURIComponent(evaluation.id)}/re-evaluate`, {
    method: "POST",
    body: { answer },
  });
}

export async function generateDiagram(opts: {
  prompt: string;
  type: DiagramType;
  level: LevelId;
  forceFlowchart?: boolean;
  forceMindMap?: boolean;
}): Promise<GeneratedDiagram> {
  return request<GeneratedDiagram>("/api/diagram", { method: "POST", body: opts });
}

export async function refineDiagram(
  diagram: GeneratedDiagram,
  instruction: string,
  level: LevelId,
): Promise<GeneratedDiagram> {
  return request<GeneratedDiagram>("/api/diagram", {
    method: "POST",
    body: { action: "refine", diagram, instruction, level },
  });
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
  onStep?.(0);
  const result = await request<GeneratedDeck>("/api/ppt", { method: "POST", body: opts });
  onStep?.(4);
  return result;
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
    await parseResponse<unknown>(response);
    throw new Error(`PowerPoint export failed (${response.status})`);
  }
  return response.blob();
}

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
  return request<CodeActionResult>("/api/code", { method: "POST", body: opts });
}

export async function startViva(opts: {
  subject: string;
  topic: string;
  level: LevelId;
  count: number;
  adaptive: boolean;
}): Promise<VivaQuestion[]> {
  return request<VivaQuestion[]>("/api/viva/start", { method: "POST", body: opts });
}

export async function answerViva(
  question: VivaQuestion,
  answer: string,
  level: LevelId,
): Promise<VivaAnswerFeedback> {
  return request<VivaAnswerFeedback>("/api/viva/answer", {
    method: "POST",
    body: { question, answer, level },
  });
}

export async function getProgress(): Promise<ProgressSnapshot> {
  return request<ProgressSnapshot>("/api/progress");
}

export async function resetLearningActivity(): Promise<void> {
  await request<{ status: string }>("/api/progress", { method: "DELETE" });
}

export async function createVivaReport(opts: {
  subject: string;
  topic: string;
  level: LevelId;
  answers: { question: VivaQuestion; answer: string; feedback: VivaAnswerFeedback }[];
}): Promise<VivaReport> {
  return request<VivaReport>("/api/viva/report", { method: "POST", body: opts });
}
