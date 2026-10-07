import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GradientButton, ProgressBar, ProgressRing, SoftCard } from "@/components/ui-custom";
import { Markdown } from "@/components/tutor/Markdown";
import type { Mcq } from "@/lib/mock/book";

const L = ["A", "B", "C", "D"];

export function McqQuiz({ questions }: { questions: Mcq[] }) {
  const [set, setSet] = useState(questions);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [showExp, setShowExp] = useState(false);
  const done = i >= set.length;
  const q = set[i];
  const picked = answers[i] ?? null;

  const pick = useCallback(
    (o: number) => {
      if (picked !== null || done) return;
      setAnswers((a) => a.map((v, k) => (k === i ? o : v)));
    },
    [picked, done, i],
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) pick(n - 1);
      if (e.key === "Enter" && picked !== null) next();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const next = () => {
    setShowExp(false);
    setI((v) => v + 1);
  };
  const restart = (qs: Mcq[]) => {
    setSet(qs);
    setAnswers(qs.map(() => null));
    setI(0);
    setShowExp(false);
  };

  if (done) {
    const score = answers.filter((a, k) => a === set[k]!.correct).length;
    const wrong = set.filter((m, k) => answers[k] !== m.correct);
    return (
      <SoftCard initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <ProgressRing
            value={Math.round((score / set.length) * 100)}
            size={120}
            stroke={10}
            label={
              <span className="text-2xl font-semibold">
                {score}/{set.length}
              </span>
            }
          />
          <h3 className="text-lg font-semibold">
            {score === set.length
              ? "Perfect score! 🎉"
              : score >= set.length / 2
                ? "Nice work!"
                : "Keep practising"}
          </h3>
          <div className="flex flex-wrap justify-center gap-2">
            {wrong.length > 0 && (
              <GradientButton onClick={() => restart(wrong)}>
                <RotateCcw className="h-4 w-4" />
                Retry wrong ones
              </GradientButton>
            )}
            <GradientButton variant="secondary" onClick={() => restart(questions)}>
              Start over
            </GradientButton>
          </div>
        </div>
        <ul className="mt-6 space-y-2">
          {set.map((m, k) => {
            const ok = answers[k] === m.correct;
            return (
              <li key={k} className="flex gap-3 rounded-xl border p-3 text-sm">
                {ok ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0">
                  <p className="font-medium">{m.q}</p>
                  <p className="text-muted-foreground">
                    Answer: {L[m.correct]}. {m.options[m.correct]}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </SoftCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {i + 1} / {set.length}
        </span>
        <ProgressBar
          value={((i + (picked !== null ? 1 : 0)) / set.length) * 100}
          className="flex-1"
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${i}-${q!.q}`}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.2 }}
          className="space-y-3"
        >
          <h3 className="text-lg font-semibold">{q!.q}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {q!.options.map((o, k) => {
              const isCorrect = picked !== null && k === q!.correct;
              const isWrong = picked === k && k !== q!.correct;
              return (
                <motion.button
                  key={k}
                  onClick={() => pick(k)}
                  disabled={picked !== null}
                  animate={
                    isWrong ? { x: [0, -6, 6, -4, 0] } : isCorrect ? { scale: [1, 1.03, 1] } : {}
                  }
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-xl border bg-card p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    picked === null && "hover:border-primary/50 hover:bg-muted",
                    isCorrect && "border-success bg-success/10",
                    isWrong && "border-destructive bg-destructive/10",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold",
                      isCorrect && "border-success bg-success text-primary-foreground",
                      isWrong && "border-destructive bg-destructive text-primary-foreground",
                    )}
                  >
                    {isCorrect ? (
                      <Check className="h-4 w-4" />
                    ) : isWrong ? (
                      <X className="h-4 w-4" />
                    ) : (
                      L[k]
                    )}
                  </span>
                  {o}
                </motion.button>
              );
            })}
          </div>
          {picked !== null && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <button
                onClick={() => setShowExp((v) => !v)}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary"
              >
                {showExp ? "Hide" : "Show"} explanation{" "}
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", showExp && "rotate-180")}
                />
              </button>
              {showExp && (
                <div className="rounded-xl bg-muted/60 p-3 text-sm">
                  <Markdown content={q!.explanation} />
                </div>
              )}
              <div className="flex justify-end">
                <GradientButton onClick={next}>
                  {i + 1 === set.length ? "See results" : "Next"}
                </GradientButton>
              </div>
            </motion.div>
          )}
          <p className="text-xs text-muted-foreground">Tip: press 1–4 to answer, Enter for next.</p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
