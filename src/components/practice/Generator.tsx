import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, ClipboardCheck, ScanSearch, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GradientButton, SoftCard, StickyActionBar } from "@/components/ui-custom";
import { AsciiThinking } from "@/components/ui-custom/AsciiThinking";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { generatePaper } from "@/lib/api";
import { MARK_OPTIONS, paperStructure, timeForMarks, type Difficulty } from "@/lib/types";
import { LEVELS, SUBJECTS, useUserStore, type LevelId } from "@/store/useUserStore";
import { usePracticeStore } from "@/store/usePracticeStore";

const SECTION_COLORS = ["var(--practice)", "var(--solver)", "var(--diagrams)", "var(--book)"];
const DIFF: { id: Difficulty; color: string }[] = [
  { id: "Easy", color: "var(--success)" },
  { id: "Medium", color: "var(--warning)" },
  { id: "Hard", color: "var(--destructive)" },
];

export function Generator({ prefillWeak }: { prefillWeak?: string[] }) {
  const userLevel = useUserStore((s) => s.level);
  const { papers, attempts, addPaper, startAttempt, setView, removePaper } = usePracticeStore();
  const [level, setLevel] = useState<LevelId>(userLevel);
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [marks, setMarks] = useState(50);
  const [time, setTime] = useState(timeForMarks(50));
  const [timeEdited, setTimeEdited] = useState(false);
  const [weakOn, setWeakOn] = useState(!!prefillWeak?.length);
  const [weak, setWeak] = useState<string[]>(prefillWeak ?? []);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  useEffect(() => {
    if (!timeEdited) setTime(timeForMarks(marks));
  }, [marks, timeEdited]);
  useEffect(() => {
    if (!loading) return;
    setLoadingStep(0);
    const writingTimer = window.setTimeout(() => setLoadingStep(1), 1200);
    const checkingTimer = window.setTimeout(() => setLoadingStep(2), 15_000);
    return () => {
      window.clearTimeout(writingTimer);
      window.clearTimeout(checkingTimer);
    };
  }, [loading]);
  const structure = paperStructure(marks);

  const generate = async () => {
    if (!subject || !chapter.trim()) {
      toast.error("Choose a subject and enter a chapter before generating a paper.");
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      const p = await generatePaper({
        level,
        subject,
        chapter,
        difficulty,
        totalMarks: marks,
        timeMin: time,
        weakFocus: weakOn ? weak : [],
      });
      setLoadingStep(3);
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      addPaper(p);
      startAttempt(p);
      toast.success("Your paper is ready — good luck!");
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Couldn't generate the paper. Please try again.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ExamSkeleton currentStep={loadingStep} />;

  return (
    <div className="space-y-6">
      <Link to="/practice/check" className="block">
        <SoftCard
          interactive
          className="flex items-center gap-4 p-4"
          style={{ background: "var(--practice-soft)" }}
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card"
            style={{ color: "var(--practice)" }}
          >
            <ScanSearch className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Already wrote answers on paper?</p>
            <p className="text-sm text-muted-foreground">
              Upload photos of your handwritten answers and get marks with feedback.
            </p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </SoftCard>
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <SoftCard className="space-y-4 p-5">
          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {errorMessage}
              <button
                type="button"
                onClick={() => void generate()}
                className="ml-2 min-h-11 font-semibold underline"
              >
                Retry
              </button>
            </div>
          )}
          <h2 className="font-semibold">Create a paper</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Level">
              <Select value={level} onValueChange={(v) => setLevel(v as LevelId)}>
                <SelectTrigger aria-label="Level">
                  <SelectValue placeholder="Choose a subject" />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subject">
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger aria-label="Subject">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Chapter">
            <Input
              aria-label="Chapter"
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              placeholder="Enter chapter name"
            />
          </Field>
          <Field label="Difficulty">
            <div
              className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
              role="radiogroup"
              aria-label="Difficulty"
            >
              {DIFF.map((d) => (
                <button
                  key={d.id}
                  role="radio"
                  aria-checked={difficulty === d.id}
                  onClick={() => setDifficulty(d.id)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-all",
                    difficulty === d.id
                      ? "bg-card shadow-soft"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                  {d.id}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Total marks">
              <Select value={String(marks)} onValueChange={(v) => setMarks(Number(v))}>
                <SelectTrigger aria-label="Total marks">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARK_OPTIONS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m} marks
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Time limit (minutes)">
              <Input
                aria-label="Time limit in minutes"
                type="number"
                min={5}
                max={240}
                value={time}
                onChange={(e) => {
                  setTime(Math.max(5, Number(e.target.value) || 5));
                  setTimeEdited(true);
                }}
              />
            </Field>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
            <span>
              <span className="font-medium">Focus on my weak topics</span>
              <span className="block text-xs text-muted-foreground">
                More questions from topics you found tricky
              </span>
            </span>
            <Switch checked={weakOn} onCheckedChange={setWeakOn} />
          </label>
          {weakOn && weak.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {weak.map((w) => (
                <span
                  key={w}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ background: "var(--practice-soft)", color: "var(--practice)" }}
                >
                  {w}
                  <button
                    aria-label={`Remove ${w}`}
                    onClick={() => setWeak(weak.filter((x) => x !== w))}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <GradientButton
            size="lg"
            className="hidden w-full md:inline-flex"
            onClick={() => void generate()}
            disabled={!subject || !chapter.trim() || loading}
          >
            <ClipboardCheck className="h-4 w-4" />
            Generate paper
          </GradientButton>
          <StickyActionBar>
            <GradientButton
              size="lg"
              className="w-full"
              onClick={() => void generate()}
              disabled={!subject || !chapter.trim() || loading}
            >
              <ClipboardCheck className="h-4 w-4" />
              Generate paper
            </GradientButton>
          </StickyActionBar>
        </SoftCard>

        <SoftCard className="space-y-5 p-5">
          <div>
            <h2 className="font-semibold">Paper structure</h2>
            <p className="text-sm text-muted-foreground">
              {marks} marks · {time} minutes · {difficulty}
            </p>
          </div>
          <div className="flex h-4 overflow-hidden rounded-full">
            {structure.map((s, i) => (
              <motion.div
                key={s.id}
                layout
                animate={{ width: `${(s.marks / marks) * 100}%` }}
                transition={{ type: "spring", stiffness: 200, damping: 26 }}
                style={{ background: SECTION_COLORS[i] }}
              />
            ))}
          </div>
          <ul className="space-y-3">
            {structure.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 text-sm">
                <span
                  className="h-3 w-3 shrink-0 rounded"
                  style={{ background: SECTION_COLORS[i] }}
                />
                <span className="flex-1">
                  <span className="font-medium">Section {s.id}</span> · {s.name}
                  <span className="block text-xs text-muted-foreground">
                    {s.count} × {s.each} mark{s.each > 1 ? "s" : ""}
                  </span>
                </span>
                <motion.span
                  key={s.marks}
                  initial={{ scale: 1.3 }}
                  animate={{ scale: 1 }}
                  className="font-semibold tabular-nums"
                >
                  {s.marks}
                </motion.span>
              </li>
            ))}
          </ul>
        </SoftCard>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">Previous papers</h2>
        {papers.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No papers yet — generate your first one above.
          </p>
        ) : (
          <ul className="space-y-2">
            {papers.map((p) => {
              const a = attempts[p.id];
              const done = a?.status === "submitted" && a.result;
              const pct = done ? Math.round((a.result!.score / a.result!.total) * 100) : 0;
              return (
                <li key={p.id}>
                  <SoftCard className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {p.subject} · {p.chapter}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.totalMarks} marks · {p.difficulty} ·{" "}
                        {new Date(p.createdAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                    {done ? (
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          pct >= 80
                            ? "bg-success/15 text-success"
                            : pct >= 50
                              ? "bg-warning/20 text-warning"
                              : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {a.result!.score}/{a.result!.total}
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        In progress
                      </span>
                    )}
                    <GradientButton
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        done
                          ? setView({ stage: "results", paperId: p.id })
                          : a
                            ? setView({ stage: "attempt", paperId: p.id })
                            : startAttempt(p)
                      }
                    >
                      {done ? "View result" : "Resume"}
                    </GradientButton>
                    <button
                      aria-label="Delete paper"
                      onClick={() => setConfirmDel(p.id)}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </SoftCard>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this paper?</AlertDialogTitle>
            <AlertDialogDescription>
              Your answers and result for it will be removed too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDel) removePaper(confirmDel);
                toast("Paper deleted");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function ExamSkeleton({ currentStep }: { currentStep: number }) {
  const steps = ["Planning", "Writing questions", "Checking marks", "Done"];
  return (
    <div
      className="exam-paper mx-auto max-w-3xl space-y-6 rounded-2xl border p-8 shadow-lift"
      aria-busy="true"
      aria-label="Generating paper"
    >
      <div className="flex justify-center" aria-hidden="true">
        <AsciiThinking />
      </div>
      <h2 className="text-center text-lg font-semibold">Creating your practice paper</h2>
      <ol
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        aria-label="Paper generation progress"
        aria-live="polite"
      >
        {steps.map((step, index) => (
          <li
            key={step}
            aria-current={index === currentStep ? "step" : undefined}
            className={cn(
              "rounded-xl border p-3 text-center text-sm",
              index < currentStep && "border-success/40 bg-success/10 text-success",
              index === currentStep && "border-primary bg-primary/10 font-semibold text-foreground",
              index > currentStep && "text-muted-foreground",
            )}
          >
            <span className="mb-1 block text-xs">{index < currentStep ? "✓" : index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      <p className="text-center text-sm text-muted-foreground">
        This can take up to a minute. You can keep this page open while we create and check your
        questions.
      </p>
    </div>
  );
}
