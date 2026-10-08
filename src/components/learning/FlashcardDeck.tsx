import { useEffect, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight, RotateCcw, Shuffle, ThumbsUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GradientButton, ProgressBar, ProgressRing, SoftCard } from "@/components/ui-custom";
import { Markdown } from "@/components/tutor/Markdown";
import type { Flashcard } from "@/lib/types";

export function FlashcardDeck({ cards }: { cards: Flashcard[] }) {
  const [deck, setDeck] = useState(cards);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [marks, setMarks] = useState<Record<number, "got" | "learning">>({});
  const [exit, setExit] = useState<"got" | "learning" | null>(null);
  const done = i >= deck.length;

  const go = (d: number) => {
    setFlipped(false);
    setI((v) => Math.min(Math.max(0, v + d), deck.length - 1));
  };
  const mark = (m: "got" | "learning") => {
    if (done) return;
    setExit(m);
    setMarks((s) => ({ ...s, [i]: m }));
    setFlipped(false);
    setTimeout(() => {
      setI((v) => v + 1);
      setExit(null);
    }, 10);
  };
  const reset = (d: Flashcard[]) => {
    setDeck(d);
    setI(0);
    setMarks({});
    setFlipped(false);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,button")) return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const known = Object.values(marks).filter((m) => m === "got").length;

  if (done) {
    const missed = deck.filter((_, k) => marks[k] !== "got");
    return (
      <SoftCard
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-3 p-8 text-center"
      >
        <ProgressRing
          value={Math.round((known / deck.length) * 100)}
          size={120}
          stroke={10}
          label={
            <span className="text-xl font-semibold">
              {known}/{deck.length}
            </span>
          }
        />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-success">{known} known</span> ·{" "}
          <span className="font-medium text-destructive">{deck.length - known} still learning</span>
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {missed.length > 0 && (
            <GradientButton onClick={() => reset(missed)}>
              <RotateCcw className="h-4 w-4" />
              Review missed cards
            </GradientButton>
          )}
          <GradientButton variant="secondary" onClick={() => reset(cards)}>
            Restart deck
          </GradientButton>
        </div>
      </SoftCard>
    );
  }

  const card = deck[i]!;
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 100) mark("got");
    else if (info.offset.x < -100) mark("learning");
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {i + 1} / {deck.length}
        </span>
        <ProgressBar value={(i / deck.length) * 100} className="flex-1" />
        <button
          aria-label="Shuffle"
          onClick={() => reset([...deck].sort(() => Math.random() - 0.5))}
          className="rounded-lg p-1.5 hover:bg-muted"
        >
          <Shuffle className="h-4 w-4" />
        </button>
      </div>
      <div className="relative h-64 [perspective:1200px]">
        <AnimatePresence initial={false}>
          <motion.div
            key={`${i}-${card.front}`}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={onDragEnd}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{
              opacity: 0,
              x: exit === "got" ? 300 : -300,
              rotate: exit === "got" ? 12 : -12,
              transition: { duration: 0.3 },
            }}
            className="absolute inset-0 cursor-pointer touch-pan-y"
            onClick={() => setFlipped((f) => !f)}
            role="button"
            tabIndex={0}
            aria-label="Flip card"
          >
            <div
              className={cn(
                "relative h-full w-full transition-transform duration-300 [transform-style:preserve-3d]",
                flipped && "[transform:rotateY(180deg)]",
              )}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border bg-card p-6 text-center shadow-lift [backface-visibility:hidden]">
                <span className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Term
                </span>
                <p className="text-xl font-semibold">{card.front}</p>
                <span className="mt-4 text-xs text-muted-foreground">
                  Click or press Space to flip
                </span>
              </div>
              <div
                className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border p-6 text-center shadow-lift [backface-visibility:hidden] [transform:rotateY(180deg)]"
                style={{ background: "var(--book-soft)" }}
              >
                <span className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Answer
                </span>
                <div className="text-lg">
                  <Markdown content={card.back} />
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          aria-label="Previous"
          onClick={() => go(-1)}
          className="rounded-xl border p-2.5 hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => mark("learning")}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 text-sm font-medium text-destructive hover:bg-destructive/15"
          >
            <X className="h-4 w-4" />
            Still learning
          </button>
          <button
            onClick={() => mark("got")}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 text-sm font-medium text-success hover:bg-success/15"
          >
            <ThumbsUp className="h-4 w-4" />
            Got it
          </button>
        </div>
        <button
          aria-label="Next"
          onClick={() => go(1)}
          className="rounded-xl border p-2.5 hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
