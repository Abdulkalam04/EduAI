import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, Clock, Flag, Grid3x3, ImagePlus, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GradientButton, ProgressBar } from "@/components/ui-custom";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { submitPaper } from "@/lib/api";
import { stagePracticeFiles } from "@/lib/practice-upload";
import type { Paper, PQuestion } from "@/lib/types";
import { getLevel } from "@/store/useUserStore";
import { usePracticeStore, type Attempt as AttemptT } from "@/store/usePracticeStore";

const fmt = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function Attempt({ paper, attempt }: { paper: Paper; attempt: AttemptT }) {
  const patch = usePracticeStore((s) => s.patchAttempt);
  const setView = usePracticeStore((s) => s.setView);
  const navigate = useNavigate();
  const [answers, setAnswers] = useState(attempt.answers);
  const [flagged, setFlagged] = useState<string[]>(attempt.flagged);
  const [photos, setPhotos] = useState(attempt.photos);
  const [remaining, setRemaining] = useState(attempt.remainingSec);
  const [saved, setSaved] = useState<"saved" | "saving">("saved");
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [mode, setMode] = useState<"type" | "upload">("type");
  const [files, setFiles] = useState<File[]>([]);
  const dirty = useRef(false);
  const submittedRef = useRef(false);

  const doSubmit = useCallback(
    async (auto = false) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      setSubmitError(false);
      setConfirm(false);
      if (auto) toast("Time's up! Your paper was submitted automatically.");
      patch(paper.id, { answers, flagged, photos, remainingSec: remaining });
      try {
        const result = await submitPaper(paper, answers, paper.timeMin * 60 - remaining);
        patch(paper.id, { status: "submitted", result });
        setView({ stage: "results", paperId: paper.id });
      } catch {
        submittedRef.current = false;
        setSubmitting(false);
        setSubmitError(true);
        toast.error("We couldn't submit your paper. Your answers are saved—please retry.");
      }
    },
    [answers, flagged, photos, remaining, paper, patch, setView],
  );

  // Countdown
  useEffect(() => {
    if (submitting || submitError) return;
    if (remaining <= 0) {
      void doSubmit(true);
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, submitting, submitError, doSubmit]);

  // Autosave every 3s (reads latest values through a ref so the interval isn't reset each tick)
  const latest = useRef({ answers, flagged, photos, remaining });
  latest.current = { answers, flagged, photos, remaining };
  useEffect(() => {
    const t = setInterval(() => {
      const l = latest.current;
      patch(paper.id, {
        remainingSec: l.remaining,
        ...(dirty.current ? { answers: l.answers, flagged: l.flagged, photos: l.photos } : {}),
      });
      if (dirty.current) {
        dirty.current = false;
        setSaved("saved");
      }
    }, 3000);
    return () => clearInterval(t);
  }, [paper.id, patch]);

  const setAns = (id: string, v: string) => {
    const next = { ...answers, [id]: v };
    setAnswers(next);
    patch(paper.id, { answers: next });
    dirty.current = true;
    setSaved("saving");
  };
  const toggleFlag = (id: string) => {
    const next = flagged.includes(id) ? flagged.filter((x) => x !== id) : [...flagged, id];
    setFlagged(next);
    patch(paper.id, { flagged: next });
    dirty.current = true;
    setSaved("saving");
  };

  const answeredCount = paper.questions.filter((q) => (answers[q.id] ?? "").trim()).length;
  const counts = {
    answered: answeredCount,
    unanswered: paper.questions.length - answeredCount,
    flagged: flagged.length,
  };
  const timerTone =
    remaining < 120
      ? "text-destructive timer-pulse"
      : remaining < 600
        ? "text-warning timer-pulse"
        : "";

  const jump = (id: string) => {
    setNavOpen(false);
    const index = paper.questions.findIndex((question) => question.id === id);
    if (index >= 0) setCurrentQuestionIndex(index);
  };

  const navigator = (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
      {paper.questions.map((q, i) => {
        const done = (answers[q.id] ?? "").trim();
        const fl = flagged.includes(q.id);
        return (
          <button
            key={q.id}
            onClick={() => jump(q.id)}
            aria-current={i === currentQuestionIndex ? "step" : undefined}
            aria-label={`Question ${i + 1}${done ? ", answered" : ""}${fl ? ", flagged" : ""}`}
            className={cn(
              "relative min-h-11 min-w-11 rounded-lg border text-xs font-semibold tabular-nums transition-colors",
              done ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              fl && "ring-2 ring-warning ring-offset-1 ring-offset-background",
            )}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );

  const currentQuestion = paper.questions[currentQuestionIndex];

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/85 px-4 py-2 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border bg-card px-3 py-1.5 font-mono text-sm font-semibold tabular-nums",
              timerTone,
            )}
            aria-live="polite"
          >
            <Clock className="h-4 w-4" />
            {fmt(Math.max(0, remaining))}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline-flex sm:items-center sm:gap-1">
            {saved === "saved" ? (
              <>
                <Check className="h-4 w-4 text-success" />
                Saved
              </>
            ) : (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {counts.answered}/{paper.questions.length} answered
          </span>
          <div className="ml-auto flex items-center gap-2">
            <GradientButton
              variant="secondary"
              size="sm"
              onClick={() => setNavOpen(true)}
              className="lg:hidden"
            >
              <Grid3x3 className="h-4 w-4" />
              Questions
            </GradientButton>
            <GradientButton size="sm" onClick={() => setConfirm(true)} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Submit
            </GradientButton>
          </div>
        </div>
        <div className="mt-2 hidden lg:block">{navigator}</div>
        {submitError && (
          <div
            role="alert"
            className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm"
          >
            <span>Submission failed. Your answers are saved.</span>
            <button
              className="font-semibold text-destructive underline underline-offset-2"
              onClick={() => void doSubmit()}
            >
              Retry submission
            </button>
          </div>
        )}
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as "type" | "upload")}>
        <TabsList>
          <TabsTrigger value="type">Type answers</TabsTrigger>
          <TabsTrigger value="upload">Upload handwritten answers</TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "upload" ? (
        <div className="space-y-4 rounded-2xl border-2 border-dashed p-8 text-center">
          <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Upload photos or a PDF of your handwritten answers</p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-card px-4 py-2 text-sm font-medium hover:bg-muted">
            Choose files
            <input
              type="file"
              multiple
              accept="image/*,.pdf"
              hidden
              onChange={(e) => {
                const selected = Array.from(e.target.files ?? []);
                const accepted = selected.filter(
                  (f) =>
                    f.type.startsWith("image/") ||
                    f.type === "application/pdf" ||
                    /\.pdf$/i.test(f.name),
                );
                if (accepted.length !== selected.length)
                  toast.error("Only image and PDF files are supported.");
                setFiles(accepted);
                e.target.value = "";
              }}
            />
          </label>
          {files.length > 0 && (
            <ul className="mx-auto max-w-sm space-y-1 text-left text-sm">
              {files.map((f) => (
                <li key={f.name} className="truncate rounded-lg bg-muted px-3 py-1.5">
                  {f.name}
                </li>
              ))}
            </ul>
          )}
          <div>
            <GradientButton
              disabled={!files.length}
              onClick={() => {
                patch(paper.id, { answers, flagged, photos, remainingSec: remaining });
                stagePracticeFiles(files);
                void navigate({ to: "/practice/check", search: { paper: paper.id } });
              }}
            >
              Send for AI checking
            </GradientButton>
          </div>
        </div>
      ) : (
        <article className="exam-paper mx-auto max-w-3xl rounded-2xl border p-5 shadow-lift sm:p-10">
          <header
            className="border-b-2 border-double pb-5 text-center"
            style={{ borderColor: "var(--border)" }}
          >
            <h1 className="font-serif text-2xl font-bold tracking-wide">{paper.title}</h1>
            <p className="mt-1 text-sm">
              {paper.subject} · {paper.chapter} · {getLevel(paper.level).label}
            </p>
            <div className="mt-3 flex justify-between text-sm font-medium">
              <span>
                Question {currentQuestionIndex + 1} of {paper.questions.length}
              </span>
              <span>Maximum marks: {paper.totalMarks}</span>
            </div>
          </header>
          <div className="py-5">
            <ProgressBar value={((currentQuestionIndex + 1) / paper.questions.length) * 100} />
          </div>
          {currentQuestion ? (
            <QuestionBlock
              key={currentQuestion.id}
              n={currentQuestionIndex + 1}
              q={currentQuestion}
              value={answers[currentQuestion.id] ?? ""}
              onChange={(value) => setAns(currentQuestion.id, value)}
              flagged={flagged.includes(currentQuestion.id)}
              onFlag={() => toggleFlag(currentQuestion.id)}
              photo={photos[currentQuestion.id]}
              onPhoto={(name) => {
                setPhotos((current) => {
                  const next = { ...current };
                  if (name) next[currentQuestion.id] = name;
                  else delete next[currentQuestion.id];
                  return next;
                });
                dirty.current = true;
                setSaved("saving");
              }}
            />
          ) : (
            <p role="alert" className="py-8 text-center text-sm text-destructive">
              This paper has no questions. Return to practice and create another paper.
            </p>
          )}
          <div className="sticky bottom-0 z-20 -mx-4 mt-5 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pb-0">
            <GradientButton
              variant="secondary"
              onClick={() => setCurrentQuestionIndex((index) => Math.max(0, index - 1))}
              disabled={currentQuestionIndex === 0}
            >
              Previous
            </GradientButton>
            <span className="text-sm text-muted-foreground">
              {answeredCount} of {paper.questions.length} answered
            </span>
            {currentQuestionIndex + 1 < paper.questions.length ? (
              <GradientButton
                onClick={() =>
                  setCurrentQuestionIndex((index) =>
                    Math.min(paper.questions.length - 1, index + 1),
                  )
                }
              >
                Next
              </GradientButton>
            ) : (
              <GradientButton onClick={() => setConfirm(true)} disabled={submitting}>
                Submit
              </GradientButton>
            )}
          </div>
        </article>
      )}

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Jump to a question</SheetTitle>
          </SheetHeader>
          <div className="py-4">{navigator}</div>
          <p className="text-xs text-muted-foreground">Filled = answered · ring = flagged</p>
        </SheetContent>
      </Sheet>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit your paper?</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["Answered", counts.answered, "text-success"],
                ["Unanswered", counts.unanswered, "text-muted-foreground"],
                ["Flagged", counts.flagged, "text-warning"],
              ] as const
            ).map(([l, v, c]) => (
              <div key={l} className="rounded-xl border p-3">
                <p className={cn("text-2xl font-semibold tabular-nums", c)}>{v}</p>
                <p className="text-xs text-muted-foreground">{l}</p>
              </div>
            ))}
          </div>
          {counts.unanswered > 0 && (
            <p className="text-sm text-muted-foreground">
              You still have {fmt(remaining)} left — no rush if you want to review.
            </p>
          )}
          <DialogFooter>
            <GradientButton variant="ghost" onClick={() => setConfirm(false)}>
              Keep working
            </GradientButton>
            <GradientButton onClick={() => void doSubmit()}>Submit paper</GradientButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionBlock({
  n,
  q,
  value,
  onChange,
  flagged,
  onFlag,
  photo,
  onPhoto,
}: {
  n: number;
  q: PQuestion;
  value: string;
  onChange: (v: string) => void;
  flagged: boolean;
  onFlag: () => void;
  photo?: string | undefined;
  onPhoto: (name: string | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);
  return (
    <div id={`pq-${q.id}`} className="scroll-mt-40">
      <div className="flex items-start gap-3">
        <span className="font-semibold tabular-nums">Q{n}.</span>
        <p className="flex-1">{q.text}</p>
        <span className="shrink-0 text-sm text-muted-foreground">[{q.marks}]</span>
        <button
          onClick={onFlag}
          aria-pressed={flagged}
          aria-label="Flag for review"
          className={cn(
            "shrink-0 rounded-lg p-1.5 transition-colors",
            flagged ? "bg-warning/20 text-warning" : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Flag className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 pl-8">
        {q.type === "mcq" ? (
          <div
            className="grid gap-2 sm:grid-cols-2"
            role="radiogroup"
            aria-label={`Question ${n} answer options`}
          >
            {q.options!.map((o, i) => (
              <label
                key={i}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 text-sm transition-colors",
                  value === String(i) ? "border-primary bg-primary/10" : "hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name={q.id}
                  className="sr-only"
                  checked={value === String(i)}
                  onChange={() => onChange(String(i))}
                />
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    value === String(i) && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {"ABCD"[i]}
                </span>
                {o}
              </label>
            ))}
          </div>
        ) : (
          <>
            <textarea
              ref={ref}
              aria-label={`Answer to question ${n}`}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              rows={q.type === "short" ? 3 : 5}
              placeholder="Write your answer…"
              className="w-full resize-none overflow-hidden rounded-xl border bg-card p-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{wc(value)} words</span>
              {q.type === "numerical" &&
                (photo ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                    <ImagePlus className="h-4 w-4" />
                    {photo}
                    <button aria-label="Remove photo" onClick={() => onPhoto(null)}>
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-1 font-medium text-primary hover:underline">
                    <ImagePlus className="h-4 w-4" />
                    Attach a photo of your working
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onPhoto(f.name);
                      }}
                    />
                  </label>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
