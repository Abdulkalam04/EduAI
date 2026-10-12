import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { MoreVertical, Pencil, ArrowUp, ArrowDown, Trash2, Calendar } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TodoItem } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TodoItemRowProps {
  item: TodoItem;
  index: number;
  totalItems: number;
  onToggle: (id: string, done: boolean) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (item: TodoItem) => void;
  onMoveUp?: (() => void) | undefined;
  onMoveDown?: (() => void) | undefined;
}

export function formatDueDateChip(
  dueDate: string,
  today: Date = new Date(),
): { label: string; isOverdue: boolean } {
  const [y, m, d] = dueDate.split("-").map(Number);
  if (!y || !m || !d) return { label: dueDate, isOverdue: false };
  const target = new Date(y, m - 1, d);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      label: diffDays === -1 ? "Overdue (Yesterday)" : `Overdue (${Math.abs(diffDays)}d)`,
      isOverdue: true,
    };
  }
  if (diffDays === 0) return { label: "Today", isOverdue: false };
  if (diffDays === 1) return { label: "Tomorrow", isOverdue: false };
  if (diffDays < 7) {
    return {
      label: target.toLocaleDateString(undefined, { weekday: "short" }),
      isOverdue: false,
    };
  }
  return {
    label: target.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    isOverdue: false,
  };
}

export function TodoItemRow({
  item,
  index,
  totalItems,
  onToggle,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: TodoItemRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditText(item.text);
  }, [item.text]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = editText.trim();
    if (!trimmed) {
      // Empty text asks/triggers deletion
      onDelete(item);
      setIsEditing(false);
      return;
    }
    if (trimmed !== item.text) {
      onEdit(item.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditText(item.text);
      setIsEditing(false);
    }
  };

  const chip = item.due_date ? formatDueDateChip(item.due_date) : null;

  return (
    <li
      className={cn(
        "group flex min-h-[52px] items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 transition-all duration-150 hover:bg-muted/30 focus-within:ring-2 focus-within:ring-ring",
        item.done && "bg-muted/20 border-border/60 text-muted-foreground",
      )}
    >
      {/* Checkbox touch target container (>= 44x44px for touch) */}
      <div className="flex h-11 w-11 -ml-2 shrink-0 items-center justify-center">
        <Checkbox
          checked={item.done}
          onCheckedChange={(checked) => onToggle(item.id, Boolean(checked))}
          aria-label={`Mark "${item.text}" as ${item.done ? "not done" : "done"}`}
          className="h-5 w-5"
        />
      </div>

      {/* Item text / Inline edit input */}
      <div className="min-w-0 flex-1 py-1">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            aria-label="Edit task description"
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className={cn(
                "text-left text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xs",
                item.done && "line-through text-muted-foreground hover:text-muted-foreground",
              )}
            >
              {item.text}
            </button>

            {/* Optional due date chip */}
            {chip && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium tracking-tight",
                  chip.isOverdue
                    ? "bg-destructive/10 text-destructive border border-destructive/20 font-semibold"
                    : "bg-secondary text-secondary-foreground border border-border/40",
                  item.done && "opacity-60",
                )}
              >
                <Calendar className="h-2.5 w-2.5 shrink-0" />
                <span>{chip.label}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Menu button with minimum 44px touch target */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options for ${item.text}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => setIsEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            <span>Edit</span>
          </DropdownMenuItem>
          {onMoveUp && (
            <DropdownMenuItem disabled={index === 0} onClick={onMoveUp}>
              <ArrowUp className="mr-2 h-4 w-4" />
              <span>Move up</span>
            </DropdownMenuItem>
          )}
          {onMoveDown && (
            <DropdownMenuItem disabled={index === totalItems - 1} onClick={onMoveDown}>
              <ArrowDown className="mr-2 h-4 w-4" />
              <span>Move down</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete(item)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
