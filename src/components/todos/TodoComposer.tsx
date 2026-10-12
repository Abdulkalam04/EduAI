import { useState, useRef, useEffect, type KeyboardEvent, type FormEvent } from "react";
import { ListPlus, Plus, Sparkles, AlertCircle } from "lucide-react";
import { SoftCard, FeatureIcon, GradientButton } from "@/components/ui-custom";
import { parseTodoInput, formatIsoDate } from "@/lib/todo-parse";
import { useCreateTodoList, useAddTodoItems } from "@/lib/todos";
import type { TodoList } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TodoComposerProps {
  name?: string | undefined;
  activeList?: TodoList | null | undefined;
  onSuccess?: (() => void) | undefined;
  className?: string | undefined;
}

export function defaultPlanTitle(d: Date = new Date()): string {
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  const day = d.getDate();
  const month = d.toLocaleDateString(undefined, { month: "short" });
  return `Plan for ${weekday}, ${day} ${month}`;
}

export function TodoComposer({ name, activeList, onSuccess, className }: TodoComposerProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"new" | "add">("new");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const createListMutation = useCreateTodoList();
  const addItemsMutation = useAddTodoItems();

  const isSubmitting = createListMutation.isPending || addItemsMutation.isPending;

  const parsed = parseTodoInput(input);
  const hasTasks = parsed.items.length > 0;

  // Auto-grow textarea between ~2 rows and ~6 rows
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(Math.max(el.scrollHeight, 60), 180);
    el.style.height = `${nextHeight}px`;
  }, [input]);

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!hasTasks || isSubmitting) return;

    const todayIso = formatIsoDate(new Date());

    if (mode === "add" && activeList) {
      await addItemsMutation.mutateAsync({
        listId: activeList.id,
        items: parsed.items,
      });
      setInput("");
      onSuccess?.();
    } else {
      await createListMutation.mutateAsync({
        title: defaultPlanTitle(),
        plan_date: todayIso,
        items: parsed.items,
      });
      setInput("");
      onSuccess?.();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const isFinePointer =
      typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
    if (e.key === "Enter" && !e.shiftKey && isFinePointer) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const headingText = name?.trim()
    ? `Hi ${name.trim()}, what do you want to cover?`
    : "What do you want to cover?";

  return (
    <section aria-labelledby="todo-composer-title" className={className}>
      <SoftCard className="space-y-4 rounded-2xl p-4 md:p-6 shadow-soft border">
        <div className="flex items-start gap-3">
          <FeatureIcon icon={ListPlus} accent="tutor" size="md" />
          <div className="min-w-0 flex-1">
            <h1
              id="todo-composer-title"
              className="text-xl font-semibold tracking-tight text-foreground"
            >
              {headingText}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              Write your tasks, one per line or separated by commas. Add today, tomorrow or a
              weekday to schedule one.
            </p>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              aria-label="Tasks to cover"
              placeholder="e.g. Revise Chapter 3 Physics, Solve 10 algebra problems, Read DBMS notes tomorrow"
              className="w-full resize-none rounded-xl border border-input bg-background/80 px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-150"
            />
          </div>

          {/* Warnings */}
          {parsed.warnings.length > 0 && (
            <div className="flex flex-col gap-1 text-xs text-amber-600 dark:text-amber-400">
              {parsed.warnings.map((w, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Live preview chip */}
            <div className="flex items-center gap-2">
              {input.trim() ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/80 px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span>
                    {parsed.items.length} {parsed.items.length === 1 ? "task" : "tasks"}
                  </span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Press Enter to submit on desktop
                </span>
              )}

              {/* Segmented control when active list exists */}
              {activeList && (
                <div
                  role="radiogroup"
                  aria-label="List creation mode"
                  className="inline-flex items-center rounded-lg border bg-muted/50 p-0.5 text-xs font-medium"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === "new"}
                    onClick={() => setMode("new")}
                    className={cn(
                      "rounded-md px-2.5 py-1 transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      mode === "new"
                        ? "bg-card text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    New list
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === "add"}
                    onClick={() => setMode("add")}
                    className={cn(
                      "rounded-md px-2.5 py-1 transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      mode === "add"
                        ? "bg-card text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Add to current list
                  </button>
                </div>
              )}
            </div>

            {/* Action button */}
            <GradientButton
              type="submit"
              disabled={!hasTasks || isSubmitting}
              className="min-h-[44px] min-w-[130px]"
            >
              <Plus className="h-4 w-4" />
              <span>
                {isSubmitting
                  ? "Saving…"
                  : mode === "add" && activeList
                    ? "Add to list"
                    : "Create list"}
              </span>
            </GradientButton>
          </div>
        </form>
      </SoftCard>
    </section>
  );
}
