import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Activity,
  Award,
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronRight,
  Flame,
  GraduationCap,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import {
  ProgressBar,
  SectionHeader,
  SoftCard,
  AnimatedNumber,
  PageHeader,
  EmptyState,
  GradientButton,
  MobileStickyAction,
} from "@/components/ui-custom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getProgress } from "@/lib/api";
import type { ProgressSnapshot } from "@/lib/types";
import { useLearningStore } from "@/store/useLearningStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { useUiStore } from "@/store/useUiStore";
import { pageHead } from "@/components/ComingSoonPage";

const ProgressCharts = lazy(() => import("@/components/progress/ProgressCharts"));
type Range = "7 days" | "30 days" | "All";
type Topic = ProgressSnapshot["mastery"][string][number];

export const Route = createFileRoute("/progress")({
  head: pageHead("Progress", "Track your mastery, study streak, activity, and learning plan."),
  component: ProgressPage,
});

function ProgressPage() {
  const progress = useLearningStore((state) => state.progress);
  const setProgress = useLearningStore((state) => state.setProgress);
  const setPracticeView = usePracticeStore((state) => state.setView);
  const hydrated = useUiStore((state) => state.hydrated);
  const [subject, setSubject] = useState("All subjects");
  const [range, setRange] = useState<Range>("30 days");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoaded(false);
    setError("");
    try {
      setProgress(await getProgress());
      setLoaded(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Progress couldn't be loaded.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [setProgress]);
  useEffect(() => {
    if (hydrated) void load();
  }, [hydrated, load]);

  const subjects = useMemo(() => Object.keys(progress.mastery), [progress.mastery]);
  const selectedSubjects =
    subject === "All subjects" ? subjects : subjects.filter((item) => item === subject);
  const topics = useMemo<Topic[]>(
    () => selectedSubjects.flatMap((key) => progress.mastery[key] ?? []),
    [selectedSubjects, progress.mastery],
  );
  const mastery = topics.length
    ? Math.round(topics.reduce((sum, item) => sum + item.value, 0) / topics.length)
    : 0;
  const weakTopics = progress.weakTopics
    .filter((item) => subject === "All subjects" || item.subject === subject)
    .sort((a, b) => a.mastery - b.mastery);
  const activityDays = range === "7 days" ? 7 : range === "30 days" ? 30 : 84;
  const activity = progress.activity.slice(-activityDays);
  const weekCount = range === "7 days" ? 1 : range === "30 days" ? 4 : 7;
  const weeklyMinutes = progress.weeklyMinutes.slice(-weekCount);
  const plan = progress.weakTopics.length ? progress.studyPlan.slice(0, 7) : [];
  const hasProgress =
    progress.questionsAttempted > 0 ||
    Object.values(progress.mastery).some((items) => items.length > 0) ||
    progress.activity.some((item) => item.count > 0) ||
    progress.weeklyMinutes.some((item) => item.minutes > 0);

  const achievements = [
    {
      label: "First Quiz",
      detail: "Complete a learning question",
      unlocked: progress.questionsAttempted > 0,
      icon: BookOpenCheck,
    },
    {
      label: "7-Day Streak",
      detail: "Study seven days in a row",
      unlocked: progress.streak >= 7,
      icon: Flame,
    },
    {
      label: "100 Questions",
      detail: "Attempt 100 questions",
      unlocked: progress.questionsAttempted >= 100,
      icon: Target,
    },
    {
      label: "Perfect Score",
      detail: "Reach a 100% average",
      unlocked: progress.averageScore >= 100,
      icon: Trophy,
    },
  ];

  if (error && !loaded)
    return (
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-8">
        <PageHeader
          title="Progress"
          icon={Activity}
          accent="progress"
          description="Your learning journey, one small step at a time."
        />
        <EmptyState
          icon={RefreshCw}
          title="Progress didn't load"
          description={error}
          action={
            <GradientButton
              className="hidden md:inline-flex"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}Try again
            </GradientButton>
          }
        />
        <MobileStickyAction>
          <GradientButton className="w-full" onClick={() => void load()} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}Try again
          </GradientButton>
        </MobileStickyAction>
      </div>
    );
  if (!hydrated || (loading && !loaded))
    return (
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-8">
        <PageHeader
          title="Progress"
          icon={Activity}
          accent="progress"
          description="Your learning journey, one small step at a time."
        />
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-80 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 md:px-8">
      <PageHeader
        title="Progress"
        icon={Activity}
        accent="progress"
        description="Your learning journey, one small step at a time."
        action={
          <div className="flex w-full min-w-0 gap-2 sm:w-auto">
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger
                aria-label="Filter by subject"
                className="min-w-0 flex-1 sm:w-40 sm:flex-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All subjects">All subjects</SelectItem>
                {subjects.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={range} onValueChange={(value) => setRange(value as Range)}>
              <SelectTrigger
                aria-label="Filter by time range"
                className="min-w-0 flex-1 sm:w-32 sm:flex-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["7 days", "30 days", "All"] as Range[]).map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
          <button onClick={() => void load()} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}
      {!hasProgress ? (
        <EmptyState
          icon={GraduationCap}
          accent="progress"
          title="Your progress starts with one question"
          description="Take a quiz or try a practice paper to see your mastery, streak, and study recommendations here."
          action={
            <Link to="/practice">
              <GradientButton className="hidden md:inline-flex">
                Start practising
                <Sparkles className="h-4 w-4" />
              </GradientButton>
            </Link>
          }
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5">
            <Summary
              label="Overall mastery"
              value={
                <>
                  <AnimatedNumber value={mastery} />%
                </>
              }
              icon={Target}
              accent="progress"
              sub={subject === "All subjects" ? "Across subjects" : subject}
            />
            <Summary
              label="Current streak"
              value={
                <>
                  <AnimatedNumber value={progress.streak} /> days
                </>
              }
              icon={Flame}
              accent="viva"
              sub="Keep the rhythm going"
            />
            <Summary
              label="Longest streak"
              value={
                <>
                  <AnimatedNumber value={progress.longestStreak} /> days
                </>
              }
              icon={Zap}
              accent="solver"
              sub="Your personal best"
            />
            <Summary
              label="Questions attempted"
              value={<AnimatedNumber value={progress.questionsAttempted} />}
              icon={BookOpenCheck}
              accent="book"
              sub="Every attempt counts"
            />
            <Summary
              label="Average score"
              value={
                <>
                  <AnimatedNumber value={progress.averageScore} />%
                </>
              }
              icon={Award}
              accent="ppt"
              sub="Across your practice"
            />
          </section>
          <Suspense
            fallback={
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="h-80 animate-pulse rounded-2xl bg-muted" />
                <div className="h-80 animate-pulse rounded-2xl bg-muted" />
              </div>
            }
          >
            <ProgressCharts
              topics={topics}
              activity={activity}
              weeklyMinutes={weeklyMinutes}
              range={range}
            />
          </Suspense>
          <div className="grid gap-5 lg:grid-cols-5">
            <SoftCard className="p-5 lg:col-span-3">
              <SectionHeader
                title="Weak topics"
                description="A little focused practice can make a big difference."
              />
              {weakTopics.length ? (
                <div className="space-y-4">
                  {weakTopics.map((item) => (
                    <div
                      key={`${item.subject}-${item.topic}`}
                      className="flex flex-wrap items-center gap-3"
                    >
                      <div className="min-w-32 flex-1">
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium">
                            {item.topic}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {item.subject}
                            </span>
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {item.mastery}%
                          </span>
                        </div>
                        <ProgressBar value={item.mastery} color="var(--warning)" />
                      </div>
                      <span className="text-xs text-muted-foreground">{item.lastPractised}</span>
                      <Link
                        to="/practice"
                        onClick={() =>
                          setPracticeView({ stage: "generate", prefillWeak: [item.topic] })
                        }
                      >
                        <button className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-muted">
                          Practise
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No weak topics to highlight just yet.
                </p>
              )}
            </SoftCard>
            <SoftCard className="relative overflow-hidden p-5 lg:col-span-2">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-12 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-3xl"
              />
              <SectionHeader
                title="AI study plan"
                description="Small, focused sessions for your week."
              />
              <div className="grid grid-cols-7 gap-1.5">
                {plan.map((item) => (
                  <div key={item.day} className="rounded-lg bg-muted/60 py-2 text-center">
                    <p className="text-xs text-muted-foreground">{item.day}</p>
                    <p className="mt-1 text-xs font-semibold">{item.minutes}m</p>
                  </div>
                ))}
              </div>
              <ul className="relative mt-4 space-y-2">
                {plan.slice(0, 4).map((item) => (
                  <li key={item.day} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <CalendarDays className="h-3 w-3" />
                    </span>
                    <span>
                      <strong>{item.subject}:</strong> {item.task}
                    </span>
                  </li>
                ))}
              </ul>
            </SoftCard>
          </div>
          <SoftCard className="p-5">
            <SectionHeader
              title="Achievements"
              description="Celebrate the milestones you’ve reached along the way."
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {achievements.map(({ label, detail, unlocked, icon: Icon }) => (
                <motion.div
                  key={label}
                  {...(unlocked ? { whileHover: { y: -2 } } : {})}
                  className={`relative flex items-center gap-3 overflow-hidden rounded-xl border p-3 ${unlocked ? "border-warning/40 bg-warning/5" : "bg-muted/40 opacity-75"}`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${unlocked ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}
                  >
                    {unlocked ? <Icon className="h-5 w-5" /> : <LockKeyhole className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block text-xs text-muted-foreground">{detail}</span>
                  </span>
                  {unlocked && <Check className="ml-auto h-4 w-4 shrink-0 text-success" />}
                </motion.div>
              ))}
            </div>
          </SoftCard>
        </>
      )}
      <MobileStickyAction>
        <Link to={hasProgress ? "/study" : "/practice"} className="block">
          <GradientButton className="w-full">
            {hasProgress ? "Choose what to study" : "Start practising"}
          </GradientButton>
        </Link>
      </MobileStickyAction>
    </div>
  );
}

function Summary({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  icon: typeof Target;
  accent: "progress" | "viva" | "solver" | "book" | "ppt";
}) {
  return (
    <SoftCard className="flex min-h-32 min-w-0 items-center gap-3 p-4">
      <span
        style={{ backgroundColor: `var(--${accent}-soft)`, color: `var(--${accent})` }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-snug text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
        <p className="text-xs leading-snug text-muted-foreground">{sub}</p>
      </div>
    </SoftCard>
  );
}
