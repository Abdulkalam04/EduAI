import { useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen } from "lucide-react";
import { dashboardQuery } from "@/lib/api";
import type { Activity } from "@/lib/types";
import { useUserStore } from "@/store/useUserStore";
import {
  EmptyState,
  FeatureIcon,
  GradientButton,
  SectionHeader,
  SoftCard,
} from "@/components/ui-custom";
import { TodoComposer } from "@/components/todos/TodoComposer";
import { TodoListSection } from "@/components/todos/TodoListSection";
import { useActiveTodoList } from "@/lib/todos";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — EduAI" },
      {
        name: "description",
        content: "Create a to-do list, continue studying, and follow today's plan.",
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
  const composerContainerRef = useRef<HTMLDivElement>(null);
  const { data: activeList } = useActiveTodoList();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery(dashboardQuery);

  const handleFocusComposer = () => {
    composerContainerRef.current?.scrollIntoView({ behavior: "smooth" });
    const textarea = composerContainerRef.current?.querySelector("textarea");
    textarea?.focus();
  };

  const activity = data?.activity[0];

  return (
    <div className="space-y-6 px-4 py-6 md:space-y-8 md:px-8">
      {/* 1. Create a to-do list composer card */}
      <div ref={composerContainerRef}>
        <TodoComposer name={name} activeList={activeList} />
      </div>

      {/* 2. Continue where you left off */}
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

      {/* 3. Today's plan section */}
      <TodoListSection onFocusComposer={handleFocusComposer} />
    </div>
  );
}
