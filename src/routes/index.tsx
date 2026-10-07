import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Upload,
  Flame,
  Zap,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Check,
  FileQuestion,
  ClipboardList,
  BookOpen,
  Presentation,
} from "lucide-react";
import { dashboardQuery } from "@/lib/api";
import type { PlanItem, Activity } from "@/lib/types";
import { TOOLS, type Accent } from "@/lib/nav";
import { useUserStore, getLevel } from "@/store/useUserStore";
import { useUiStore } from "@/store/useUiStore";
import {
  SoftCard,
  EmptyState,
  GradientButton,
  LevelBadge,
  ProgressRing,
  ProgressBar,
  AnimatedNumber,
  FeatureIcon,
  SectionHeader,
  SegmentedControl,
  CardSkeleton,
  Shimmer,
  stagger,
  rise,
} from "@/components/ui-custom";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — EduAI, your personal AI learning companion" },
      {
        name: "description",
        content:
          "Your EduAI dashboard: daily progress, streaks, subject mastery and today's study plan.",
      },
      { property: "og:title", content: "EduAI — Your Personal AI Learning Companion" },
      {
        property: "og:description",
        content:
          "Study smarter from Class 1 to graduation with an AI tutor that explains things at your level.",
      },
    ],
  }),
  component: Dashboard,
});

function dailyProgress(doneCount: number, totalCount: number) {
  return totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
}

