import { lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { BookOpen, RotateCcw, ThumbsUp, ThumbsDown, AlertCircle, FileText } from "lucide-react";
import type { ChatMessage } from "@/store/useChatStore";
import { cn } from "@/lib/utils";
import { AsciiThinking } from "@/components/ui-custom/AsciiThinking";

const Markdown = lazy(() => import("./Markdown").then((module) => ({ default: module.Markdown })));
const CopyButton = lazy(() =>
  import("./Markdown").then((module) => ({ default: module.CopyButton })),
);

export const LEVEL_REPLIES = [
  { label: "Class 5", level: "c1-5" },
  { label: "Class 8", level: "c6-8" },
  { label: "Class 12", level: "c11-12" },
  { label: "Graduation", level: "grad" },
] as const;

const CHIPS = ["Explain simpler", "Give an example", "Quiz me on this"];

function Avatar() {
  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <BookOpen className="h-4 w-4" />
    </span>
  );
}

export function TypingDots() {
  return (
    <div className="flex gap-3">
      <Avatar />
      <AsciiThinking className="shrink-0" />
    </div>
  );
}

export function MessageView({
  m,
  isLast,
  busy,
  onRegenerate,
  onFeedback,
  onChip,
  onRetry,
  onPickLevel,
}: {
  m: ChatMessage;
  isLast: boolean;
  busy: boolean;
  onRegenerate: () => void;
  onFeedback: (f: "up" | "down") => void;
  onChip: (t: string) => void;
  onRetry: () => void;
  onPickLevel: (level: (typeof LEVEL_REPLIES)[number]["level"]) => void;
}) {
  if (m.role === "user")
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-end gap-1.5"
      >
        {m.attachment && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs text-muted-foreground">
            <FileText className="h-4 w-4" />
            {m.attachment.name}
          </span>
        )}
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground">
          {m.content}
        </div>
      </motion.div>
    );

  if (m.status === "error")
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex gap-3"
      >
        <Avatar />
        <div className="flex flex-1 flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="flex-1">{m.content || "Something went wrong."}</span>
          <button
            onClick={onRetry}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </motion.div>
    );

  const streaming = m.status === "streaming";
  const finished = !streaming;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex gap-3"
    >
      <Avatar />
      <div className="min-w-0 flex-1">
        <div className={cn(streaming && "streaming-cursor")}>
          <Suspense fallback={<p className="whitespace-pre-wrap">{m.content}</p>}>
            <Markdown content={m.content} streaming={streaming} />
          </Suspense>
        </div>
        {m.status === "stopped" && (
          <p className="mt-1 text-xs italic text-muted-foreground">Stopped generating.</p>
        )}

        {m.kind === "level-prompt" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {LEVEL_REPLIES.map((r) => (
              <button
                key={r.label}
                disabled={busy || !isLast}
                onClick={() => onPickLevel(r.level)}
                className="rounded-full border bg-card px-4 py-1.5 text-sm font-medium shadow-soft transition-all hover:bg-muted active:scale-[0.98] disabled:opacity-50"
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {finished && m.kind !== "level-prompt" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 space-y-2">
            <div className="flex items-center gap-0.5">
              <Suspense fallback={null}>
                <CopyButton text={m.content} />
              </Suspense>
              <button
                onClick={onRegenerate}
                disabled={busy}
                aria-label="Regenerate"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={() => onFeedback("up")}
                aria-label="Good answer"
                aria-pressed={m.feedback === "up"}
                className={cn(
                  "rounded-md p-1.5 hover:bg-muted",
                  m.feedback === "up"
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ThumbsUp className="h-4 w-4" />
              </button>
              <button
                onClick={() => onFeedback("down")}
                aria-label="Bad answer"
                aria-pressed={m.feedback === "down"}
                className={cn(
                  "rounded-md p-1.5 hover:bg-muted",
                  m.feedback === "down"
                    ? "text-destructive"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ThumbsDown className="h-4 w-4" />
              </button>
            </div>
            {isLast && (
              <div className="flex flex-wrap gap-2">
                {CHIPS.map((c) => (
                  <button
                    key={c}
                    onClick={() => onChip(c)}
                    disabled={busy}
                    className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-all hover:bg-accent-soft hover:text-foreground active:scale-[0.98] disabled:opacity-50"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
