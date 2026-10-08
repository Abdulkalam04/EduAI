import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, Reorder } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Mic2,
  Presentation,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GradientButton, MobileStickyAction, PageHeader, SoftCard } from "@/components/ui-custom";
import { Mermaid } from "@/components/tutor/Markdown";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { exportPptx, generatePpt } from "@/lib/api";
import type { DeckSlide, GeneratedDeck, PptTheme } from "@/lib/types";
import { useCreativeStore } from "@/store/useCreativeStore";
import { LEVELS, useUserStore, type LevelId } from "@/store/useUserStore";
import { pageHead } from "@/components/ComingSoonPage";

export const Route = createFileRoute("/ppt")({
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    doc?: string | undefined;
    topic?: string | undefined;
    slides?: number | undefined;
    notes?: boolean | undefined;
  } => ({
    doc: typeof s["doc"] === "string" ? s["doc"] : undefined,
    topic: typeof s["topic"] === "string" ? s["topic"] : undefined,
    slides: s["slides"] && Number.isFinite(Number(s["slides"])) ? Number(s["slides"]) : undefined,
    notes:
      s["notes"] === true || s["notes"] === "true"
        ? true
        : s["notes"] === false || s["notes"] === "false"
          ? false
          : undefined,
  }),
  head: pageHead(
    "PPT Maker",
    "Create, edit, and download presentations tailored to your learning level.",
  ),
  component: PptMaker,
});

const THEMES: { id: PptTheme; colors: string[]; description: string }[] = [
  { id: "Indigo Modern", colors: ["#3730A3", "#6366F1", "#E0E7FF"], description: "Indigo" },
  { id: "Clean White", colors: ["#FFFFFF", "#E5E7EB", "#111827"], description: "White" },
  { id: "Dark Elegant", colors: ["#111827", "#374151", "#A78BFA"], description: "Dark" },
  { id: "Playful", colors: ["#F97316", "#FDE68A", "#0F766E"], description: "Playful" },
];
const STEPS = [
  { title: "Research", icon: FileText },
  { title: "Outline", icon: ArrowDown },
  { title: "Content", icon: Mic2 },
  { title: "Diagrams", icon: Presentation },
  { title: "Build", icon: Check },
];
const themeColors: Record<
  PptTheme,
  { background: string; foreground: string; accent: string; secondary: string }
> = {
  "Indigo Modern": {
    background: "linear-gradient(135deg, #312e81, #6366f1)",
    foreground: "#ffffff",
    accent: "#a5b4fc",
    secondary: "#eef2ff",
  },
  "Clean White": {
    background: "#ffffff",
    foreground: "#172033",
    accent: "#4f46e5",
    secondary: "#f1f5f9",
  },
  "Dark Elegant": {
    background: "#111827",
    foreground: "#f9fafb",
    accent: "#a78bfa",
    secondary: "#1f2937",
  },
  Playful: {
    background: "linear-gradient(135deg, #fff7ed, #fef3c7)",
    foreground: "#153b39",
    accent: "#ea580c",
    secondary: "#ffedd5",
  },
};

