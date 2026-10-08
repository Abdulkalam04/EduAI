import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, MessageCircle, Send } from "lucide-react";
import { dashboardQuery } from "@/lib/api";
import type { Activity, PlanItem } from "@/lib/types";
import { useUserStore } from "@/store/useUserStore";
import {
  EmptyState,
  FeatureIcon,
  GradientButton,
  SectionHeader,
  StickyActionBar,
  SoftCard,
} from "@/components/ui-custom";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — EduAI" },
      {
        name: "description",
        content: "Ask a question, continue studying, or follow today's plan.",
      },
    ],
  }),
  component: HomePage,
});

const ACTIVITY_PATH: Record<Activity["kind"], string> = {
  tutor: "/tutor",
  solver: "/solver",
  practice: "/practice",
  book: "/book",
  ppt: "/ppt",
};

function HomePage() {
  const name = useUserStore((state) => state.name);
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery(dashboardQuery);

  useEffect(() => {
    if (data) setPlan(data.plan.slice(0, 3));
  }, [data]);

  const ask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    window.sessionStorage.setItem("eduai-pending-question", text);
    void navigate({ to: "/tutor" });
  };

  const activity = data?.activity[0];

  return (
    <div className="mobile-action-content space-y-6 px-4 py-6 md:space-y-8 md:px-8">
      <section aria-labelledby="ask-title">
        <SoftCard className="space-y-4 rounded-2xl p-4 md:p-6">
          <div className="flex items-center gap-3">
            <FeatureIcon icon={MessageCircle} accent="tutor" />
            <div>
              <h1 id="ask-title" className="text-xl font-semibold">
                {name
                  ? `Hi ${name}, what would you like to learn?`
                  : "What would you like to learn?"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Ask a question and get a clear explanation.
              </p>
            </div>
          </div>
          <form onSubmit={ask} className="hidden gap-2 md:flex">
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask a question…"
              aria-label="Ask a question"
              className="h-11 min-w-0 text-base"
            />
            <GradientButton type="submit" disabled={!question.trim()} aria-label="Ask the tutor">
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Ask</span>
            </GradientButton>
          </form>
        </SoftCard>
      </section>
      <StickyActionBar className="sticky-action-multiaction flex gap-2 rounded-xl border bg-card p-2 shadow-soft">
        <form onSubmit={ask} className="flex w-full gap-2">
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a question…"
            aria-label="Ask a question"
            className="h-12 min-w-0 text-base"
          />
          <GradientButton type="submit" disabled={!question.trim()} aria-label="Ask the tutor">
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Ask</span>
          </GradientButton>
        </form>
      </StickyActionBar>

      <section aria-labelledby="continue-title">
        <SectionHeader title="Continue where you left off" />
        {isError && !data ? (
          <SoftCard className="rounded-2xl p-4 md:p-6">
            <EmptyState
              icon={BookOpen}
              title="Your study activity didn't load"
              description={
                error instanceof Error ? error.message : "Check your connection, then try again."
              }
              action={
                <GradientButton onClick={() => void refetch()} disabled={isFetching}>
                  {isFetching ? "Trying again…" : "Retry"}
                </GradientButton>
              }
            />
          </SoftCard>
        ) : isLoading ? (
          <SoftCard
            role="status"
            className="flex min-h-24 flex-col justify-center gap-1 rounded-2xl p-4 md:p-6"
          >
            <p className="text-lg font-semibold">Continue studying</p>
            <p className="text-sm text-muted-foreground">Your recent activity will appear here.</p>
          </SoftCard>
        ) : activity ? (
          <Link
            to={ACTIVITY_PATH[activity.kind]}
            className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SoftCard interactive className="flex items-center gap-4 rounded-2xl p-4 md:p-6">
              <FeatureIcon icon={BookOpen} accent="book" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{activity.title}</span>
                <span className="mt-1 block truncate text-sm text-muted-foreground">
                  {activity.detail}
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </SoftCard>
          </Link>
        ) : (
          <SoftCard className="flex items-center justify-between gap-4 rounded-2xl p-4 md:p-6">
            <p className="text-sm text-muted-foreground">Your recent study will appear here.</p>
            <Link to="/study">
              <GradientButton variant="secondary">Explore Study</GradientButton>
            </Link>
          </SoftCard>
        )}
      </section>

      <section aria-labelledby="plan-title">
        <SectionHeader
          title="Today's plan"
          description={
            plan.length ? `${plan.filter((item) => item.done).length} of ${plan.length} done` : ""
          }
        />
        {isLoading ? (
          <div
            role="status"
            className="flex min-h-14 items-center gap-3 rounded-2xl border bg-card p-4"
          >
            <span className="h-5 w-5 shrink-0 rounded-md border bg-muted/40" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Preparing your study plan</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                Your next steps are loading.
              </span>
            </span>
          </div>
        ) : plan.length ? (
          <ul className="space-y-2">
            {plan.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() =>
                    setPlan((current) =>
                      current.map((entry) =>
                        entry.id === item.id ? { ...entry, done: !entry.done } : entry,
                      ),
                    )
                  }
                  aria-pressed={item.done}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    item.done && "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "h-5 w-5 shrink-0 rounded-md border",
                      item.done && "border-primary bg-primary",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block font-medium", item.done && "line-through")}>
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{item.meta}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <SoftCard className="rounded-2xl p-4 md:p-6">
            <p className="text-sm text-muted-foreground">
              Start with a question or choose a study tool to build today's plan.
            </p>
          </SoftCard>
        )}
      </section>
    </div>
  );
}
