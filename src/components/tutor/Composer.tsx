import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Square,
  Paperclip,
  Mic,
  X,
  FileText,
  Image as ImageIcon,
  Check,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { LevelBadge } from "@/components/ui-custom";
import { LEVELS, useUserStore } from "@/store/useUserStore";
import type { AnswerStyle } from "@/lib/types";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const STYLES: { id: AnswerStyle; tip: string }[] = [
  { id: "Simple", tip: "Short, plain-language answer" },
  { id: "Exam Answer", tip: "Definition, Explanation, Example, Diagram, Conclusion" },
  { id: "Detailed", tip: "Long answer with deeper context and takeaways" },
];

type SR = {
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

export function Composer({
  streaming,
  onSend,
  onStop,
  style,
  setStyle,
  onFocusChange,
}: {
  streaming: boolean;
  onSend: (text: string, attachment?: { name: string; type: string }) => void;
  onStop: () => void;
  style: AnswerStyle;
  setStyle: (s: AnswerStyle) => void;
  onFocusChange?: (focused: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [listening, setListening] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const rec = useRef<SR | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { level, set } = useUserStore();

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SR;
      webkitSpeechRecognition?: new () => SR;
    };
    setSpeechOk(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const submit = () => {
    const t = text.trim();
    if (!t || streaming) return;
    onSend(t, file ? { name: file.name, type: file.type } : undefined);
    setText("");
    setFile(null);
  };

  const toggleMic = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SR;
      webkitSpeechRecognition?: new () => SR;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = false;
    r.interimResults = true;
    r.lang = "en-IN";
    const base = text;
    r.onresult = (e) =>
      setText(
        `${base}${base ? " " : ""}${Array.from(e.results)
          .map((x) => x[0]?.transcript ?? "")
          .join("")}`,
      );
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Answer style"
          className="inline-flex rounded-xl bg-muted p-1"
        >
          {STYLES.map((s) => (
            <Tooltip key={s.id}>
              <TooltipTrigger asChild>
                <button
                  role="tab"
                  aria-selected={style === s.id}
                  onClick={() => setStyle(s.id)}
                  className={cn(
                    "relative rounded-lg px-2.5 py-1 text-xs font-medium transition-colors sm:text-sm",
                    style === s.id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {style === s.id && (
                    <motion.span
                      layoutId="seg-style"
                      className="absolute inset-0 rounded-lg bg-card shadow-soft"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative">{s.id}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{s.tip}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <Popover>
          <PopoverTrigger
            aria-label="Change level"
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LevelBadge level={level} className="cursor-pointer hover:bg-muted" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 rounded-xl p-1.5">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                onClick={() => set({ level: l.id })}
                className="flex w-full items-start gap-2 rounded-lg p-2 text-left text-sm hover:bg-muted"
              >
                <span className="flex-1">
                  <span className="block font-medium">{l.label}</span>
                  <span className="block text-xs text-muted-foreground">{l.style}</span>
                </span>
                {l.id === level && <Check className="mt-0.5 h-4 w-4 text-primary" />}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <div
        data-tutor-composer
        className="rounded-2xl border bg-card p-2 shadow-lift transition-colors focus-within:border-primary/60"
      >
        {file && (
          <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-lg bg-muted px-2.5 py-1 text-xs">
            {file.type.startsWith("image/") ? (
              <ImageIcon className="h-3.5 w-3.5" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            <span className="truncate">{file.name}</span>
            <button
              onClick={() => setFile(null)}
              aria-label="Remove attachment"
              className="rounded p-0.5 hover:bg-background"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <textarea
          ref={ta}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Ask anything…"
          aria-label="Message the AI Tutor"
          className="block max-h-[200px] w-full resize-none bg-transparent px-2 py-1.5 outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-1 flex items-center gap-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            aria-label="Attach image or PDF"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          {speechOk && (
            <button
              onClick={toggleMic}
              aria-label={listening ? "Stop dictation" : "Dictate"}
              className={cn(
                "rounded-lg p-2 hover:bg-muted",
                listening
                  ? "animate-pulse text-destructive"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Mic className="h-4 w-4" />
            </button>
          )}
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
            Shift + Enter for a new line
          </span>
          {streaming ? (
            <button
              onClick={onStop}
              aria-label="Stop generating (Esc)"
              className="ml-2 flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background transition-transform active:scale-[0.98]"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim()}
              aria-label="Send"
              className="ml-2 flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft transition-all active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