function PptMaker() {
  const search = Route.useSearch();
  const userLevel = useUserStore((state) => state.level);
  const { decks, addDeck, updateDeck, removeDeck } = useCreativeStore();
  const [topic, setTopic] = useState(search.topic ?? search.doc ?? "");
  const [level, setLevel] = useState<LevelId>(userLevel);
  const [slideCount, setSlideCount] = useState(Math.min(20, Math.max(5, search.slides ?? 10)));
  const [theme, setTheme] = useState<PptTheme>("Indigo Modern");
  const [speakerNotes, setSpeakerNotes] = useState(search.notes ?? true);
  const [includeDiagrams, setIncludeDiagrams] = useState(true);
  const [includeQuiz, setIncludeQuiz] = useState(false);
  const [extra, setExtra] = useState("");
  const [deck, setDeck] = useState<GeneratedDeck | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState("");
  const [presentation, setPresentation] = useState(false);
  const [mobileEditor, setMobileEditor] = useState(false);
  const [savingSlide, setSavingSlide] = useState(false);
  const [deleteDeckId, setDeleteDeckId] = useState<string | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const levelChosen = useRef(false);
  const slides = deck?.slides ?? [];
  const selectedIndex = Math.max(
    0,
    slides.findIndex((slide) => slide.id === selectedId),
  );
  const selected = slides[selectedIndex];
  const colors = themeColors[deck?.theme ?? theme];

  useEffect(() => {
    if (!levelChosen.current && !deck) setLevel(userLevel);
  }, [userLevel, deck]);

  const selectDeck = (value: GeneratedDeck) => {
    setDeck(value);
    setSelectedId(value.slides[0]?.id ?? "");
    setTopic(value.topic);
    setSlideCount(value.slides.length);
    setTheme(value.theme);
    setLevel(value.level);
  };

  const generate = async () => {
    if (!topic.trim()) {
      toast.error("Enter a topic for your presentation.");
      return;
    }
    setBusy(true);
    setError("");
    setStep(0);
    try {
      const created = await generatePpt(
        {
          topic: topic.trim(),
          level,
          slides: slideCount,
          theme,
          speakerNotes,
          includeDiagrams,
          includeQuiz,
          extra,
        },
        setStep,
      );
      addDeck(created);
      selectDeck(created);
      setStep(5);
      toast.success("Your presentation is ready");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Couldn't create this presentation.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const persistSlides = useCallback(
    (nextSlides: DeckSlide[]) => {
      if (!deck) return;
      const updated = { ...deck, slides: nextSlides };
      setDeck(updated);
      updateDeck(updated);
      setSelectedId((id) =>
        nextSlides.some((slide) => slide.id === id) ? id : (nextSlides[0]?.id ?? ""),
      );
    },
    [deck, updateDeck],
  );

  const editSelected = useCallback(
    (patch: Partial<DeckSlide>) => {
      if (!selected || !deck) return;
      persistSlides(
        deck.slides.map((slide) => (slide.id === selected.id ? { ...slide, ...patch } : slide)),
      );
    },
    [deck, persistSlides, selected],
  );

  const moveSlide = useCallback(
    (direction: -1 | 1) => {
      const next = deck?.slides[selectedIndex + direction];
      if (next) setSelectedId(next.id);
    },
    [deck, selectedIndex],
  );

  const regenerate = async () => {
    if (!deck || !selected) return;
    setSavingSlide(true);
    try {
      const refreshed = await generatePpt({
        topic: `${deck.topic}: ${selected.title}`,
        level: deck.level,
        slides: 5,
        theme: deck.theme,
        speakerNotes: deck.speakerNotes,
        includeDiagrams: true,
        includeQuiz: selected.kind === "quiz",
        extra: "Regenerate this slide only",
      });
      const replacement =
        refreshed.slides.find((slide) => slide.kind === "content") ?? refreshed.slides[0];
      if (replacement)
        editSelected({
          title: replacement.title,
          bullets: replacement.bullets,
          notes: replacement.notes,
          diagram: replacement.diagram,
        });
      toast.success("Slide regenerated");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Couldn't regenerate this slide.");
    } finally {
      setSavingSlide(false);
    }
  };

  const downloadPptx = async () => {
    if (!deck || !slides.length) return;
    try {
      const fileName = `${deck.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "presentation"}.pptx`;
      const blob = await exportPptx({
        topic: deck.topic,
        theme: deck.theme,
        slides,
        speakerNotes: deck.speakerNotes,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("PowerPoint downloaded");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Couldn't export this presentation.");
    }
  };

  const copyOutline = async () => {
    if (!deck) return;
    const outline = slides
      .map(
        (slide, index) =>
          `${index + 1}. ${slide.title}\n${slide.bullets.map((bullet) => `   • ${bullet}`).join("\n")}${deck.speakerNotes ? `\n   Speaker notes: ${slide.notes}` : ""}`,
      )
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(outline);
      toast.success("Presentation outline copied");
    } catch {
      toast.error("Clipboard access is not available.");
    }
  };

  useEffect(() => {
    if (!presentation) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPresentation(false);
      if (event.key === "ArrowRight" || event.key === "ArrowDown") moveSlide(1);
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") moveSlide(-1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [presentation, selectedIndex, deck, moveSlide]);

  useEffect(() => {
    if (presentation) mainRef.current?.focus();
  }, [presentation]);

  const slideOrder = slides;
  const Editor =
    selected && deck ? (
      <div className="space-y-4">
        <label className="block space-y-1 text-sm font-medium">
          Slide title
          <Input
            value={selected.title}
            onChange={(event) => editSelected({ title: event.target.value })}
            aria-label="Slide title"
          />
        </label>
        <div className="space-y-2">
          <p className="text-sm font-medium">Bullets</p>
          {selected.bullets.map((bullet, index) => (
            <div key={`${selected.id}-bullet-${index}`} className="flex gap-2">
              <Input
                value={bullet}
                aria-label={`Bullet ${index + 1}`}
                onChange={(event) => {
                  const updated = [...selected.bullets];
                  updated[index] = event.target.value;
                  editSelected({ bullets: updated });
                }}
              />
              <button
                aria-label={`Remove bullet ${index + 1}`}
                onClick={() =>
                  editSelected({ bullets: selected.bullets.filter((_, i) => i !== index) })
                }
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {selected.bullets.length < 5 && (
            <button
              onClick={() => editSelected({ bullets: [...selected.bullets, "New idea"] })}
              className="text-sm font-medium text-primary hover:underline"
            >
              + Add bullet
            </button>
          )}
        </div>
        <label className="block space-y-1 text-sm font-medium">
          Speaker notes
          <Textarea
            rows={5}
            value={selected.notes}
            onChange={(event) => editSelected({ notes: event.target.value })}
            aria-label="Speaker notes"
          />
        </label>
        <GradientButton
          className="w-full"
          variant="secondary"
          onClick={() => void regenerate()}
          disabled={savingSlide}
        >
          {savingSlide ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Regenerate this slide
        </GradientButton>
        <div className="flex gap-2">
          <GradientButton
            variant="ghost"
            className="flex-1"
            onClick={() => moveSlide(-1)}
            disabled={selectedIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </GradientButton>
          <GradientButton
            variant="ghost"
            className="flex-1"
            onClick={() => moveSlide(1)}
            disabled={selectedIndex >= slides.length - 1}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </GradientButton>
        </div>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">Select a slide to edit its content.</p>
    );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 md:px-8">
      <PageHeader
        title="PPT Maker"
        icon={Presentation}
        accent="ppt"
        description="Create a polished, editable presentation for your next lesson or project."
      />
      {step >= 0 && <GenerationProgress step={step} busy={busy} />}
      <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <SoftCard className="space-y-4 p-4 sm:p-5">
          <h2 className="font-semibold">Create a presentation</h2>
          <label className="block space-y-1.5 text-sm font-medium" htmlFor="ppt-topic">
            Topic
          </label>
          <Input
            id="ppt-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Artificial Intelligence"
            className="h-12 text-base"
          />
          <label className="block space-y-1.5 text-sm font-medium">
            Learning level
            <Select
              value={level}
              onValueChange={(value) => {
                levelChosen.current = true;
                setLevel(value as LevelId);
              }}
            >
              <SelectTrigger aria-label="Learning level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Number of slides</span>
              <span className="rounded-lg bg-muted px-2 py-0.5 tabular-nums">{slideCount}</span>
            </div>
            <Slider
              min={5}
              max={20}
              step={1}
              value={[slideCount]}
              onValueChange={(value) => setSlideCount(value[0] ?? 10)}
              aria-label="Number of slides"
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Theme</legend>
            <div className="grid grid-cols-4 gap-2">
              {THEMES.map((item) => (
                <button
                  key={item.id}
                  title={item.id}
                  aria-label={`${item.id} theme`}
                  aria-pressed={theme === item.id}
                  onClick={() => setTheme(item.id)}
                  className={cn(
                    "overflow-hidden rounded-xl border p-1.5 text-left transition-all",
                    theme === item.id
                      ? "border-primary ring-2 ring-primary/20"
                      : "hover:border-primary/50",
                  )}
                >
                  <span className="mb-1 flex h-8 overflow-hidden rounded-md">
                    {item.colors.map((color) => (
                      <span key={color} className="h-full flex-1" style={{ background: color }} />
                    ))}
                  </span>
                  <span className="block truncate text-xs font-medium">{item.description}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            {(
              [
                [speakerNotes, setSpeakerNotes, "Speaker notes"],
                [includeDiagrams, setIncludeDiagrams, "Include diagrams"],
                [includeQuiz, setIncludeQuiz, "Include a quiz slide"],
              ] as const
            ).map(([value, setter, label]) => (
              <label
                key={label}
                className="flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm"
              >
                <span>{label}</span>
                <Switch checked={value} onCheckedChange={setter} />
              </label>
            ))}
          </div>
          <label className="block space-y-1.5 text-sm font-medium">
            Extra instructions{" "}
            <Textarea
              rows={3}
              value={extra}
              onChange={(event) => setExtra(event.target.value)}
              placeholder="Anything else to include?"
            />
          </label>
          <GradientButton
            size="lg"
            className="hidden w-full md:inline-flex"
            onClick={() => void generate()}
            disabled={busy || !topic.trim()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Create PPT
          </GradientButton>
          <MobileStickyAction>
            <GradientButton
              size="lg"
              className="w-full"
              onClick={() => void generate()}
              disabled={busy || !topic.trim()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Create PPT
            </GradientButton>
          </MobileStickyAction>
          {error && (
            <div role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              <p>{error}</p>
              <button
                onClick={() => void generate()}
                className="mt-2 inline-flex items-center gap-1 font-semibold underline"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          )}
          <div className="border-t pt-3">
            <h3 className="mb-2 text-sm font-semibold">Recent decks</h3>
            {decks.length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                Your generated decks will be saved here.
              </p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {" "}
                {decks.map((item) => (
                  <li
                    key={item.id}
                    className="group flex items-center gap-2 rounded-lg p-2 hover:bg-muted"
                  >
                    <button
                      onClick={() => selectDeck(item)}
                      className="min-w-0 flex-1 truncate text-left text-sm"
                    >
                      {item.topic}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {item.slides.length} slides
                      </span>
                    </button>
                    <button
                      aria-label={`Delete ${item.topic}`}
                      onClick={() => setDeleteDeckId(item.id)}
                      className="min-h-11 min-w-11 rounded-md p-2 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SoftCard>

        {!deck || !selected ? (
          <div className="flex min-h-[500px] items-center justify-center rounded-2xl border border-dashed p-6 text-center">
            <div className="max-w-sm">
              <Presentation className="mx-auto h-10 w-10 text-muted-foreground/60" />
              <h2 className="mt-3 font-semibold">
                {busy ? "Building your slides…" : "Your slide studio is ready"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a topic and create a deck. Generated presentations are saved in Recent decks.
              </p>
              {busy && (
                <div className="mt-5 space-y-3">
                  {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="h-4 animate-pulse rounded bg-muted" />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">
                  {deck.topic}{" "}
                  <span className="font-normal text-muted-foreground">
                    · Slide {selectedIndex + 1} of {slides.length}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <GradientButton size="sm" variant="secondary" onClick={() => void copyOutline()}>
                    <FileText className="h-4 w-4" />
                    Copy outline
                  </GradientButton>
                  <GradientButton size="sm" onClick={() => void downloadPptx()}>
                    <Download className="h-4 w-4" />
                    Download .pptx
                  </GradientButton>
                  <GradientButton
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDeck(null);
                      setStep(-1);
                      setError("");
                    }}
                  >
                    <Sparkles className="h-4 w-4" />
                    Create another
                  </GradientButton>
                </div>
              </div>
              <div
                ref={mainRef}
                tabIndex={0}
                aria-label="Selected presentation slide. Use arrow keys to navigate."
                className="relative aspect-video w-full overflow-hidden rounded-2xl border p-6 shadow-lift outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-10"
                style={{
                  background: selected.kind === "title" ? colors.background : colors.secondary,
                  color: colors.foreground,
                  touchAction: "pan-y",
                }}
                onTouchStart={(event) => {
                  touchStartX.current = event.changedTouches[0]?.clientX ?? null;
                }}
                onTouchEnd={(event) => {
                  const startX = touchStartX.current;
                  const endX = event.changedTouches[0]?.clientX;
                  touchStartX.current = null;
                  if (startX !== null && endX !== undefined && Math.abs(endX - startX) > 40) {
                    moveSlide(endX < startX ? 1 : -1);
                  }
                }}
                onTouchCancel={() => {
                  touchStartX.current = null;
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                    event.preventDefault();
                    moveSlide(1);
                  }
                  if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                    event.preventDefault();
                    moveSlide(-1);
                  }
                  if (event.key === "Enter" && event.altKey) setPresentation(true);
                }}
              >
                <SlideCanvas
                  slide={selected}
                  index={selectedIndex}
                  total={slides.length}
                  colors={colors}
                />
                <button
                  aria-label="Present fullscreen"
                  onClick={() => setPresentation(true)}
                  className="absolute right-3 top-3 rounded-lg bg-background/80 p-2 text-foreground shadow-soft hover:bg-background"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  aria-label="Previous slide"
                  disabled={selectedIndex === 0}
                  onClick={() => moveSlide(-1)}
                  className="rounded-lg border p-2 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <Reorder.Group
                  axis="x"
                  values={slideOrder}
                  onReorder={(reordered) => persistSlides(reordered)}
                  className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1"
                >
                  {slideOrder.map((slide, index) => (
                    <Reorder.Item
                      key={slide.id}
                      value={slide}
                      className={cn(
                        "w-32 shrink-0 cursor-grab rounded-xl border p-1.5 text-left active:cursor-grabbing",
                        selected.id === slide.id
                          ? "border-primary ring-2 ring-primary/20"
                          : "hover:bg-muted",
                      )}
                    >
                      <button onClick={() => setSelectedId(slide.id)} className="w-full text-left">
                        <span className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted px-2 text-center text-xs font-semibold leading-tight">
                          {slide.title}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {index + 1}. {slide.title}
                        </span>
                      </button>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
                <button
                  aria-label="Next slide"
                  disabled={selectedIndex >= slides.length - 1}
                  onClick={() => moveSlide(1)}
                  className="rounded-lg border p-2 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <GradientButton
                className="w-full lg:hidden"
                variant="secondary"
                onClick={() => setMobileEditor(true)}
              >
                Edit selected slide
              </GradientButton>
            </div>
            <SoftCard className="hidden p-4 lg:block">
              <h2 className="mb-4 font-semibold">Slide editor</h2>
              {Editor}
            </SoftCard>
          </div>
        )}
      </div>
      <Sheet open={mobileEditor} onOpenChange={setMobileEditor}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Edit slide {selectedIndex + 1}</SheetTitle>
          </SheetHeader>
          <div className="py-4">{Editor}</div>
        </SheetContent>
      </Sheet>
      {presentation && selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Presentation mode"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black p-3 sm:p-8"
        >
          <div
            className="relative aspect-video w-full max-w-7xl overflow-hidden rounded-xl p-8 shadow-lift sm:p-16"
            style={{
              background: selected.kind === "title" ? colors.background : colors.secondary,
              color: colors.foreground,
            }}
          >
            <SlideCanvas
              slide={selected}
              index={selectedIndex}
              total={slides.length}
              colors={colors}
            />
            <button
              aria-label="Exit presentation"
              onClick={() => setPresentation(false)}
              className="absolute right-3 top-3 rounded-lg bg-background/80 p-2"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="absolute bottom-3 right-3 flex gap-2">
              <button
                aria-label="Previous slide"
                disabled={selectedIndex === 0}
                onClick={() => moveSlide(-1)}
                className="rounded-lg bg-background/80 p-2 disabled:opacity-40"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button
                aria-label="Next slide"
                disabled={selectedIndex >= slides.length - 1}
                onClick={() => moveSlide(1)}
                className="rounded-lg bg-background/80 p-2 disabled:opacity-40"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}
      <AlertDialog open={!!deleteDeckId} onOpenChange={(open) => !open && setDeleteDeckId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this presentation?</AlertDialogTitle>
            <AlertDialogDescription>
              This deck will be removed from your saved recent decks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteDeckId) removeDeck(deleteDeckId);
                if (deck?.id === deleteDeckId) setDeck(null);
                setDeleteDeckId(null);
                toast.success("Presentation removed");
              }}
            >
              Delete deck
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function GenerationProgress({ step, busy }: { step: number; busy: boolean }) {
  return (
    <SoftCard className="space-y-4 p-4 sm:p-5" aria-live="polite">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Building your presentation</p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {Math.min(step, 5) * 20}%
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Presentation generation progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(step, 5) * 20}
      >
        <motion.div
          className="h-full rounded-full bg-gradient-primary"
          animate={{ width: `${Math.min(step, 5) * 20}%` }}
        />
      </div>
      <ol className="grid gap-3 sm:grid-cols-5">
        {STEPS.map(({ title, icon: Icon }, index) => (
          <li
            key={title}
            className={cn(
              "flex items-center gap-2 text-xs",
              index < step
                ? "text-success"
                : index === step && busy
                  ? "font-semibold text-primary"
                  : "text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{title}</span>
            {index < step ? (
              <Check className="h-3.5 w-3.5 shrink-0" />
            ) : index === step && busy ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Circle className="h-3 w-3 shrink-0" />
            )}
          </li>
        ))}
      </ol>
    </SoftCard>
  );
}

function SlideCanvas({
  slide,
  index,
  total,
  colors,
}: {
  slide: DeckSlide;
  index: number;
  total: number;
  colors: { foreground: string; accent: string; secondary: string };
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col justify-center",
        slide.kind === "title" && "items-center text-center",
      )}
    >
      {slide.kind !== "title" && (
        <div className="mb-[2%] h-1 w-12 rounded-full" style={{ background: colors.accent }} />
      )}
      <h2
        className={cn(
          "max-w-full text-pretty font-display font-bold leading-tight",
          slide.kind === "title"
            ? "text-[clamp(1.5rem,4vw,3.5rem)]"
            : "text-[clamp(1.1rem,2.8vw,2.5rem)]",
        )}
        style={{ color: colors.foreground }}
      >
        {slide.title}
      </h2>
      <ul
        className={cn("mt-[3%] max-w-full space-y-[1.2%]", slide.kind === "title" && "text-center")}
      >
        {slide.bullets.slice(0, 5).map((bullet, bulletIndex) => (
          <li
            key={bulletIndex}
            className="flex items-start gap-3 text-[clamp(0.75rem,1.5vw,1.2rem)] leading-snug"
            style={{ color: colors.foreground }}
          >
            <span
              className="mt-2 h-2 w-2 shrink-0 rounded-full"
              style={{ background: colors.accent }}
            />
            {bullet}
          </li>
        ))}
      </ul>
      {slide.diagram && (
        <div className="mt-3 max-h-[42%] overflow-hidden rounded-xl bg-white/80 p-2">
          <Mermaid code={slide.diagram} className="my-0 [&_svg]:max-h-36" />
        </div>
      )}
      <p className="absolute bottom-[3%] right-[4%] text-[clamp(0.75rem,0.8vw,0.875rem)] opacity-60">
        {index + 1} / {total}
      </p>
    </div>
  );
}
