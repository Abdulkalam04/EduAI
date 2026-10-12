import { useState } from "react";
import { History, Calendar, CheckCircle2, Copy, ArrowRight, Trash2, ListTodo } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GradientButton } from "@/components/ui-custom";
import { useTodoLists, useActivateTodoList, useCopyTodoList, useDeleteTodoList } from "@/lib/todos";
import { formatIsoDate } from "@/lib/todo-parse";
import { defaultPlanTitle } from "./TodoComposer";
import type { TodoListSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PreviousListsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeListId?: string | undefined;
}

export function formatRelativeDate(dateStr: string, today: Date = new Date()): string {
  const d = new Date(dateStr);
  const now = today.getTime();
  const diffMs = now - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
}

export function PreviousListsDialog({
  open,
  onOpenChange,
  activeListId,
}: PreviousListsDialogProps) {
  const [tab, setTab] = useState<"unfinished" | "all">("unfinished");

  const { data: unfinishedLists, isLoading: loadingUnfinished } = useTodoLists("unfinished", 30);
  const { data: allLists, isLoading: loadingAll } = useTodoLists("all", 30);

  const activateMutation = useActivateTodoList();
  const copyMutation = useCopyTodoList();
  const deleteMutation = useDeleteTodoList();

  const handleContinue = async (list: TodoListSummary) => {
    const todayIso = formatIsoDate(new Date());
    await activateMutation.mutateAsync({ id: list.id, plan_date: todayIso });
    onOpenChange(false);
  };

  const handleCopyUnfinished = async (list: TodoListSummary) => {
    const todayIso = formatIsoDate(new Date());
    await copyMutation.mutateAsync({
      id: list.id,
      input: {
        only_unfinished: true,
        plan_date: todayIso,
        title: `${list.title || "Plan"} (continued)`,
      },
    });
    onOpenChange(false);
  };

  const handleDelete = async (list: TodoListSummary) => {
    await deleteMutation.mutateAsync(list.id);
  };

  const renderList = (lists?: TodoListSummary[], isLoading?: boolean) => {
    if (isLoading) {
      return (
        <div className="space-y-3 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border bg-muted/30 p-4" />
          ))}
        </div>
      );
    }

    if (!lists || lists.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            <ListTodo className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground">
            {tab === "unfinished" ? "No unfinished lists" : "No previous lists"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tab === "unfinished"
              ? "All your earlier lists are completely done!"
              : "Lists you create will appear here for future reuse."}
          </p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-border/50 overflow-y-auto max-h-[60vh]">
        {lists.map((l) => {
          const isCurrent = l.id === activeListId || l.is_active;
          return (
            <div
              key={l.id}
              className={cn(
                "p-4 transition-colors hover:bg-muted/20 space-y-2.5",
                isCurrent && "bg-primary/5",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {l.title || "Untitled Plan"}
                    </h3>
                    {isCurrent && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatRelativeDate(l.updated_at || l.plan_date)}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-primary" />
                      <span>
                        {l.done} of {l.total} done
                      </span>
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleDelete(l)}
                  aria-label={`Delete list ${l.title}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Preview items */}
              {l.previewItems && l.previewItems.length > 0 && (
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
                  {l.previewItems.map((itemText, i) => (
                    <div key={i} className="flex items-center gap-2 truncate">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                      <span className="truncate">{itemText}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <GradientButton
                  size="sm"
                  variant="primary"
                  onClick={() => void handleContinue(l)}
                  className="text-xs h-9 min-h-[36px]"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  <span>Continue</span>
                </GradientButton>

                {l.total > l.done && (
                  <GradientButton
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleCopyUnfinished(l)}
                    className="text-xs h-9 min-h-[36px]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy unfinished</span>
                  </GradientButton>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden rounded-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="p-4 pb-2 border-b">
          <div className="flex items-center gap-2 text-primary">
            <History className="h-5 w-5" />
            <DialogTitle className="text-lg font-semibold">Previous lists</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Pick an unfinished list to continue today or copy remaining tasks into a fresh list.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "unfinished" | "all")}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="px-4 pt-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="unfinished">Unfinished</TabsTrigger>
              <TabsTrigger value="all">All lists</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="unfinished" className="flex-1 min-h-0 mt-2">
            {renderList(unfinishedLists, loadingUnfinished)}
          </TabsContent>

          <TabsContent value="all" className="flex-1 min-h-0 mt-2">
            {renderList(allLists, loadingAll)}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
