// The ONLY module that talks to the backend.
import type {
  AnswerStyle,
  BookDoc,
  BookWorkspace,
  ChatModelsResponse,
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
  SolvedPaperHistoryItem,
  SolvedPaperHistoryRecord,
  TutorStreamMeta,
  VivaAnswerFeedback,
  VivaQuestion,
  VivaReport,
  TodoList,
  TodoItem,
  TodoListSummary,
  TodoItemInput,
  CreateTodoListInput,
  PatchTodoListInput,
  CopyTodoListInput,
  PatchTodoItemInput,
} from "./types";
import type { LevelId } from "@/store/useUserStore";

export function resolveDefaultApiUrl(hostname: string): string {
  const parts = hostname.split(".");
  const octets = parts.map(Number);
  const [firstOctet = 0, secondOctet = 0] = octets;
  const isIpv4 =
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part)) &&
    octets.every((octet) => octet >= 0 && octet <= 255);
  const isPrivateIpv4 =
    isIpv4 &&
    (firstOctet === 10 ||
      (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
      (firstOctet === 192 && secondOctet === 168));

  if (isPrivateIpv4 || hostname.toLowerCase().endsWith(".local")) {
    return `http://${hostname}:8010`;
  }
  return "http://localhost:8010";
}

export interface ApiUrlConfig {
  url: string;
  source: "saved setting" | "build default";
}

export function getApiUrlConfig(hostname?: string): ApiUrlConfig {
  const stored =
    typeof window === "undefined" ? "" : (window.localStorage.getItem("apiUrl")?.trim() ?? "");
  if (stored) return { url: stored, source: "saved setting" };

  const configured = import.meta.env["VITE_API_URL"] as string | undefined;
  if (configured?.trim()) {
    return { url: configured.trim(), source: "build default" };
  }

  const currentHostname =
    hostname ?? (typeof window === "undefined" ? "localhost" : window.location.hostname);
  return { url: resolveDefaultApiUrl(currentHostname), source: "build default" };
}

export function getApiUrl(): string {
  return getApiUrlConfig().url;
}

export function getAccessToken(): string {
  if (typeof window === "undefined") return "";

  const staticToken = window.localStorage.getItem("accessToken") || "";
  if (staticToken) return staticToken;

  try {
    const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
    const project = url?.match(/https?:\/\/([^.]+)\./)?.[1] ?? "";
    const raw = project ? window.localStorage.getItem(`sb-${project}-auth-token`) : "";
    if (!raw) return "";
    const payload = JSON.parse(raw) as { access_token?: string };
    return payload.access_token ?? "";
  } catch {
    return "";
  }
}

export function setAccessToken(token: string): void {
  if (typeof window !== "undefined") {
    if (token.trim()) {
      window.localStorage.setItem("accessToken", token.trim());
    } else {
      window.localStorage.removeItem("accessToken");
    }
  }
}

/**
 * Returns a Bearer token for the backend.
 * If forceRefresh=true, refreshes the session before returning the token.
 */
async function getSupabaseToken(forceRefresh = false): Promise<string> {
  try {
    const { hasSupabaseConfig, supabase } = await import("./supabase");
    if (!hasSupabaseConfig || !supabase) return getAccessToken();

    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      if (forceRefresh) {
        const refresh = await supabase.auth.refreshSession();
        return refresh.data.session?.access_token ?? data.session.access_token;
      }
      return data.session.access_token;
    }
  } catch {
    // Supabase not initialized or no active session.
  }
  return getAccessToken();
}

async function authHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const supabaseToken = await getSupabaseToken(forceRefresh);
  return supabaseToken ? { Authorization: `Bearer ${supabaseToken}` } : {};
}

export class ApiConnectionError extends Error {
  constructor(message = "Can't reach the AI server. Is the backend running?") {
    super(message);
    this.name = "ApiConnectionError";
  }
}

export interface ApiHealthStatus {
  backend: "online";
  gateway: "online" | "offline";
  gatewayUrl: string;
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
    method?: "GET" | "POST" | "DELETE" | "PATCH" | "PUT";
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const doFetch = async (forceRefresh = false) =>
    fetch(apiUrl(path), {
      method: options.method ?? "GET",
      headers: {
        ...(await authHeaders(forceRefresh)),
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });

  try {
    let response = await doFetch();
    if (response.status === 401) {
      response = await doFetch(true);
      if (response.status === 401) {
        if (typeof window !== "undefined") {
          const { supabase, hasSupabaseConfig } = await import("./supabase");
          if (hasSupabaseConfig && supabase) {
            await supabase.auth.signOut();
          }
          window.location.href = "/login";
        }
        throw new Error("Session expired. Please sign in again.");
      }
    }
    return await parseResponse<T>(response);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    if (cause instanceof TypeError) return notifyConnectionFailure(cause);
    throw cause;
  }
}

export async function checkApiHealth(signal?: AbortSignal): Promise<ApiHealthStatus> {
  const backendUrl = apiUrl("/health");
  const requestOptions = signal ? { signal } : {};
  let backendResponse: Response;
  try {
    backendResponse = await fetch(backendUrl, requestOptions);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    if (import.meta.env.DEV) {
      console.warn(
        `[EduAI] Backend health request failed for ${backendUrl} (browser network/CORS failure).`,
        cause,
      );
    }
    return notifyConnectionFailure(cause);
  }

  if (!backendResponse.ok && import.meta.env.DEV) {
    console.warn(`[EduAI] Backend health endpoint returned HTTP ${backendResponse.status}.`);
  }

  let backendStatus: {
    status?: string;
    omniroute?: { available?: boolean; base_url?: string; reason?: string };
  } = {};
  if (backendResponse.ok) {
    try {
      backendStatus = (await backendResponse.json()) as typeof backendStatus;
    } catch (cause) {
      if (import.meta.env.DEV) {
        console.warn("[EduAI] Backend health endpoint returned invalid JSON.", cause);
      }
    }
  }

  if (!backendResponse.ok || backendStatus.status !== "ok") {
    return { backend: "online", gateway: "offline", gatewayUrl: "OmniRoute" };
  }

  const gateway = backendStatus.omniroute;
  const gatewayUrl = gateway?.base_url || "OmniRoute";
  const isAvailable = gateway?.available === true;
  if (!isAvailable && import.meta.env.DEV) {
    console.warn(
      `[EduAI] AI gateway at ${gatewayUrl} is not responding (${gateway?.reason ?? "health unavailable"}).`,
    );
  }
  return {
    backend: "online",
    gateway: isAvailable ? "online" : "offline",
    gatewayUrl,
  };
}

export async function uploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  const token = await getSupabaseToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl(path));
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
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
  /** Model to use: "auto" (default) or a catalogue model id. */
  model?: string;
}

