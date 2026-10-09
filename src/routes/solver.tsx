import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  Check,
  Copy,
  Download,
  FileText,
  Lightbulb,
  Loader2,
  Pencil,
  PencilLine,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Upload,
  PenLine,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CardSkeleton,
  GradientButton,
  StickyActionBar,
  PageHeader,
  SegmentedControl,
  SoftCard,
} from "@/components/ui-custom";
import { Markdown } from "@/components/tutor/Markdown";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { solvePaper, resolveQuestion, solutionFollowUp } from "@/lib/api";
import type { PaperQuestion, SolveMode, SolveStyle } from "@/lib/types";
import { downloadPdf } from "@/lib/pdf";
import { SUBJECTS, useEffectiveProfile, toApiSubject } from "@/store/useUserStore";
import { useUiStore } from "@/store/useUiStore";

export const Route = createFileRoute("/solver")({
  head: () => ({
    meta: [
      { title: "Exam Solver — EduAI" },
      {
        name: "description",
        content: "Upload a question paper and get clear, exam-style worked solutions with hints.",
      },
      { property: "og:title", content: "Exam Solver — EduAI" },
      {
        property: "og:description",
        content: "Upload a question paper and get clear, exam-style worked solutions with hints.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SolverPage,
});

type Phase = "idle" | "uploading" | "processing" | "results" | "error";
const fmtSize = (b: number) =>
  b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;

function solutionMd(q: PaperQuestion) {
  const s = q.solution;
  if (s.blocks) return s.blocks.map((b) => `**${b.label}:** ${b.content}`).join("\n\n");
  return [
    s.given.length ? `**Given:** ${s.given.join(", ")}` : "",
    s.steps.map((st, i) => `${i + 1}. ${st}`).join("\n"),
    `**Therefore:** ${s.therefore}`,
    `**Answer:** ${s.answer}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function SolverPage() {
  const { effectiveLevel, effectiveSubject, customSubject } = useEffectiveProfile();
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [subjectChoice, setSubjectChoice] = useState<string>(
    effectiveSubject === "Default" ? "Default" : effectiveSubject,
  );
  const [mode, setMode] = useState<SolveMode>(() => useUiStore.getState().solverMode);
  const [style, setStyle] = useState<SolveStyle>("Exam");
  const [errorMessage, setErrorMessage] = useState("");
  const defaultSolverMode = useUiStore((state) => state.solverMode);

  useEffect(() => setMode(defaultSolverMode), [defaultSolverMode]);
  const [questions, setQuestions] = useState<PaperQuestion[]>([]);
  const [active, setActive] = useState(0);
  const [setupStep, setSetupStep] = useState<0 | 1>(0);
  const [drag, setDrag] = useState(false);
  const [mobileTab, setMobileTab] = useState<"q" | "s">("q");
  const inputRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const choose = (f: File | undefined) => {
    if (!f) return;
    if (!/pdf|jpe?g|png/i.test(f.type || f.name)) {
      toast.error("Please choose a PDF, JPG or PNG file.");
      return;
    }
    setFile(f);
    setProgress(0);
    setSetupStep(0);
  };

  const solve = async () => {
    if (!file) return;
    setPhase("processing");
    setErrorMessage("");
    try {
      const apiSubject = toApiSubject(subjectChoice);
      const qs = await solvePaper({
        file,
        level: effectiveLevel,
        subject: apiSubject,
        mode,
        style,
        onProgress: setProgress,
      });
      setProgress(100);
      setQuestions(qs);
      setActive(0);
      setMobileTab("q");
      setPhase("results");
      toast.success(`Solved ${qs.length} questions`);
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error ? cause.message : "We couldn't read this file. Please try again.",
      );
      setPhase("error");
    }
  };

  const reset = () => {
    setPhase("idle");
    setSetupStep(0);
    setFile(null);
    setQuestions([]);
    setProgress(0);
  };

  const exportPdf = async () => {
    try {
      await downloadPdf(
        "eduai-solutions.pdf",
        `${subject} paper — solutions (${mode === "teach" ? "Teach Me" : "Exam Answer"})`,
        questions.map((q) => ({
          heading: `Q${q.n}. ${q.text}  [${q.marks} marks]`,
          body: solutionMd(q),
        })),
      );
      toast.success("PDF downloaded");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Couldn't export the solutions.");
    }
  };

  return (
    <div className="mobile-action-content mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Exam Solver"
        icon={ScanLine}
        accent="solver"
        description="Upload a question paper and get clear, worked solutions."
        action={
          phase === "results" ? (
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                id="mode-toggle"
                options={["Teach Me", "Exam Answer"]}
                value={mode === "teach" ? "Teach Me" : "Exam Answer"}
                onChange={(v) => setMode(v === "Teach Me" ? "teach" : "exam")}
              />
              <GradientButton variant="secondary" size="sm" onClick={exportPdf}>
                <Download className="h-4 w-4" />
                Download all as PDF
              </GradientButton>
              <GradientButton variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="h-4 w-4" />
                Solve another paper
              </GradientButton>
            </div>
          ) : undefined
        }
      />

      <ol className="flex items-center gap-3 text-sm" aria-label="Paper solver steps">
        {["Upload", "Choose options", "Solutions"].map((label, index) => {
          const activeStep =
            phase === "results"
              ? 2
              : phase === "processing" || phase === "error"
                ? setupStep
                : setupStep;
          return (
            <li key={label} className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  index === activeStep && "border-primary bg-primary text-primary-foreground",
                  index < activeStep && "border-success bg-success text-success-foreground",
                )}
              >
                {index + 1}
              </span>
              <span className={cn(index === activeStep && "font-medium")}>
                {index === 1 ? (
                  <>
                    <span className="sm:hidden">Options</span>
                    <span className="hidden sm:inline">{label}</span>
                  </>
                ) : (
                  label
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                choose(e.dataTransfer.files[0]);
              }}
              className={cn(
                "relative rounded-2xl p-[2px] transition-all",
                setupStep === 1 && "hidden",
                drag ? "animated-border" : "",
              )}
            >
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-3 rounded-[calc(1.5rem-2px)] border-2 border-dashed bg-card px-6 py-12 text-center transition-colors",
                  drag ? "border-transparent" : "border-border",
                )}
              >
                {!file ? (
                  <>
                    <span
                      className="flex h-14 w-14 items-center justify-center rounded-2xl"
                      style={{ background: "var(--solver-soft)", color: "var(--solver)" }}
                    >
                      <Upload className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="text-lg font-semibold">Drop your question paper here</p>
                      <p className="text-sm text-muted-foreground">PDF, JPG or PNG · up to 20 MB</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <GradientButton
                        variant="secondary"
                        className="hidden md:inline-flex"
                        onClick={() => inputRef.current?.click()}
                      >
                        Browse files
                      </GradientButton>
                      <GradientButton
                        variant="secondary"
                        className="md:hidden"
                        onClick={() => camRef.current?.click()}
                      >
                        <Camera className="h-4 w-4" />
                        Take a photo
                      </GradientButton>
                    </div>
                  </>
                ) : (
                  <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border bg-background p-3 text-left">
                    {file && file.type.startsWith("image/") ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt="Paper preview"
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                    ) : (
                      <span
                        className="flex h-14 w-14 items-center justify-center rounded-lg"
                        style={{ background: "var(--solver-soft)", color: "var(--solver)" }}
                      >
                        <FileText className="h-6 w-6" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{fmtSize(file.size)}</p>
                      {file && progress < 100 && (
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <button
                      aria-label="Remove file"
                      onClick={() => {
                        setFile(null);
                      }}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,image/png,image/jpeg"
                hidden
                onChange={(e) => choose(e.target.files?.[0])}
              />
              <input
                ref={camRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => choose(e.target.files?.[0])}
              />
            </div>

            {setupStep === 0 ? (
              <>
                {file && (
                  <GradientButton
                    size="lg"
                    className="hidden w-full md:inline-flex"
                    onClick={() => setSetupStep(1)}
                  >
                    Continue to options
                  </GradientButton>
                )}
                <StickyActionBar>
                  <GradientButton
                    size="lg"
                    className="w-full"
                    onClick={() => (file ? setSetupStep(1) : inputRef.current?.click())}
                  >
                    {file ? "Continue to options" : "Choose a question paper"}
                  </GradientButton>
                </StickyActionBar>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Subject</label>
                    <Select value={subjectChoice} onValueChange={setSubjectChoice}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Default">Default (all subjects)</SelectItem>
                        {customSubject && !SUBJECTS.includes(customSubject as any) && (
                          <SelectItem value={customSubject}>{customSubject}</SelectItem>
                        )}
                        {SUBJECTS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {(
                    [
                      ["teach", Lightbulb, "Teach Me", "Learn how to solve it, with hints first"],
                      [
                        "exam",
                        PencilLine,
                        "Give Exam Answer",
                        "Written exactly as you'd write in the exam",
                      ],
                    ] as const
                  ).map(([id, Icon, t, d]) => (
                    <button
                      key={id}
                      onClick={() => setMode(id)}
                      aria-pressed={mode === id}
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border bg-card p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        mode === id
                          ? "border-primary bg-accent-soft text-primary"
                          : "hover:bg-muted",
                      )}
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: "var(--solver-soft)", color: "var(--solver)" }}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block font-semibold">{t}</span>
                        <span className="text-sm text-muted-foreground">{d}</span>
                      </span>
                      {mode === id && <Check className="ml-auto h-5 w-5 text-primary" />}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t py-3">
                  <GradientButton variant="ghost" onClick={() => setSetupStep(0)}>
                    <RotateCcw className="h-4 w-4" />
                    Back to upload
                  </GradientButton>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">Answer style</span>
                    <SegmentedControl
                      id="solve-style"
                      options={["Simple", "Exam", "Detailed"] as SolveStyle[]}
                      value={style}
                      onChange={setStyle}
                    />
                  </div>
                  <GradientButton
                    className="hidden md:inline-flex"
                    size="lg"
                    disabled={!file}
                    onClick={solve}
                  >
                    <PenLine className="h-4 w-4" />
                    Solve paper
                  </GradientButton>
                </div>
                <StickyActionBar>
                  <GradientButton size="lg" disabled={!file} onClick={solve}>
                    <PenLine className="h-4 w-4" />
                    Solve paper
                  </GradientButton>
                </StickyActionBar>
              </>
            )}
          </motion.div>
        )}

        {phase === "processing" && (
          <motion.div
            key="proc"
            aria-busy="true"
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            <SoftCard className="flex items-center gap-3 p-6" role="status">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm font-medium">Analyzing your question paper…</p>
            </SoftCard>
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          </motion.div>
        )}

        {phase === "error" && (
          <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SoftCard className="mx-auto max-w-lg p-6 text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-warning" />
              <h3 className="mt-3 text-lg font-semibold">
                We couldn’t finish processing your paper
              </h3>
              <p role="alert" className="mt-2 text-sm text-muted-foreground">
                {errorMessage}
              </p>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                <li>• Use good lighting</li>
                <li>• Keep the page flat</li>
                <li>• Avoid shadows and blur</li>
              </ul>
              <div className="mt-5 flex justify-center gap-2">
                <GradientButton onClick={solve}>
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </GradientButton>
                <GradientButton variant="secondary" onClick={reset}>
                  Choose another file
                </GradientButton>
              </div>
            </SoftCard>
          </motion.div>
        )}

        {phase === "results" && (
          <motion.div
            key="res"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <Tabs
              value={mobileTab}
              onValueChange={(v) => setMobileTab(v as "q" | "s")}
              className="md:hidden"
            >
              <TabsList className="w-full">
                <TabsTrigger value="q" className="flex-1">
                  Questions
                </TabsTrigger>
                <TabsTrigger value="s" className="flex-1">
                  Solution
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="grid gap-5 md:grid-cols-[300px_1fr]">
              <div className={cn(mobileTab !== "q" && "hidden md:block")}>
                <QuestionList
                  questions={questions}
                  active={active}
                  onSelect={(i) => {
                    setActive(i);
                    setMobileTab("s");
                  }}
                  onKeySelect={setActive}
                />
              </div>
              <div className={cn("min-w-0", mobileTab !== "s" && "hidden md:block")}>
                <SolutionPanel
                  key={`${questions[active]!.id}-${mode}`}
                  q={questions[active]!}
                  mode={mode}
                  onUpdate={(nq) => setQuestions((qs) => qs.map((x) => (x.id === nq.id ? nq : x)))}
                  level={level}
                  style={style}
                />
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Always verify answers with your teacher.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QuestionList({
  questions,
  active,
  onSelect,
  onKeySelect,
}: {
  questions: PaperQuestion[];
  active: number;
  onSelect: (i: number) => void;
  onKeySelect: (i: number) => void;
}) {
  return (
    <ul
      role="listbox"
      tabIndex={0}
      aria-label="Questions"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          onKeySelect(Math.min(questions.length - 1, active + 1));
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onKeySelect(Math.max(0, active - 1));
        }
      }}
      className="space-y-2 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:sticky md:top-20 md:max-h-[calc(100dvh-7rem)] md:overflow-y-auto"
    >
      {questions.map((q, i) => (
        <li key={q.id} role="option" aria-selected={i === active}>
          <button
            onClick={() => onSelect(i)}
            className={cn(
              "w-full rounded-xl border bg-card p-3 text-left transition-all",
              i === active ? "border-primary bg-accent-soft text-primary" : "hover:bg-muted",
            )}
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold">Q{q.n}</span>
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-medium",
                    q.status === "solved"
                      ? "bg-success/15 text-success"
                      : "bg-warning/20 text-warning",
                  )}
                >
                  {q.status === "solved" ? "Solved" : "Needs review"}
                </span>
                <span className="text-muted-foreground">{q.marks}m</span>
              </span>
            </div>
            <div className="mt-1 line-clamp-2 text-sm text-muted-foreground [&_p]:m-0">
              <Markdown content={q.text} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SolutionPanel({
  q,
  mode,
  onUpdate,
  level,
  style,
}: {
  q: PaperQuestion;
  mode: SolveMode;
  onUpdate: (q: PaperQuestion) => void;
  level: Parameters<typeof resolveQuestion>[2];
  style: SolveStyle;
}) {
  const [revealed, setRevealed] = useState(mode === "exam" ? 3 : 0);
  const [extra, setExtra] = useState<{ label: string; md: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(q.text);
  useEffect(() => setDraft(q.text), [q.text]);
  const s = q.solution;

  const follow = async (kind: "simpler" | "method" | "similar", label: string) => {
    setExtra((e) => [...e, { label, md: null }]);
    const md = await solutionFollowUp(kind, q);
    setExtra((e) => e.map((x, i) => (i === e.length - 1 ? { ...x, md } : x)));
  };
  const regenerate = async () => {
    setBusy(true);
    onUpdate(await resolveQuestion(q, q.text, level, style));
    setBusy(false);
    setExtra([]);
    toast.success("Solution regenerated");
  };
  const saveEdit = async () => {
    setEditOpen(false);
    setBusy(true);
    onUpdate(await resolveQuestion(q, draft.trim() || q.text, level, style));
    setBusy(false);
    toast.success("Question re-solved");
  };

  const full = (
    <div className="space-y-4">
      {s.blocks ? (
        s.blocks.map((b) => (
          <div key={b.label}>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{b.label}</p>
            <Markdown content={b.content} />
          </div>
        ))
      ) : (
        <>
          {s.given.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Given</p>
              <Markdown content={s.given.map((g) => `- ${g}`).join("\n")} />
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Steps</p>
            <ol className="space-y-2">
              {s.steps.map((st, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex gap-3"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 [&_p]:m-0">
                    <Markdown content={st} />
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Therefore</p>
            <Markdown content={s.therefore} />
          </div>
        </>
      )}
      <div className="rounded-xl border border-primary/30 bg-card px-4 py-3">
        <p className="text-xs font-semibold text-primary">Answer</p>
        <div className="[&_p]:m-0">
          <Markdown content={s.answer} />
        </div>
      </div>
    </div>
  );

  return (
    <SoftCard className="space-y-5 p-5 md:p-7">
      <div className="flex items-start justify-between gap-3">
        <blockquote
          className="flex-1 rounded-xl border-l-4 bg-muted/50 px-4 py-3"
          style={{ borderColor: "var(--solver)" }}
        >
          <p className="mb-1 text-xs font-semibold text-muted-foreground">
            Question {q.n} · {q.marks} marks
          </p>
          <div className="[&_p]:m-0">
            <Markdown content={q.text} />
          </div>
        </blockquote>
        <button
          aria-label="Edit question"
          onClick={() => setEditOpen(true)}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      {busy ? (
        <CardSkeleton lines={5} />
      ) : mode === "teach" ? (
        <div className="space-y-3">
          {(["Hint 1", "Hint 2", "Full solution"] as const).map((label, i) => (
            <div key={label} className={cn("rounded-xl border", i > revealed && "opacity-50")}>
              <button
                disabled={i > revealed}
                onClick={() => setRevealed((r) => Math.max(r, i + 1))}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
              >
                <span className="flex items-center gap-2">
                  {i < 2 ? (
                    <Lightbulb className="h-4 w-4 text-warning" />
                  ) : (
                    <PenLine className="h-4 w-4 text-primary" />
                  )}
                  {label}
                </span>
                {i >= revealed && i <= revealed && (
                  <span className="text-xs text-primary">Reveal</span>
                )}
              </button>
              <AnimatePresence initial={false}>
                {i < revealed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t px-4 py-3">
                      {i < 2 ? <Markdown content={q.hints[i]!} /> : full}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      ) : (
        full
      )}

      {extra.map((x, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border p-4"
          style={{ background: "var(--solver-soft)" }}
        >
          <p className="mb-1 text-xs font-semibold text-muted-foreground">{x.label}</p>
          {x.md ? (
            <Markdown content={x.md} />
          ) : (
            <div className="space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          )}
        </motion.div>
      ))}

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <GradientButton
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(`Q${q.n}. ${q.text}\n\n${solutionMd(q)}`);
            toast.success("Copied");
          }}
        >
          <Copy className="h-4 w-4" />
          Copy
        </GradientButton>
        <GradientButton variant="secondary" size="sm" onClick={regenerate} disabled={busy}>
          <RefreshCw className="h-4 w-4" />
          Regenerate
        </GradientButton>
        <GradientButton
          variant="ghost"
          size="sm"
          onClick={() => follow("simpler", "Explained simpler")}
        >
          Explain simpler
        </GradientButton>
        <GradientButton
          variant="ghost"
          size="sm"
          onClick={() => follow("method", "Another method")}
        >
          Show another method
        </GradientButton>
        <GradientButton
          variant="ghost"
          size="sm"
          onClick={() => follow("similar", "Similar question")}
        >
          Make a similar question
        </GradientButton>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit question {q.n}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Fix anything that was detected wrongly, then re-solve.
          </p>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} />
          <DialogFooter>
            <GradientButton variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </GradientButton>
            <GradientButton onClick={saveEdit}>Re-solve</GradientButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SoftCard>
  );
}
