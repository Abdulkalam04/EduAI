/**
 * ModelPicker - lets the user choose which AI model answers their questions.
 *
 * Desktop: wide Popover + a curated list (no search).
 * Mobile (< md): Sheet (bottom drawer).
 *
 * The component fetches GET /api/chat/models, which is cached 60 s server-side.
 * If the list fails to load, Auto still works and the picker shows an error + retry.
 * If the persisted model disappears from the catalogue, it falls back to "auto"
 * and shows a toast.
 *
 * Models with `hidden: true` are alias duplicates - they are valid for routing
 * but suppressed from the picker UI to avoid showing the same model twice.
 * The backend returns only free, healthy allowlisted models.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, ChevronDown, RefreshCw, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getChatModels } from "@/lib/api";
import type { ChatModel, ModelHealth } from "@/lib/types";
import { useUiStore } from "@/store/useUiStore";
import { cn } from "@/lib/utils";
import { formatTtft } from "./model-picker-utils";

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

function healthColor(h: ModelHealth) {
  switch (h) {
    case "healthy":
      return "bg-green-500";
    case "slow":
      return "bg-amber-400";
    case "cooling_down":
      return "bg-orange-500";
    default:
      return "bg-muted-foreground";
  }
}

function healthLabel(h: ModelHealth) {
  switch (h) {
    case "healthy":
      return "Healthy";
    case "slow":
      return "Slow";
    case "cooling_down":
      return "Cooling down";
    default:
      return "Unknown";
  }
}

function HealthDot({ health }: { health: ModelHealth }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-block h-2 w-2 shrink-0 rounded-full",
              healthColor(health),
              health === "healthy" && "animate-pulse",
            )}
            aria-label={healthLabel(health)}
          />
        </TooltipTrigger>
        <TooltipContent>{healthLabel(health)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const AUTO_LABEL = "Auto";

function ModelRow({
  model,
  selected,
  onSelect,
}: {
  model: ChatModel;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-testid={`model-row-${model.id}`}
      onClick={() => onSelect(model.id)}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2 rounded-lg border border-transparent px-2 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected && "border-primary/40 bg-primary/10",
      )}
    >
      <HealthDot health={model.health} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block whitespace-normal break-words font-medium">{model.label}</span>
        <span className="mt-0.5 block whitespace-normal text-xs text-muted-foreground">
          {model.description}
        </span>
      </span>
      <span className="flex max-w-[112px] shrink-0 flex-wrap justify-end gap-1">
        {model.capabilities.thinking && (
          <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:text-purple-400">
            Thinking
          </span>
        )}
        {!model.capabilities.thinking &&
        model.median_ttft_ms !== null &&
        model.median_ttft_ms >= 0 &&
        model.median_ttft_ms < 2500 ? (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            Fast
          </span>
        ) : null}
        {model.smart && !model.capabilities.thinking && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Smart
          </span>
        )}
        {model.vision_verified && (
          <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">
            Vision
          </span>
        )}
        {formatTtft(model.median_ttft_ms) && (
          <span className="w-full text-right text-[10px] text-muted-foreground">
            {formatTtft(model.median_ttft_ms)}
          </span>
        )}
      </span>
      {selected && <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}

export function ModelPicker({ resolvedLabel }: { resolvedLabel?: string }) {
  const preferredChatModel = useUiStore((s) => s.preferredChatModel);
  const setPreferredChatModel = useUiStore((s) => s.setPreferredChatModel);
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ChatModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const fetchedOnce = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getChatModels();
      const list = res.models
        .filter(
          (m) =>
            m.id !== "auto" &&
            !m.hidden &&
            m.tier === "free" &&
            (m.health === "healthy" || m.health === "slow"),
        )
        .slice(0, 5);
      setModels(list);
      if (preferredChatModel !== "auto" && !list.find((m) => m.id === preferredChatModel)) {
        setPreferredChatModel("auto");
        toast("Model no longer available — switched to Auto", { duration: 4000 });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }, [preferredChatModel, setPreferredChatModel]);

  useEffect(() => {
    if (open && !fetchedOnce.current) {
      fetchedOnce.current = true;
      void load();
    }
  }, [open, load]);

  const handleSelect = (id: string) => {
    setPreferredChatModel(id);
    setOpen(false);
  };

  let buttonLabel: string;
  if (preferredChatModel === "auto") {
    buttonLabel = resolvedLabel ? `Auto · ${resolvedLabel}` : "Auto";
  } else {
    const found = models?.find((m) => m.id === preferredChatModel);
    buttonLabel = found?.label ?? preferredChatModel;
  }

  const currentHealth: ModelHealth =
    preferredChatModel === "auto"
      ? "healthy"
      : (models?.find((m) => m.id === preferredChatModel)?.health ?? "unknown");

  const trigger = (
    <button
      type="button"
      aria-label={`AI model: ${buttonLabel}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      data-testid="model-picker-trigger"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground",
        open && "border-primary/50 bg-muted text-foreground",
      )}
    >
      <HealthDot health={currentHealth} />
      <Bot className="h-3 w-3" />
      <span className="max-w-[220px] whitespace-normal break-words text-left">{buttonLabel}</span>
      <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
    </button>
  );

  const visibleModels = models?.filter((m) => m.id !== "auto").slice(0, 5) ?? [];

  const pickerContent = (
    <div role="listbox" aria-label="Select AI model" className="w-full">
      <div className="flex justify-end border-b px-3 py-1.5">
        <button
          type="button"
          aria-label="Refresh model list"
          onClick={() => void load()}
          disabled={loading}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </button>
      </div>

      <div className="py-1">
        {loading && (
          <div className="space-y-2 p-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <WifiOff className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
            <p className="text-xs text-muted-foreground">Auto still works without the list</p>
          </div>
        )}
        {!loading && !error && (
          <div className="space-y-0.5 px-1">
            <button
              type="button"
              role="option"
              aria-selected={preferredChatModel === "auto"}
              data-testid="model-row-auto"
              onClick={() => handleSelect("auto")}
              className={cn(
                "flex w-full cursor-pointer items-start gap-2 rounded-lg border border-transparent px-2 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                preferredChatModel === "auto" && "border-primary/40 bg-primary/10",
              )}
            >
              <span
                className={cn(
                  "inline-block h-2 w-2 shrink-0 rounded-full bg-green-500",
                  "animate-pulse",
                )}
              />
              <span className="min-w-0 flex-1 text-left">
                <span className="block font-medium">{AUTO_LABEL}</span>
                <span className="mt-0.5 block whitespace-nowrap text-xs text-muted-foreground">
                  Picks the fastest healthy option
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-800 dark:text-green-400">
                  Recommended
                </span>
              </span>
              {preferredChatModel === "auto" && (
                <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              )}
            </button>

            {visibleModels.map((m) => (
              <ModelRow
                key={m.id}
                model={m}
                selected={m.id === preferredChatModel}
                onSelect={handleSelect}
              />
            ))}

            {visibleModels.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No other models available right now
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <div onClick={() => setOpen(true)}>{trigger}</div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]"
          >
            <SheetTitle className="mb-3 text-base font-semibold">Choose AI Model</SheetTitle>
            {pickerContent}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[400px] max-w-[calc(100vw-2rem)] p-0"
        sideOffset={6}
      >
        {pickerContent}
      </PopoverContent>
    </Popover>
  );
}