/** Fetch the chat model catalogue from the backend (cached 60 s server-side). */
export async function getChatModels(): Promise<ChatModelsResponse> {
  return request<ChatModelsResponse>("/api/chat/models");
}

export async function* streamTutor(
  req: TutorRequest,
  signal?: AbortSignal,
  onMeta?: (meta: TutorStreamMeta) => void,
): AsyncGenerator<string> {
  let response: Response;
  const fetchStart = performance.now();
  let firstTokenDelivered = false;
  try {
    response = await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers: {
        ...(await authHeaders()),
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
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
  // Read model headers eagerly — they are set on the response before the body.
  const modelUsed = response.headers.get("X-Model-Used") ?? undefined;
  const modelRequested = response.headers.get("X-Model-Requested") ?? undefined;
  const modelFallback = response.headers.get("X-Model-Fallback") ?? undefined;

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
        if (chunk) {
          // Fire onMeta with timing on the first yielded token.
          if (!firstTokenDelivered) {
            firstTokenDelivered = true;
            onMeta?.({
              ...(modelUsed !== undefined ? { modelUsed } : {}),
              ...(modelRequested !== undefined ? { modelRequested } : {}),
              ...(modelFallback !== undefined ? { modelFallback } : {}),
              ttftMs: Math.round(performance.now() - fetchStart),
            });
          }
          yield chunk;
        }
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

export async function getDoc(docId: string): Promise<BookWorkspace> {
  return request<BookWorkspace>(`/api/docs/${encodeURIComponent(docId)}`);
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

export async function getSolvedPaperHistory(): Promise<SolvedPaperHistoryItem[]> {
  return request<SolvedPaperHistoryItem[]>("/api/solve/history");
}

export async function getSolvedPaperHistoryRecord(
  paperId: string,
): Promise<SolvedPaperHistoryRecord> {
  return request<SolvedPaperHistoryRecord>(`/api/solve/history/${encodeURIComponent(paperId)}`);
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

export type { DocGenerationResult, DocTask } from "@/lib/types";

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
  subject?: string;
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
      headers: {
        ...(await authHeaders()),
        "Content-Type": "application/json",
      },
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

// ── Todos API ───────────────────────────────────────────────────────────────

export async function getActiveTodoList(signal?: AbortSignal): Promise<TodoList | null> {
  return request<TodoList | null>("/api/todos/active", signal ? { signal } : {});
}

export async function getTodoLists(
  params?: { status?: "unfinished" | "all"; limit?: number },
  signal?: AbortSignal,
): Promise<TodoListSummary[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return request<TodoListSummary[]>(
    `/api/todos/lists${qs ? `?${qs}` : ""}`,
    signal ? { signal } : {},
  );
}

export async function createTodoList(input: CreateTodoListInput): Promise<TodoList> {
  return request<TodoList>("/api/todos/lists", { method: "POST", body: input });
}

export async function patchTodoList(id: string, input: PatchTodoListInput): Promise<TodoList> {
  return request<TodoList>(`/api/todos/lists/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteTodoList(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/todos/lists/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function activateTodoList(
  id: string,
  input?: { plan_date?: string },
): Promise<TodoList> {
  return request<TodoList>(`/api/todos/lists/${encodeURIComponent(id)}/activate`, {
    method: "POST",
    body: input ?? {},
  });
}

export async function copyTodoList(id: string, input: CopyTodoListInput): Promise<TodoList> {
  return request<TodoList>(`/api/todos/lists/${encodeURIComponent(id)}/copy`, {
    method: "POST",
    body: input,
  });
}

export async function appendTodoItems(id: string, items: TodoItemInput[]): Promise<TodoList> {
  return request<TodoList>(`/api/todos/lists/${encodeURIComponent(id)}/items`, {
    method: "POST",
    body: { items },
  });
}

export async function patchTodoItem(id: string, input: PatchTodoItemInput): Promise<TodoItem> {
  return request<TodoItem>(`/api/todos/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteTodoItem(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/todos/items/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function reorderTodoItems(id: string, itemIds: string[]): Promise<TodoList> {
  return request<TodoList>(`/api/todos/lists/${encodeURIComponent(id)}/order`, {
    method: "PUT",
    body: { item_ids: itemIds },
  });
}

export async function clearCompletedTodoItems(id: string): Promise<TodoList> {
  return request<TodoList>(`/api/todos/lists/${encodeURIComponent(id)}/clear-completed`, {
    method: "POST",
  });
}

export async function toggleAllTodoItems(id: string, done: boolean): Promise<TodoList> {
  return request<TodoList>(`/api/todos/lists/${encodeURIComponent(id)}/toggle-all`, {
    method: "POST",
    body: { done },
  });
}
