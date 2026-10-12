import { Clock, ArrowRight, Copy } from "lucide-react";
import { GradientButton } from "@/components/ui-custom";
import { formatIsoDate } from "@/lib/todo-parse";
import { useActivateTodoList, useCopyTodoList } from "@/lib/todos";
import type { TodoList } from "@/lib/types";

interface StaleListBannerProps {
  list: TodoList;
}

export function formatPlanDateLabel(planDate: string, today: Date = new Date()): string {
  const [y, m, d] = planDate.split("-").map(Number);
  if (!y || !m || !d) return planDate;
  const target = new Date(y, m - 1, d);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  return target.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function StaleListBanner({ list }: StaleListBannerProps) {
  const activateMutation = useActivateTodoList();
  const copyMutation = useCopyTodoList();

  const todayIso = formatIsoDate(new Date());
  const isStale = list.plan_date < todayIso;
  const hasUnfinished = list.items.some((i) => !i.done);

  if (!isStale || !hasUnfinished) {
    return null;
  }

  const dateLabel = formatPlanDateLabel(list.plan_date);

  const handleContinueToday = () => {
    void activateMutation.mutate({ id: list.id, plan_date: todayIso });
  };

  const handleCopyUnfinished = () => {
    void copyMutation.mutate({
      id: list.id,
      input: {
        only_unfinished: true,
        plan_date: todayIso,
        title: `${list.title || "Plan"} (continued)`,
      },
    });
  };

  const isPending = activateMutation.isPending || copyMutation.isPending;

  return (
    <div
      role="region"
      aria-label="Previous day's list reminder"
      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-950 dark:text-amber-100"
    >
      <div className="flex items-start gap-3">
        <Clock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold">This list is from {dateLabel}</p>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Continue it today or start fresh with the unfinished tasks.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
        <GradientButton
          size="sm"
          variant="primary"
          onClick={handleContinueToday}
          disabled={isPending}
          className="text-xs h-9 min-h-[36px]"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          <span>Continue today</span>
        </GradientButton>

        <GradientButton
          size="sm"
          variant="secondary"
          onClick={handleCopyUnfinished}
          disabled={isPending}
          className="text-xs h-9 min-h-[36px]"
        >
          <Copy className="h-3.5 w-3.5" />
          <span>Copy unfinished</span>
        </GradientButton>
      </div>
    </div>
  );
}
