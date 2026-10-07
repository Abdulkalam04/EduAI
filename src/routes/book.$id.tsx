import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Brain,
  Copy,
  Download,
  FileDown,
  FileText,
  Layers,
  ListChecks,
  MessageSquare,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Presentation,
  RefreshCw,
  Sparkles,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CardSkeleton,
  EmptyState,
  GradientButton,
  LevelBadge,
  SoftCard,
} from "@/components/ui-custom";
import { Markdown } from "@/components/tutor/Markdown";
import { TypingDots } from "@/components/tutor/MessageView";
import { McqQuiz } from "@/components/learning/McqQuiz";
import { FlashcardDeck } from "@/components/learning/FlashcardDeck";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { askDoc, generateFromDoc, type DocTask } from "@/lib/api";
import {
  quoteFor,
  suggestedQuestions,
  type Flashcard,
  type ImportantQ,
  type Mcq,
  type Source,
} from "@/lib/mock/book";
import { downloadPdf, downloadText } from "@/lib/pdf";
import { useBookStore } from "@/store/useBookStore";
import { useUserStore } from "@/store/useUserStore";

export const Route = createFileRoute("/book/$id")({
  head: () => ({
    meta: [
      { title: "Study workspace — EduAI" },
      {
        name: "description",
        content:
          "Chat with your document, and generate notes, MCQs, flashcards and important questions.",
      },
      { property: "og:title", content: "Study workspace — EduAI" },
      {
        property: "og:description",
        content:
          "Chat with your document, and generate notes, MCQs, flashcards and important questions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Workspace,
});

type Tab = "chat" | "notes" | "mcqs" | "flashcards" | "questions";
interface Msg {
  role: "user" | "ai";
  text: string;
  sources?: Source[];
  pending?: boolean;
  error?: boolean;
  q?: string;
}
interface Results {
  explain?: string;
  summary?: string;
  notes?: string;
  mcqs?: Mcq[];
  flashcards?: Flashcard[];
  questions?: ImportantQ[];
}

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "mcqs", label: "MCQs", icon: ListChecks },
  { id: "flashcards", label: "Flashcards", icon: Layers },
  { id: "questions", label: "Questions", icon: Star },
];
const ACTIONS: { task: DocTask | "ppt"; label: string; icon: typeof Brain; tab: Tab }[] = [
  { task: "explain", label: "Explain", icon: Brain, tab: "notes" },
  { task: "summary", label: "Summarize", icon: Sparkles, tab: "notes" },
  { task: "notes", label: "Make Notes", icon: NotebookPen, tab: "notes" },
  { task: "mcqs", label: "Generate MCQs", icon: ListChecks, tab: "mcqs" },
  { task: "flashcards", label: "Flashcards", icon: Layers, tab: "flashcards" },
  { task: "questions", label: "Important Questions", icon: Star, tab: "questions" },
  { task: "ppt", label: "Create PPT", icon: Presentation, tab: "chat" },
];

function Workspace() {
  const { id } = Route.useParams();
  const doc = useBookStore((s) => s.docs.find((d) => d.id === id));
  const level = useUserStore((s) => s.level);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("chat");
  const [panel, setPanel] = useState(true);
  const [results, setResults] = useState<Results>({});
  const [loading, setLoading] = useState<Partial<Record<DocTask, boolean>>>({});
  const [failed, setFailed] = useState<Partial<Record<DocTask, boolean>>>({});
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [pptOpen, setPptOpen] = useState(false);
  const [slides, setSlides] = useState(10);
  const [notes, setNotes] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);
  useEffect(() => {
    if (window.innerWidth < 1024) setPanel(false);
  }, []);

  if (!doc)
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon={BookOpen}
          accent="book"
          title="Document not found"
          description="It may have been deleted."
          action={
            <Link to="/book">
              <GradientButton>Back to library</GradientButton>
            </Link>
          }
        />
      </div>
    );

  const run = async (task: DocTask, force = false) => {
    if (!force && results[task]) return;
    setLoading((l) => ({ ...l, [task]: true }));
    setFailed((f) => ({ ...f, [task]: false }));
    try {
      const r = await generateFromDoc(doc.id, task);
      setResults((s) => {
        if (r.kind === "mcqs") return { ...s, mcqs: r.mcqs };
        if (r.kind === "flashcards") return { ...s, flashcards: r.cards };
        if (r.kind === "questions") return { ...s, questions: r.questions };
        return { ...s, [r.kind]: r.md };
      });
      toast.success("Generated from your document");
    } catch {
      setFailed((f) => ({ ...f, [task]: true }));
      toast.error("Generation failed");
    }
    setLoading((l) => ({ ...l, [task]: false }));
  };

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setTab("chat");
    setInput("");
    setMsgs((m) => [
      ...m,
      { role: "user", text },
      { role: "ai", text: "", pending: true, q: text },
    ]);
    try {
      const a = await askDoc(doc.id, text, level);
      setMsgs((m) =>
        m.map((x, i) =>
          i === m.length - 1 ? { role: "ai", text: a.text, sources: a.sources } : x,
        ),
      );
    } catch {
      setMsgs((m) =>
        m.map((x, i) => (i === m.length - 1 ? { role: "ai", text: "", error: true, q: text } : x)),
      );
    }
  };

  const onAction = (a: (typeof ACTIONS)[number]) => {
    if (a.task === "ppt") {
      setPptOpen(true);
      return;
    }
    setTab(a.tab);
    void run(a.task);
  };

  const anyNotesLoading = loading.notes || loading.explain || loading.summary;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 md:px-8">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          to="/book"
          aria-label="Back to library"
          className="rounded-xl border p-2 hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: "var(--book-soft)", color: "var(--book)" }}
        >
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{doc.title}</h1>
          <p className="text-xs text-muted-foreground">{doc.pages} pages</p>
        </div>
        <LevelBadge level={level} />
      </header>

      <TooltipProvider delayDuration={200}>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {ACTIONS.map((a) => (
            <Tooltip key={a.label}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onAction(a)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium shadow-soft transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <a.icon className="h-4 w-4" style={{ color: "var(--book)" }} />
                  <span className="hidden sm:inline">{a.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{a.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      <div className="flex min-h-0 gap-4">
        <AnimatePresence initial={false}>
          {panel && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="hidden shrink-0 overflow-hidden md:block"
            >
              <SoftCard className="w-60 p-3">
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Sections
                  </p>
                  <button
                    aria-label="Collapse sections"
                    onClick={() => setPanel(false)}
                    className="rounded-md p-1 hover:bg-muted"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </button>
                </div>
                <ul className="space-y-0.5">
                  {doc.sections.map((s) => (
                    <li key={s.title}>
                      <button
                        onClick={() => void ask(`Explain "${s.title}"`)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span className="truncate">{s.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">p.{s.page}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </SoftCard>
            </motion.aside>
          )}
        </AnimatePresence>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex items-center gap-2">
            {!panel && (
              <button
                aria-label="Show sections"
                onClick={() => setPanel(true)}
                className="hidden rounded-xl border p-2 hover:bg-muted md:block"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    tab === t.id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab === t.id && (
                    <motion.span
                      layoutId="book-tab"
                      className="absolute inset-0 rounded-lg bg-card shadow-soft"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <t.icon className="relative h-4 w-4" />
                  <span className="relative">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {tab === "chat" && (
                <SoftCard className="flex min-h-[60vh] flex-col">
                  <div className="flex-1 space-y-5 overflow-y-auto p-4 md:p-6">
                    {msgs.length === 0 && (
                      <div className="py-8 text-center">
                        <p className="font-semibold">Ask anything about this document</p>
                        <p className="text-sm text-muted-foreground">
                          Answers cite the pages they come from.
                        </p>
                      </div>
                    )}
                    {msgs.map((m, i) =>
                      m.role === "user" ? (
                        <div key={i} className="flex justify-end">
                          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-primary px-4 py-2.5 text-primary-foreground shadow-glow">
                            {m.text}
                          </div>
                        </div>
                      ) : (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="min-w-0"
                        >
                          {m.pending ? (
                            <TypingDots />
                          ) : m.error ? (
                            <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
                              Couldn't get an answer.
                              <GradientButton
                                size="sm"
                                variant="secondary"
                                onClick={() => void ask(m.q ?? "")}
                              >
                                <RefreshCw className="h-4 w-4" />
                                Retry
                              </GradientButton>
                            </div>
                          ) : (
                            <>
                              <Markdown content={m.text} />
                              {m.sources && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs text-muted-foreground">Sources:</span>
                                  {m.sources.map((s) => (
                                    <button
                                      key={s.page}
                                      onClick={() => setSource(s)}
                                      className="rounded-full border px-2.5 py-0.5 text-xs font-medium hover:bg-muted"
                                      style={{ color: "var(--book)" }}
                                    >
                                      Page {s.page}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </motion.div>
                      ),
                    )}
                    <div ref={endRef} />
                  </div>
                  <div className="border-t p-3">
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {suggestedQuestions.map((q) => (
                        <button
                          key={q}
                          onClick={() => void ask(q)}
                          className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void ask(input);
                      }}
                      className="flex items-center gap-2 rounded-2xl border bg-background p-1.5 pl-4"
                    >
                      <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={`Ask about ${doc.title}…`}
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        aria-label="Ask a question"
                      />
                      <button
                        type="submit"
                        aria-label="Send"
                        disabled={!input.trim()}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground disabled:opacity-40"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                </SoftCard>
              )}

              {tab === "notes" && (
                <div className="space-y-4">
                  {anyNotesLoading && <CardSkeleton lines={6} />}
                  {results.summary && (
                    <SoftCard className="p-5" style={{ background: "var(--book-soft)" }}>
                      <Markdown content={results.summary} />
                    </SoftCard>
                  )}
                  {results.explain && (
                    <SoftCard className="p-5">
                      <Markdown content={results.explain} />
                    </SoftCard>
                  )}
                  {results.notes ? (
                    <SoftCard className="p-6 md:p-8">
                      <div className="mb-4 flex flex-wrap justify-end gap-2">
                        <GradientButton
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            void navigator.clipboard.writeText(results.notes!);
                            toast.success("Notes copied");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                          Copy
                        </GradientButton>
                        <GradientButton
                          size="sm"
                          variant="secondary"
                          onClick={() => downloadText("gravitation-notes.md", results.notes!)}
                        >
                          <Download className="h-4 w-4" />
                          Markdown
                        </GradientButton>
                        <GradientButton
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            void downloadPdf("gravitation-notes.pdf", `Notes — ${doc.title}`, [
                              { body: results.notes! },
                            ])
                              .then(() => toast.success("PDF downloaded"))
                              .catch((cause: unknown) =>
                                toast.error(
                                  cause instanceof Error
                                    ? cause.message
                                    : "Couldn't export these notes.",
                                ),
                              );
                          }}
                        >
                          <FileDown className="h-4 w-4" />
                          PDF
                        </GradientButton>
                      </div>
                      <div className="book-notes">
                        <Markdown content={results.notes} />
                      </div>
                    </SoftCard>
                  ) : failed.notes ? (
                    <RetryCard onRetry={() => void run("notes", true)} />
                  ) : (
                    !anyNotesLoading &&
                    !results.summary &&
                    !results.explain && (
                      <EmptyState
                        icon={NotebookPen}
                        accent="book"
                        title="No notes yet"
                        description="Generate clean study notes from this document."
                        action={
                          <GradientButton onClick={() => void run("notes")}>
                            Make Notes
                          </GradientButton>
                        }
                      />
                    )
                  )}
                </div>
              )}

              {tab === "mcqs" &&
                (loading.mcqs ? (
                  <CardSkeleton lines={5} />
                ) : results.mcqs ? (
                  <SoftCard className="p-5 md:p-6">
                    <McqQuiz questions={results.mcqs} />
                  </SoftCard>
                ) : failed.mcqs ? (
                  <RetryCard onRetry={() => void run("mcqs", true)} />
                ) : (
                  <EmptyState
                    icon={ListChecks}
                    accent="book"
                    title="Test yourself"
                    description="Generate multiple-choice questions from this chapter."
                    action={
                      <GradientButton onClick={() => void run("mcqs")}>
                        Generate MCQs
                      </GradientButton>
                    }
                  />
                ))}

              {tab === "flashcards" &&
                (loading.flashcards ? (
                  <CardSkeleton lines={5} />
                ) : results.flashcards ? (
                  <FlashcardDeck cards={results.flashcards} />
                ) : failed.flashcards ? (
                  <RetryCard onRetry={() => void run("flashcards", true)} />
                ) : (
                  <EmptyState
                    icon={Layers}
                    accent="book"
                    title="Flashcards"
                    description="Turn key terms into flip cards."
                    action={
                      <GradientButton onClick={() => void run("flashcards")}>
                        Make flashcards
                      </GradientButton>
                    }
                  />
                ))}

              {tab === "questions" &&
                (loading.questions ? (
                  <CardSkeleton lines={6} />
                ) : results.questions ? (
                  <SoftCard className="divide-y">
                    {results.questions.map((q, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-3 p-4">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {i + 1}
                        </span>
                        <p className="min-w-0 flex-1 text-sm">{q.q}</p>
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ background: "var(--book-soft)", color: "var(--book)" }}
                        >
                          {q.marks} marks
                        </span>
                        <GradientButton size="sm" variant="ghost" onClick={() => void ask(q.q)}>
                          Answer this
                        </GradientButton>
                      </div>
                    ))}
                  </SoftCard>
                ) : failed.questions ? (
                  <RetryCard onRetry={() => void run("questions", true)} />
                ) : (
                  <EmptyState
                    icon={Star}
                    accent="book"
                    title="Important questions"
                    description="See the questions most likely to come in your exam."
                    action={
                      <GradientButton onClick={() => void run("questions")}>
                        Find questions
                      </GradientButton>
                    }
                  />
                ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <Sheet open={!!source} onOpenChange={(o) => !o && setSource(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Page {source?.page}</SheetTitle>
          </SheetHeader>
          <blockquote
            className="mt-4 rounded-xl border-l-4 bg-muted/50 p-4 text-sm leading-relaxed"
            style={{ borderColor: "var(--book)" }}
          >
            {source ? source.quote || quoteFor(source.page) : ""}
          </blockquote>
          <p className="mt-3 text-xs text-muted-foreground">From {doc.title}</p>
        </SheetContent>
      </Sheet>

      <Dialog open={pptOpen} onOpenChange={setPptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a presentation</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Slides</span>
                <span className="font-semibold tabular-nums">{slides}</span>
              </div>
              <Slider
                min={5}
                max={20}
                step={1}
                value={[slides]}
                onValueChange={(v) => setSlides(v[0] ?? 10)}
              />
            </div>
            <label className="flex items-center justify-between text-sm">
              Speaker notes
              <Switch checked={notes} onCheckedChange={setNotes} />
            </label>
          </div>
          <DialogFooter>
            <GradientButton variant="ghost" onClick={() => setPptOpen(false)}>
              Cancel
            </GradientButton>
            <GradientButton
              onClick={() =>
                void navigate({ to: "/ppt", search: { doc: doc.title, slides, notes } })
              }
            >
              <Presentation className="h-4 w-4" />
              Create
            </GradientButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RetryCard({ onRetry }: { onRetry: () => void }) {
  return (
    <SoftCard className="p-6 text-center">
      <p className="font-medium">Something went wrong generating this.</p>
      <GradientButton className="mt-3" variant="secondary" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" />
        Retry
      </GradientButton>
    </SoftCard>
  );
}
