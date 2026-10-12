import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import {
  MoreVertical,
  CheckCircle,
  Plus,
  History,
  CheckCheck,
  RotateCcw,
  Trash2,
  Copy,
  Pencil,
  Sparkles,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SoftCard, GradientButton } from "@/components/ui-custom";
import { TodoItemRow } from "./TodoItemRow";
import { PreviousListsDialog } from "./PreviousListsDialog";
import { StaleListBanner, formatPlanDateLabel } from "./StaleListBanner";
import {
  useActiveTodoList,
  useToggleTodoItem,
  useEditTodoItem,
  useDeleteTodoItem,
  useAddTodoItems,
  useReorderTodoItems,
  useClearCompletedTodoItems,
  useToggleAllTodoItems,
  usePatchTodoList,
  useDeleteTodoList,
  useCopyTodoList,
} from "@/lib/todos";
import { parseTodoInput, formatIsoDate } from "@/lib/todo-parse";
import type { TodoItem } from "@/lib/types";

interface TodoListSectionProps {
  onFocusComposer?: () => void;
}

export function TodoListSection({ onFocusComposer }: TodoListSectionProps) {
  const { data: activeList, isLoading, isError, error, refetch } = useActiveTodoList();

  const [previousListsOpen, setPreviousListsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [newTaskText, setNewTaskText] = useState("");

  const renameInputRef = useRef<HTMLInputElement>(null);
  const newTaskInputRef = useRef<HTMLInputElement>(null);

  const toggleItemMutation = useToggleTodoItem();
  const editItemMutation = useEditTodoItem();
  const deleteItemMutation = useDeleteTodoItem();
  const addItemsMutation = useAddTodoItems();
  const reorderMutation = useReorderTodoItems();
  const clearCompletedMutation = useClearCompletedTodoItems();
  const toggleAllMutation = useToggleAllTodoItems();
  const patchListMutation = usePatchTodoList();
  const deleteListMutation = useDeleteTodoList();
  const copyListMutation = useCopyTodoList();

  useEffect(() => {
    if (activeList) {
      setRenameTitle(activeList.title);
    }
  }, [activeList]);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  // Rename handlers
  const handleSaveRename = () => {
    if (!activeList) return;
    const trimmed = renameTitle.trim();
    if (trimmed && trimmed !== activeList.title) {
      void patchListMutation.mutate({
        id: activeList.id,
        input: { title: trimmed },
      });
    } else {
      setRenameTitle(activeList.title);
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (activeList) setRenameTitle(activeList.title);
      setIsRenaming(false);
    }
  };

  // Add task row handler
  const handleAddTaskKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!activeList || !newTaskText.trim()) return;

      const parsed = parseTodoInput(newTaskText);
      const itemsToAdd = parsed.items.length > 0 ? parsed.items : [{ text: newTaskText.trim() }];

      void addItemsMutation.mutate({
        listId: activeList.id,
        items: itemsToAdd,
      });

      setNewTaskText("");
      newTaskInputRef.current?.focus();
    }
  };

  // Delete item with Undo
  const handleDeleteItem = (item: TodoItem) => {
    if (!activeList) return;
    const savedItem = item;
    deleteItemMutation.mutate(item.id);
    toast("Task deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          void addItemsMutation.mutate({
            listId: activeList.id,
            items: [{ text: savedItem.text, due_date: savedItem.due_date }],
          });
        },
      },
    });
  };

  // Reorder items
  const handleMove = (currentIndex: number, targetIndex: number) => {
    if (!activeList) return;
    const items = [...activeList.items];
    const [moved] = items.splice(currentIndex, 1);
    if (!moved) return;
    items.splice(targetIndex, 0, moved);
    const itemIds = items.map((i) => i.id);
    void reorderMutation.mutate({ listId: activeList.id, itemIds });
  };

  // Delete current list confirmed
  const handleConfirmDeleteList = () => {
    if (!activeList) return;
    void deleteListMutation.mutate(activeList.id);
    setDeleteConfirmOpen(false);
  };

  // Duplicate list as new
  const handleDuplicateList = () => {
    if (!activeList) return;
    const todayIso = formatIsoDate(new Date());
    void copyListMutation.mutate({
      id: activeList.id,
      input: {
        only_unfinished: false,
        plan_date: todayIso,
        title: `${activeList.title} (copy)`,
      },
    });
  };

  // Toggle all items
  const handleToggleAll = () => {
    if (!activeList) return;
    const allDone = activeList.items.length > 0 && activeList.items.every((i) => i.done);
    void toggleAllMutation.mutate({ listId: activeList.id, done: !allDone });
  };

  // Clear completed items
  const handleClearCompleted = () => {
    if (!activeList) return;
    void clearCompletedMutation.mutate(activeList.id);
  };

  const allItemsDone = activeList && activeList.total > 0 && activeList.done === activeList.total;

  const percent =
    activeList && activeList.total > 0 ? Math.round((activeList.done / activeList.total) * 100) : 0;

  return (
    <section aria-labelledby="todays-plan-heading" className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {activeList && isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              onBlur={handleSaveRename}
              onKeyDown={handleRenameKeyDown}
              maxLength={120}
              aria-label="Rename list title"
              className="w-full max-w-sm rounded-lg border border-input bg-background px-2.5 py-1 text-lg font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              <h2
                id="todays-plan-heading"
                onClick={() => activeList && setIsRenaming(true)}
                className="text-lg font-semibold tracking-tight text-foreground cursor-pointer hover:text-primary transition-colors"
                title={activeList ? "Click to rename list" : "Today's plan"}
              >
                {activeList?.title || "Today's plan"}
              </h2>

              {activeList && (
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary/80 px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{formatPlanDateLabel(activeList.plan_date)}</span>
                </span>
              )}
            </div>
          )}

          {activeList && (
            <div className="mt-1.5 flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-medium">
                {activeList.done} of {activeList.total} done
              </span>
              <div
                role="progressbar"
                aria-valuenow={activeList.done}
                aria-valuemin={0}
                aria-valuemax={activeList.total}
                aria-live="polite"
                className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Header action buttons */}
        <div className="flex items-center gap-2">
          <GradientButton
            variant="secondary"
            size="sm"
            onClick={() => setPreviousListsOpen(true)}
            className="text-xs h-9 min-h-[36px]"
          >
            <History className="h-3.5 w-3.5" />
            <span>Previous lists</span>
          </GradientButton>

          {activeList && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="List options"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setIsRenaming(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  <span>Rename list</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleToggleAll}>
                  <CheckCheck className="mr-2 h-4 w-4" />
                  <span>
                    {activeList.items.every((i) => i.done) ? "Uncheck all" : "Mark all done"}
                  </span>
                </DropdownMenuItem>
                {activeList.done > 0 && (
                  <DropdownMenuItem onClick={handleClearCompleted}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    <span>Clear completed</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleDuplicateList}>
                  <Copy className="mr-2 h-4 w-4" />
                  <span>Duplicate as new</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>Delete list</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Stale list banner */}
      {activeList && <StaleListBanner list={activeList} />}

      {/* Content states */}
      {isLoading ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl border bg-muted/40 p-4" />
          ))}
        </div>
      ) : isError ? (
        <SoftCard className="rounded-2xl p-6 text-center border">
          <p className="text-sm font-semibold text-destructive">
            {error instanceof Error ? error.message : "Failed to load to-do list"}
          </p>
          <div className="mt-3">
            <GradientButton size="sm" onClick={() => void refetch()}>
              Retry
            </GradientButton>
          </div>
        </SoftCard>
      ) : !activeList ? (
        <SoftCard className="rounded-2xl p-6 text-center border">
          <p className="text-sm font-semibold text-foreground">No active plan for today</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Type what you want to cover above to build your to-do list, or pick a previous list to
            continue.
          </p>
        </SoftCard>
      ) : (
        <div className="space-y-3">
          {/* Success banner if all tasks are done */}
          {allItemsDone && (
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-2xl border border-success/30 bg-success/10 p-4 text-success dark:text-success-foreground"
            >
              <div className="flex items-center gap-2.5">
                <CheckCircle className="h-5 w-5 text-success shrink-0" />
                <span className="text-sm font-semibold">All done! Fantastic work today.</span>
              </div>
              {onFocusComposer && (
                <GradientButton
                  size="sm"
                  variant="primary"
                  onClick={onFocusComposer}
                  className="text-xs h-9 min-h-[36px]"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Plan another day</span>
                </GradientButton>
              )}
            </div>
          )}

          {/* Items list */}
          <ul className="space-y-2">
            {activeList.items.map((item, index) => (
              <TodoItemRow
                key={item.id}
                item={item}
                index={index}
                totalItems={activeList.items.length}
                onToggle={(id, done) => toggleItemMutation.mutate({ id, done })}
                onEdit={(id, text) => editItemMutation.mutate({ id, input: { text } })}
                onDelete={handleDeleteItem}
                onMoveUp={index > 0 ? () => handleMove(index, index - 1) : undefined}
                onMoveDown={
                  index < activeList.items.length - 1
                    ? () => handleMove(index, index + 1)
                    : undefined
                }
              />
            ))}
          </ul>

          {/* Add a task row */}
          <div className="flex items-center gap-2 rounded-xl border border-dashed bg-card/60 px-3 py-2 focus-within:ring-2 focus-within:ring-ring focus-within:border-primary">
            <Plus className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
            <input
              ref={newTaskInputRef}
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyDown={handleAddTaskKeyDown}
              aria-label="Add a task"
              placeholder="Add a task… (e.g. Read Chapter 4 tomorrow, press Enter)"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Previous lists dialog */}
      <PreviousListsDialog
        open={previousListsOpen}
        onOpenChange={setPreviousListsOpen}
        activeListId={activeList?.id}
      />

      {/* Delete List confirmation dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete to-do list?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this list and all of its tasks permanently. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteList}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete list
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
