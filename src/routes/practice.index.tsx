import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { GradientButton, PageHeader } from "@/components/ui-custom";
import { Generator } from "@/components/practice/Generator";
import { Attempt } from "@/components/practice/Attempt";
import { Results } from "@/components/practice/Results";
import { usePracticeStore } from "@/store/usePracticeStore";

const TITLE = "Practice Papers — EduAI";
const DESC =
  "Generate timed practice papers for your chapter, attempt them like a real exam and get marks with feedback.";

export const Route = createFileRoute("/practice/")({
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
  component: PracticePage,
});

const STAGES = ["Generate", "Attempt", "Results"] as const;

function PracticePage() {
  const { view, papers, attempts, setView } = usePracticeStore();
  const paper = view.stage !== "generate" ? papers.find((p) => p.id === view.paperId) : undefined;
  const attempt = paper ? attempts[paper.id] : undefined;
  const missing =
    view.stage !== "generate" &&
    (!paper || !attempt || (view.stage === "results" && !attempt.result));
  const stageIdx = missing ? 0 : view.stage === "generate" ? 0 : view.stage === "attempt" ? 1 : 2;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-8">
      <PageHeader
        title="Practice Papers"
        icon={ClipboardList}
        accent="practice"
        description="Fresh papers tuned to your syllabus and weak topics."
        action={
          stageIdx > 0 ? (
            <GradientButton
              variant="ghost"
              size="sm"
              onClick={() => setView({ stage: "generate" })}
            >
              New paper
            </GradientButton>
          ) : undefined
        }
      />
      <ol className="flex items-center gap-2 text-sm" aria-label="Progress">
        {STAGES.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
                i < stageIdx && "border-success bg-success text-primary-foreground",
                i === stageIdx && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {i < stageIdx ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={cn(i === stageIdx ? "font-medium" : "text-muted-foreground")}
              aria-current={i === stageIdx ? "step" : undefined}
            >
              {s}
            </span>
            {i < 2 && <span className="h-px w-6 bg-border sm:w-10" />}
          </li>
        ))}
      </ol>
      {missing || view.stage === "generate" ? (
        <Generator
          key={view.stage === "generate" ? (view.prefillWeak ?? []).join("|") : "x"}
          {...(view.stage === "generate" && view.prefillWeak
            ? { prefillWeak: view.prefillWeak }
            : {})}
        />
      ) : view.stage === "attempt" && attempt!.status === "inprogress" ? (
        <Attempt key={paper!.id} paper={paper!} attempt={attempt!} />
      ) : attempt!.result ? (
        <Results paper={paper!} attempt={attempt!} />
      ) : null}
    </div>
  );
}
