import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { Check, Clock, Download, Minus, RotateCcw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip, GradientButton, ProgressRing, SoftCard } from "@/components/ui-custom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Markdown } from "@/components/tutor/Markdown";
import type { Paper } from "@/lib/mock/practice";
import { downloadPdf } from "@/lib/pdf";
import { usePracticeStore, type Attempt } from "@/store/usePracticeStore";
import { useUiStore } from "@/store/useUiStore";

type Filter = "All" | "Correct" | "Wrong" | "Skipped";

export function gradeLabel(pct: number) {
  return pct >= 80 ? "Excellent" : pct >= 50 ? "Good" : "Keep practising";
}

export function Results({ paper, attempt }: { paper: Paper; attempt: Attempt }) {
  const r = attempt.result!;
  const { setView, startAttempt } = usePracticeStore();
  const reduceMotion = useUiStore((state) => state.reduceMotion);
  const [filter, setFilter] = useState<Filter>("All");
  const pct = Math.round((r.score / r.total) * 100);
  const grade = gradeLabel(pct);
  const mins = Math.round(r.timeUsedSec / 60);

  useEffect(() => {
    if (pct > 80 && !reduceMotion && !window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.4 },
        colors: ["#6366F1", "#22C55E", "#F59E0B"],
      });
  }, [pct, reduceMotion]);

  const items = paper.questions
    .map((q, i) => ({ q, i, res: r.perQ.find((x) => x.id === q.id)! }))
    .filter(
      ({ res }) =>
        filter === "All" ||
        (filter === "Correct" && res.status === "correct") ||
        (filter === "Wrong" && (res.status === "wrong" || res.status === "partial")) ||
        (filter === "Skipped" && res.status === "skipped"),
    );

  const yourAnswer = (q: Paper["questions"][number]) => {
    const a = attempt.answers[q.id];
    if (!a?.trim()) return "—";
    return q.type === "mcq" ? `${"ABCD"[Number(a)]}. ${q.options![Number(a)]}` : a;
  };

  const exportPdf = async () => {
    try {
      await downloadPdf(
        `practice-report-${paper.chapter}.pdf`,
        `${paper.title} — ${paper.chapter} · Report`,
        [
          {
            heading: "Summary",
            body: `Score: ${r.score}/${r.total} (${pct}%) — ${grade}\nTime used: ${mins} min\nWeak topics: ${r.weakTopics.join(", ") || "none"}`,
          },
          {
            heading: "Sections",
            body: r.sections
              .map((s) => `Section ${s.id} ${s.name}: ${s.score}/${s.max}`)
              .join("\n"),
          },
          ...paper.questions.map((q, i) => {
            const res = r.perQ.find((x) => x.id === q.id)!;
            return {
              heading: `Q${i + 1}. ${q.text} [${res.awarded}/${q.marks}]`,
              body: `Your answer: ${yourAnswer(q)}\nModel answer: ${q.model}\nFeedback: ${res.feedback}`,
            };
          }),
        ],
      );
      toast.success("PDF downloaded");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Couldn't export your report.");
    }
  };

  return (
    <div className="space-y-5">
      <SoftCard className="flex flex-col items-center gap-6 p-6 sm:flex-row">
        <ProgressRing
          value={pct}
          size={140}
          stroke={11}
          label={
            <span className="text-3xl font-semibold tabular-nums">
              {r.score}
              <span className="text-base text-muted-foreground">/{r.total}</span>
            </span>
          }
        />
        <div className="flex-1 space-y-2 text-center sm:text-left">
          <p className="text-sm text-muted-foreground">
            {paper.subject} · {paper.chapter}
          </p>
          <h2 className="text-2xl font-semibold">
            {grade}
            {pct >= 80 ? " 🎉" : ""}
          </h2>
          <p className="text-muted-foreground">
            {pct >= 80
              ? "Brilliant work — you really know this chapter."
              : pct >= 50
                ? "Solid effort! A little more practice on a few topics and you'll ace it."
                : "Every paper makes you stronger. Let's work on a few topics together."}
          </p>
          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {mins} of {paper.timeMin} min used
          </p>
        </div>
      </SoftCard>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <SoftCard className="space-y-4 p-5">
          <h3 className="font-semibold">Section-wise</h3>
          {r.sections.map((s, i) => (
            <div key={s.id} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>
                  Section {s.id} · {s.name}
                </span>
                <span className="font-medium tabular-nums">
                  {s.score}/{s.max}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-gradient-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${(s.score / s.max) * 100}%` }}
                  transition={{ duration: 0.8, delay: i * 0.1 }}
                />
              </div>
            </div>
          ))}
        </SoftCard>
        <SoftCard className="space-y-4 p-5">
          <h3 className="font-semibold">Topics to strengthen</h3>
          {r.weakTopics.length ? (
            <div className="flex flex-wrap gap-2">
              {r.weakTopics.map((t) => (
                <span
                  key={t}
                  className="rounded-full px-3 py-1 text-sm font-medium"
                  style={{ background: "var(--practice-soft)", color: "var(--practice)" }}
                >
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No weak topics this time — amazing!</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {r.weakTopics.length > 0 && (
              <GradientButton
                onClick={() => setView({ stage: "generate", prefillWeak: r.weakTopics })}
              >
                <Sparkles className="h-4 w-4" />
                Generate another paper on weak topics
              </GradientButton>
            )}
            <GradientButton variant="secondary" onClick={exportPdf}>
              <Download className="h-4 w-4" />
              Download report as PDF
            </GradientButton>
            <GradientButton variant="ghost" onClick={() => startAttempt(paper)}>
              <RotateCcw className="h-4 w-4" />
              Retry this paper
            </GradientButton>
          </div>
        </SoftCard>
      </div>

      <SoftCard className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Question review</h3>
          <div className="flex flex-wrap gap-1.5">
            {(["All", "Correct", "Wrong", "Skipped"] as Filter[]).map((f) => (
              <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>
                {f}
              </Chip>
            ))}
          </div>
        </div>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          <Accordion type="multiple">
            {items.map(({ q, i, res }) => (
              <AccordionItem key={q.id} value={q.id}>
                <AccordionTrigger className="gap-3 text-left hover:no-underline">
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                        res.status === "correct"
                          ? "bg-success/15 text-success"
                          : res.status === "partial"
                            ? "bg-warning/20 text-warning"
                            : res.status === "wrong"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground",
                      )}
                    >
                      {res.status === "correct" ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : res.status === "skipped" ? (
                        <Minus className="h-3.5 w-3.5" />
                      ) : res.status === "partial" ? (
                        <span className="text-[10px] font-bold">½</span>
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-normal">
                      Q{i + 1}. {q.text}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {res.awarded}/{q.marks}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pl-9 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Your answer
                    </p>
                    <p className="whitespace-pre-wrap">{yourAnswer(q)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Correct answer
                    </p>
                    <Markdown
                      content={`${q.type === "mcq" ? `${"ABCD"[q.correct!]}. ${q.options![q.correct!]} — ` : ""}${q.model}`}
                    />
                  </div>
                  <div className="rounded-xl p-3" style={{ background: "var(--tutor-soft)" }}>
                    <p className="text-xs font-semibold">AI feedback</p>
                    <Markdown content={res.feedback} />
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </SoftCard>
    </div>
  );
}