function greeting(h: number) {
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const TONE: Record<string, string> = {
  "c1-5": "Ready for a fun learning adventure today?",
  "c6-8": "Let's discover something new today.",
  "c9-10": "A focused session today keeps exam stress away.",
  "c11-12": "Small daily wins add up to big results.",
  grad: "Pick up where you left off and keep building depth.",
};

function Dashboard() {
  const { name, level, onboarded } = useUserStore();
  const hydrated = useUiStore((state) => state.hydrated);
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    ...dashboardQuery,
  });
  const [hour, setHour] = useState<number | null>(null);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [tab, setTab] = useState<"Maths" | "Science" | "CS">("Maths");

  useEffect(() => setHour(new Date().getHours()), []);
  useEffect(() => {
    if (!hydrated) return;
    const onboardingRequested =
      typeof window !== "undefined" &&
      window.sessionStorage.getItem("eduai-start-onboarding") === "true";
    if (onboardingRequested && !onboarded) return;
    if (onboardingRequested) {
      window.sessionStorage.removeItem("eduai-start-onboarding");
    }
    if (!onboarded) void navigate({ to: "/welcome" });
  }, [hydrated, navigate, onboarded]);
  useEffect(() => {
    if (!data) return;
    const hasWeakTopics = Object.values(data.mastery).some((topics) =>
      topics.some((topic) => topic.value < 70),
    );
    setPlan(hasWeakTopics ? data.plan : []);
  }, [data]);

  const done = plan.filter((p) => p.done).length;
  const progress = data ? dailyProgress(done, plan.length) : 0;
  const masteryData = data;
  const playful = level === "c1-5";

  if (isError && !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
        <EmptyState
          icon={Bot}
          title="Dashboard couldn't load"
          description={error instanceof Error ? error.message : "Please try again."}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <GradientButton onClick={() => void refetch()} disabled={isFetching}>
                {isFetching ? "Retrying..." : "Try again"}
              </GradientButton>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-8">
      {/* Hero */}
      <motion.div variants={rise}>
        <div className="relative overflow-hidden rounded-3xl border bg-card p-6 shadow-soft sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-primary/25 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 right-40 h-64 w-64 rounded-full bg-primary-2/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.07] bg-gradient-primary"
          />
          <div className="relative max-w-2xl">
            <LevelBadge level={level} />
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">
              {hour === null ? "Welcome back" : greeting(hour)},{" "}
              <span className="text-gradient-primary">{name || "friend"}</span>
            </h2>
            <p className="mt-2 text-muted-foreground">
              {TONE[level]} <span className="hidden sm:inline">· {getLevel(level).style}.</span>
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/tutor">
                <GradientButton size="lg">
                  <Bot className="h-4 w-4" />
                  {playful ? "Ask your AI buddy" : "Ask the AI Tutor"}
                </GradientButton>
              </Link>
              <Link to="/solver">
                <GradientButton size="lg" variant="secondary">
                  <Upload className="h-4 w-4" />
                  Upload question paper
                </GradientButton>
              </Link>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div variants={stagger} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading || !data ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} lines={2} />)
        ) : (
          <>
            <Stat
              label="Daily progress"
              sub={`${done} of ${plan.length} tasks done`}
              icon={<FeatureIcon icon={CheckCircle2} accent="book" />}
            >
              <ProgressRing value={progress} size={64} />
            </Stat>
            <Stat
              label="Streak"
              sub="Keep it going!"
              icon={<FeatureIcon icon={Flame} accent="viva" />}
            >
              <span className="text-2xl font-bold">
                <AnimatedNumber value={data.stats.streak} /> days
              </span>
            </Stat>
            <Stat
              label="XP this week"
              sub="From your learning activity"
              icon={<FeatureIcon icon={Zap} accent="solver" />}
            >
              <span className="text-2xl font-bold">
                <AnimatedNumber value={data.stats.xpWeek} />
              </span>
            </Stat>
            <Stat
              label="Questions solved"
              sub="Across all subjects"
              icon={<FeatureIcon icon={CheckCircle2} accent="book" />}
            >
              <span className="text-2xl font-bold">
                <AnimatedNumber value={data.stats.solved} />
              </span>
            </Stat>
          </>
        )}
      </motion.div>

      {/* Tools */}
      <section>
        <SectionHeader
          title="Your tools"
          description="Everything you need to learn, practise and create."
        />
        <motion.div variants={stagger} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <motion.div key={t.title} variants={rise}>
              <Link
                to={t.to}
                className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <SoftCard interactive className="relative h-full overflow-hidden p-5">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: `var(--${t.accent}-soft)` }}
                  />
                  <div className="relative flex items-start gap-4">
                    <FeatureIcon icon={t.icon} accent={t.accent} />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{t.title}</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-foreground" />
                  </div>
                </SoftCard>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Mastery + activity */}
      <div className="grid gap-6 lg:grid-cols-5">
        <motion.div variants={rise} className="lg:col-span-3">
          <SoftCard className="h-full p-6">
            <SectionHeader
              title="Subject mastery"
              action={
                <SegmentedControl
                  id="mastery"
                  options={["Maths", "Science", "CS"]}
                  value={tab}
                  onChange={setTab}
                />
              }
            />
            {!masteryData ? (
              <div className="space-y-5">
                {[0, 1, 2].map((i) => (
                  <Shimmer key={i} className="h-8" />
                ))}
              </div>
            ) : (masteryData.mastery[tab] ?? []).length ? (
              <div className="space-y-5" key={tab}>
                {(masteryData.mastery[tab] ?? []).map((t) => {
                  const color =
                    t.value >= 80
                      ? "var(--success)"
                      : t.value >= 55
                        ? "var(--warning)"
                        : "var(--destructive)";
                  return (
                    <div key={t.name}>
                      <div className="mb-1.5 flex justify-between text-sm">
                        <span className="font-medium">{t.name}</span>
                        <span className="text-muted-foreground tabular-nums">{t.value}%</span>
                      </div>
                      <ProgressBar value={t.value} color={color} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Take a quiz or practice paper to see your progress.
              </p>
            )}
            {masteryData &&
              (() => {
                const list = masteryData.mastery[tab] ?? [];
                if (!list.length) return null;
                const strong = [...list].sort((a, b) => b.value - a.value)[0]!.name;
                const weak = [...list].sort((a, b) => a.value - b.value)[0]!.name;
                return (
                  <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-accent p-4 sm:flex-row sm:items-center">
                    <Sparkles className="h-5 w-5 shrink-0 text-accent-foreground" />
                    <p className="flex-1 text-sm text-accent-foreground">
                      You're doing well in {strong}. Let's spend more time on {weak}.
                    </p>
                    <Link to="/practice">
                      <GradientButton size="sm">Practice now</GradientButton>
                    </Link>
                  </div>
                );
              })()}
          </SoftCard>
        </motion.div>

        <motion.div variants={rise} className="lg:col-span-2">
          <SoftCard className="h-full p-6">
            <SectionHeader title="Recent activity" />
            {!data ? (
              <div className="space-y-4">
                {[0, 1, 2, 3].map((i) => (
                  <Shimmer key={i} className="h-10" />
                ))}
              </div>
            ) : data.activity.length ? (
              <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-4 before:top-2 before:w-px before:bg-border">
                {data.activity.map((a) => (
                  <ActivityRow key={a.id} a={a} />
                ))}
              </ol>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Your learning activity will appear here.
              </p>
            )}
          </SoftCard>
        </motion.div>
      </div>

      {/* Today's plan */}
      <motion.div variants={rise}>
        <SoftCard className="p-6">
          <SectionHeader
            title="Today's plan"
            description={plan.length ? `${done}/${plan.length} complete` : ""}
          />
          {!data ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Shimmer key={i} className="h-14" />
              ))}
            </div>
          ) : plan.length ? (
            <ul className="space-y-2">
              {plan.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() =>
                      setPlan((cur) =>
                        cur.map((x) => (x.id === p.id ? { ...x, done: !x.done } : x)),
                      )
                    }
                    aria-pressed={p.done}
                    className="flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors",
                        p.done
                          ? "border-transparent bg-gradient-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      <AnimatePresence>
                        {p.done && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                    <span className="flex-1">
                      <span
                        className={cn(
                          "block font-medium transition-colors",
                          p.done && "text-muted-foreground line-through",
                        )}
                      >
                        {p.title}
                      </span>
                      <span className="text-xs text-muted-foreground">{p.meta}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No study tasks yet. Practice a topic to build your plan.
            </p>
          )}
        </SoftCard>
      </motion.div>
    </motion.div>
  );
}

function Stat({
  label,
  sub,
  icon,
  children,
}: {
  label: string;
  sub: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={rise}>
      <SoftCard interactive className="h-full p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {icon}
        </div>
        <div className="mt-3">{children}</div>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </SoftCard>
    </motion.div>
  );
}

const KIND: Record<Activity["kind"], { icon: typeof Bot; accent: Accent }> = {
  tutor: { icon: Bot, accent: "tutor" },
  solver: { icon: FileQuestion, accent: "solver" },
  practice: { icon: ClipboardList, accent: "practice" },
  book: { icon: BookOpen, accent: "book" },
  ppt: { icon: Presentation, accent: "ppt" },
};

function ActivityRow({ a }: { a: Activity }) {
  const k = KIND[a.kind];
  return (
    <li className="relative flex gap-3">
      <FeatureIcon
        icon={k.icon}
        accent={a.kind === "tutor" ? "tutor" : k.accent}
        size="sm"
        className="relative ring-4 ring-card"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{a.title}</p>
        <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{a.time}</span>
    </li>
  );
}
