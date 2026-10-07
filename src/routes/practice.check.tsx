import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, Reorder } from "framer-motion";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  FileText,
  GripVertical,
  Loader2,
  RefreshCw,
  RotateCw,
  ScanSearch,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CardSkeleton,
  GradientButton,
  PageHeader,
  ProgressRing,
  SoftCard,
} from "@/components/ui-custom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/tutor/Markdown";
import { checkHandwritten, reEvaluateAnswer } from "@/lib/api";
import { takePracticeFiles } from "@/lib/practice-upload";
import type { Evaluation } from "@/lib/mock/practice";
import { usePracticeStore } from "@/store/usePracticeStore";
import { useUiStore } from "@/store/useUiStore";

const TITLE = "AI Paper Checking — EduAI";
const DESC =
  "Upload photos of your handwritten answers and get rubric-based marks with friendly feedback.";

export const Route = createFileRoute("/practice/check")({
  validateSearch: (s: Record<string, unknown>): { paper?: string | undefined } => ({
    paper: typeof s["paper"] === "string" ? s["paper"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckPage,
});

interface Item {
  id: string;
  name: string;
  url: string | null;
  rotation: number;
  file?: File;
}
const STEPS = ["Reading handwriting", "Matching answers", "Evaluating", "Writing feedback"];
const total = (e: Evaluation) => ({
  got: e.rubric.reduce((s, r) => s + r.got, 0),
  max: e.rubric.reduce((s, r) => s + r.max, 0),
});

function CheckPage() {
  const reduceMotion = useUiStore((state) => state.reduceMotion);
  const search = Route.useSearch();
  const papers = usePracticeStore((s) => s.papers);
  const setView = usePracticeStore((s) => s.setView);
  const [phase, setPhase] = useState<"upload" | "processing" | "results" | "error">("upload");
  const [items, setItems] = useState<Item[]>([]);
  const [source, setSource] = useState<"generated" | "upload">(
    search.paper ? "generated" : papers.length ? "generated" : "upload",
  );
  const [paperId, setPaperId] = useState<string>(search.paper ?? papers[0]?.id ?? "");
  const [qpFile, setQpFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [step, setStep] = useState(0);
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [drag, setDrag] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  const addFiles = useCallback((files: FileList | File[] | null) => {
    const list = Array.from(files ?? []).filter(
      (f) => /image|pdf/.test(f.type) || /\.pdf$/i.test(f.name),
    );
    if (!list.length) {
      toast.error("Please add images or PDFs.");
      return;
    }
    setItems((s) => [
      ...s,
      ...list.map((f) => ({
        id: `${f.name}-${Math.random()}`,
        name: f.name,
        url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
        rotation: 0,
        file: f,
      })),
    ]);
  }, []);
  const loadSample = () =>
    setItems(
      [1, 2, 3].map((n) => ({
        id: `s${n}`,
        name: `answer_sheet_page_${n}.jpg`,
        url: null,
        rotation: 0,
      })),
    );

  useEffect(() => {
    addFiles(takePracticeFiles());
    return () => itemsRef.current.forEach((item) => item.url && URL.revokeObjectURL(item.url));
  }, [addFiles]);

  const run = async () => {
    setPhase("processing");
    setStep(0);
    setUploadProgress(0);
    setErrorMessage("");
    try {
      setEvals(
        await checkHandwritten(items, setStep, setUploadProgress, {
          ...(source === "generated" && paperId ? { paperId } : {}),
          ...(source === "upload" && qpFile ? { questionPaper: qpFile } : {}),
        }),
      );
      setPhase("results");
      toast.success("Your answers have been checked");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Please try uploading clearer pages.",
      );
      setPhase("error");
    }
  };

  const got = evals.reduce((s, e) => s + total(e).got, 0);
  const max = evals.reduce((s, e) => s + total(e).max, 0);
  const pct = max ? Math.round((got / max) * 100) : 0;
  const topicScores = [
    ...evals.reduce((scores, evaluation) => {
      const score = scores.get(evaluation.topic) ?? { got: 0, max: 0 };
      const result = total(evaluation);
      scores.set(evaluation.topic, { got: score.got + result.got, max: score.max + result.max });
      return scores;
    }, new Map<string, { got: number; max: number }>()),
  ].sort((a, b) => b[1].got / b[1].max - a[1].got / a[1].max);

  useEffect(() => {
    if (
      phase === "results" &&
      pct > 80 &&
      !reduceMotion &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.4 } });
  }, [phase, pct, reduceMotion]);

  const canCheck =
    items.length > 0 &&
    (source === "generated"
      ? papers.length === 0 || papers.some((paper) => paper.id === paperId)
      : !!qpFile);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <Link
        to="/practice"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Practice Papers
      </Link>
      <PageHeader
        title="AI Paper Checking"
        icon={ScanSearch}
        accent="practice"
        description="Upload your handwritten answers and get marks with friendly feedback."
        action={
          phase === "results" ? (
            <GradientButton
              variant="ghost"
              size="sm"
              onClick={() => {
                items.forEach((item) => item.url && URL.revokeObjectURL(item.url));
                setPhase("upload");
                setItems([]);
                setEvals([]);
              }}
            >
              Check another
            </GradientButton>
          ) : undefined
        }
      />

      {phase === "upload" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
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
              addFiles(e.dataTransfer.files);
            }}
            className={cn("rounded-3xl p-[2px]", drag && "animated-border")}
          >
            <div
              className={cn(
                "flex flex-col items-center gap-3 rounded-[calc(1.5rem-2px)] border-2 border-dashed bg-card px-6 py-10 text-center",
                drag && "border-transparent",
              )}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ background: "var(--practice-soft)", color: "var(--practice)" }}
              >
                <Upload className="h-6 w-6" />
              </span>
              <p className="font-semibold">Drop photos or PDFs of your answer sheets</p>
              <div className="flex flex-wrap justify-center gap-2">
                <GradientButton variant="secondary" onClick={() => inputRef.current?.click()}>
                  Browse files
                </GradientButton>
              </div>
              <button
                onClick={() => {
                  items.forEach((item) => item.url && URL.revokeObjectURL(item.url));
                  loadSample();
                }}
                className="text-sm font-medium text-primary hover:underline"
              >
                Try a sample
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*,.pdf"
                hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Drag to put pages in order.</p>
              <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-2">
                {items.map((it, i) => (
                  <Reorder.Item
                    key={it.id}
                    value={it}
                    className="flex cursor-grab items-center gap-3 rounded-xl border bg-card p-2 shadow-soft active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="w-6 text-center text-xs font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                      {it.url ? (
                        <img
                          src={it.url}
                          alt={it.name}
                          className="h-full w-full object-cover transition-transform"
                          style={{ transform: `rotate(${it.rotation}deg)` }}
                          draggable={false}
                        />
                      ) : (
                        <FileText
                          className="h-6 w-6 text-muted-foreground transition-transform"
                          style={{ transform: `rotate(${it.rotation}deg)` }}
                        />
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm">{it.name}</span>
                    <button
                      aria-label="Rotate"
                      onClick={() =>
                        setItems((s) =>
                          s.map((x) =>
                            x.id === it.id ? { ...x, rotation: (x.rotation + 90) % 360 } : x,
                          ),
                        )
                      }
                      className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                    >
                      <RotateCw className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Remove ${it.name}`}
                      onClick={() => {
                        if (it.url) URL.revokeObjectURL(it.url);
                        setItems((s) => s.filter((x) => x.id !== it.id));
                      }}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            </div>
          )}

          <SoftCard className="space-y-3 p-5">
            <p className="font-semibold">Question paper</p>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {(
                [
                  ["generated", "From a generated practice paper"],
                  ["upload", "Upload the question paper too"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={source === id}
                  onClick={() => setSource(id)}
                  className={cn(
                    "rounded-xl border p-3 text-left text-sm font-medium transition-colors",
                    source === id ? "border-primary bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {source === "generated" ? (
              papers.length ? (
                <Select value={paperId} onValueChange={setPaperId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a paper" />
                  </SelectTrigger>
                  <SelectContent>
                    {papers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.subject} · {p.chapter} · {p.totalMarks} marks
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No saved papers yet — we'll match answers to the sample Electricity paper.
                </p>
              )
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed p-3 text-sm hover:bg-muted">
                <Upload className="h-4 w-4" />
                {qpFile?.name ?? "Choose question paper (image or PDF)"}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  hidden
                  onChange={(e) => setQpFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </SoftCard>
          <div className="flex justify-end">
            <GradientButton size="lg" disabled={!canCheck} onClick={run}>
              <Sparkles className="h-4 w-4" />
              Check my answers
            </GradientButton>
          </div>
        </motion.div>
      )}

      {phase === "processing" && (
        <div className="space-y-5">
          <SoftCard className="p-6">
            <ol className="grid gap-4 sm:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                      i < step && "border-success bg-success text-primary-foreground",
                      i === step && "border-primary text-primary",
                    )}
                  >
                    {i < step ? (
                      <Check className="h-4 w-4" />
                    ) : i === step ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={cn("text-sm", i <= step ? "font-medium" : "text-muted-foreground")}
                  >
                    {s}
                  </span>
                </li>
              ))}
            </ol>
            {uploadProgress > 0 && (
              <div className="mt-5 space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Uploading answer pages</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Upload progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={uploadProgress}
                  className="h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </SoftCard>
          <div className="grid gap-3">
            {[0, 1].map((i) => (
              <CardSkeleton key={i} lines={4} />
            ))}
          </div>
        </div>
      )}

      {phase === "error" && (
        <SoftCard className="mx-auto max-w-md p-6 text-center">
          <p className="font-semibold">We couldn't read those pages</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {errorMessage || "Try brighter light and a flat page."}
          </p>
          <GradientButton className="mt-4" onClick={run}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </GradientButton>
        </SoftCard>
      )}

      {phase === "results" && (
        <div className="space-y-5">
          <SoftCard className="flex flex-col items-center gap-6 p-6 sm:flex-row">
            <ProgressRing
              value={pct}
              size={120}
              stroke={10}
              label={
                <span className="text-2xl font-semibold tabular-nums">
                  {got}/{max}
                </span>
              }
            />
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <Stat label="Percentage" value={`${pct}%`} />
              <Stat
                label="Strongest topic"
                value={topicScores[0]?.[0] ?? "—"}
                tone="text-success"
              />
              <Stat
                label="Weakest topic"
                value={topicScores[topicScores.length - 1]?.[0] ?? "—"}
                tone="text-warning"
              />
            </div>
            <Link
              to="/practice"
              onClick={() =>
                setView({
                  stage: "generate",
                  prefillWeak: topicScores.slice(-2).map(([topic]) => topic),
                })
              }
            >
              <GradientButton>
                <TrendingUp className="h-4 w-4" />
                Practise weak topics
              </GradientButton>
            </Link>
          </SoftCard>
          {evals.map((e, i) => (
            <EvalCard
              key={e.id}
              n={i + 1}
              e={e}
              onChange={(ne) => setEvals((s) => s.map((x) => (x.id === ne.id ? ne : x)))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("truncate font-semibold", tone)}>{value}</p>
    </div>
  );
}

function EvalCard({
  n,
  e,
  onChange,
}: {
  n: number;
  e: Evaluation;
  onChange: (e: Evaluation) => void;
}) {
  const [draft, setDraft] = useState(e.answer);
  const [busy, setBusy] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const t = total(e);
  const ratio = t.got / t.max;
  const reeval = async () => {
    setBusy(true);
    try {
      onChange(await reEvaluateAnswer(e, draft));
      toast.success("Re-evaluated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't re-evaluate this answer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SoftCard
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: n * 0.05 }}
      className="space-y-4 p-5"
    >
      <div className="flex items-start gap-3">
        <span className="font-semibold">Q{n}.</span>
        <p className="flex-1">{e.question}</p>
        <span
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
            ratio >= 0.8
              ? "bg-success/15 text-success"
              : ratio >= 0.5
                ? "bg-warning/20 text-warning"
                : "bg-destructive/10 text-destructive",
          )}
        >
          {t.got}/{t.max}
        </span>
      </div>
      <div className="space-y-2">
        <label
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          htmlFor={`ans-${e.id}`}
        >
          Your answer (as we read it — fix anything we got wrong)
        </label>
        <Textarea
          id={`ans-${e.id}`}
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          rows={3}
        />
        <GradientButton
          size="sm"
          variant="secondary"
          onClick={reeval}
          disabled={busy || draft === e.answer}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Re-evaluate
        </GradientButton>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-1 font-medium">Rubric</th>
            <th className="w-1/2 pb-1" />
            <th className="pb-1 text-right font-medium">Marks</th>
          </tr>
        </thead>
        <tbody>
          {e.rubric.map((r, i) => (
            <tr key={r.label}>
              <td className="py-1.5 pr-3">{r.label}</td>
              <td className="py-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className={cn(
                      "h-full rounded-full",
                      r.got === r.max
                        ? "bg-success"
                        : r.got > 0
                          ? "bg-warning"
                          : "bg-destructive/60",
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${(r.got / r.max) * 100}%` }}
                    transition={{ duration: 0.7, delay: i * 0.08 }}
                  />
                </div>
              </td>
              <td className="py-1.5 pl-3 text-right tabular-nums">
                {r.got}/{r.max}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-success">
            <ThumbsUp className="h-4 w-4" />
            What you did well
          </p>
          {e.good}
        </div>
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-warning">
            <TrendingUp className="h-4 w-4" />
            How to improve
          </p>
          {e.improve}
        </div>
      </div>
      <div>
        <button
          onClick={() => setShowModel((v) => !v)}
          aria-expanded={showModel}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary"
        >
          Model answer
          <ChevronDown className={cn("h-4 w-4 transition-transform", showModel && "rotate-180")} />
        </button>
        {showModel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-2 rounded-xl bg-muted/60 p-3 text-sm"
          >
            <Markdown content={e.model} />
          </motion.div>
        )}
      </div>
    </SoftCard>
  );
}
