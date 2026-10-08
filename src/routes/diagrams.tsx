import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Copy,
  Download,
  Expand,
  FileImage,
  GitBranch,
  Lightbulb,
  Loader2,
  Maximize2,
  Minus,
  Network,
  Plus,
  Save,
  Trash2,
  X,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GradientButton, PageHeader, SoftCard, StickyActionBar } from "@/components/ui-custom";
import { Markdown } from "@/components/tutor/Markdown";
import { renderMermaidSvg } from "@/lib/mermaid";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { generateDiagram, refineDiagram } from "@/lib/api";
import type { DiagramType, GeneratedDiagram } from "@/lib/types";
import { useCreativeStore } from "@/store/useCreativeStore";
import { getLevel, LEVELS, SUBJECTS, useUserStore, type LevelId } from "@/store/useUserStore";
import { resolvedTheme, useUiStore } from "@/store/useUiStore";
import { pageHead } from "@/components/ComingSoonPage";

export const Route = createFileRoute("/diagrams")({
  head: pageHead(
    "Diagram Maker",
    "Create and edit flowcharts, mind maps, and diagrams from any topic.",
  ),
  component: DiagramMaker,
});

type DiagramMode = "General" | "Flowchart Generator" | "Mind Map";
type ViewTab = "Preview" | "Code" | "Explanation";
const TYPES: DiagramType[] = [
  "Flowchart",
  "Mind Map",
  "Concept Map",
  "ER Diagram",
  "UML Class",
  "Sequence",
  "Process",
  "Network",
  "Block Diagram",
];

function DiagramMaker() {
  const level = useUserStore((state) => state.level);
  const levelSet = useUserStore((state) => state.levelSet);
  const profileSubject = useUserStore((state) => state.subject).trim() || "Maths";
  const knownSubject = SUBJECTS.find((item) => item === profileSubject);
  const defaultLevel: LevelId = "c9-10";
  const preferredLevel = levelSet ? getLevel(level).id : defaultLevel;
  const theme = useUiStore((state) => state.theme);
  const { diagrams, addDiagram, updateDiagram, removeDiagram } = useCreativeStore();
  const [mode, setMode] = useState<DiagramMode>("General");
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState<DiagramType>("Flowchart");
  const [subject, setSubject] = useState(knownSubject ?? "Other");
  const [otherSubject, setOtherSubject] = useState(knownSubject ? "" : profileSubject);
  const [selectedLevel, setSelectedLevel] = useState<LevelId>(preferredLevel);
  const [current, setCurrent] = useState<GeneratedDiagram | null>(null);
  const [tab, setTab] = useState<ViewTab>("Preview");
  const [code, setCode] = useState("");
  const [previewSvg, setPreviewSvg] = useState("");
  const [renderError, setRenderError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const levelChosen = useRef(false);
  const currentId = current?.id;
  const dark = resolvedTheme(theme) === "dark";
  const selectedSubject = subject === "Other" ? otherSubject.trim() || "Other" : subject || "Maths";

  useEffect(() => {
    if (!levelChosen.current && !current) setSelectedLevel(preferredLevel);
  }, [preferredLevel, current]);

  useEffect(() => {
    if (!currentId) return;
    const timer = window.setTimeout(() => {
      renderMermaidSvg(code, dark ? "dark" : "light", `diagram-preview-${currentId}-${Date.now()}`)
        .then((svg) => {
          setPreviewSvg(svg);
          setRenderError("");
        })
        .catch((error: unknown) => {
          setPreviewSvg("");
          setRenderError(
            error instanceof Error ? error.message : "Mermaid could not render this syntax.",
          );
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [code, currentId, dark]);

  const load = useCallback((diagram: GeneratedDiagram) => {
    setCurrent(diagram);
    setCode(diagram.code);
    setPrompt(diagram.prompt);
    setType(diagram.type);
    const diagramSubject = diagram.subject || "Maths";
    const knownDiagramSubject = SUBJECTS.find((item) => item === diagramSubject);
    if (knownDiagramSubject) {
      setSubject(knownDiagramSubject);
      setOtherSubject("");
    } else {
      setSubject("Other");
      setOtherSubject(diagramSubject);
    }
    setSelectedLevel(getLevel(diagram.level).id);
    setTab("Preview");
    setOffset({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const generate = async () => {
    if (!prompt.trim()) {
      toast.error("Describe the diagram you want to create.");
      return;
    }
    if (subject === "Other" && !otherSubject.trim()) {
      toast.error("Enter the subject you want to use.");
      return;
    }
    setLoading(true);
    try {
      const requested =
        mode === "Flowchart Generator" ? "Flowchart" : mode === "Mind Map" ? "Mind Map" : type;
      const result = await generateDiagram({
        prompt: prompt.trim(),
        type: requested,
        level: getLevel(selectedLevel).id,
        subject: selectedSubject,
        forceFlowchart: mode === "Flowchart Generator",
        forceMindMap: mode === "Mind Map",
      });
      addDiagram(result);
      load(result);
      setOptionsOpen(false);
      toast.success("Your diagram is ready");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't generate the diagram.");
    } finally {
      setLoading(false);
    }
  };

  const refine = async (request: string) => {
    if (!current) return;
    setRefining(true);
    try {
      const result = await refineDiagram(
        { ...current, code, subject: selectedSubject },
        request,
        getLevel(selectedLevel).id,
      );
      addDiagram(result);
      load(result);
      setInstruction("");
      toast.success("Diagram updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't refine the diagram.");
    } finally {
      setRefining(false);
    }
  };

  const save = () => {
    if (!current) return;
    const saved = {
      ...current,
      code,
      subject: selectedSubject,
      level: getLevel(selectedLevel).id,
      explanation: current.explanation,
    };
    updateDiagram(current.id, saved);
    setCurrent(saved);
    toast.success("Diagram saved");
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Mermaid code copied");
    } catch {
      toast.error("Clipboard access is not available.");
    }
  };

  const download = async (kind: "svg" | "png") => {
    if (!code.trim()) return;
    try {
      const svg = await renderMermaidSvg(
        code,
        dark ? "dark" : "light",
        `diagram-export-${Date.now()}`,
      );
      let blob: Blob;
      const extension = kind;
      if (kind === "svg") blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      else {
        const image = new Image();
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
        try {
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () =>
              reject(new Error("The rendered diagram could not be converted to PNG."));
            image.src = url;
          });
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth * 2;
          canvas.height = image.naturalHeight * 2;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("PNG export is not supported in this browser.");
          context.scale(2, 2);
          context.drawImage(image, 0, 0);
          blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (file) => (file ? resolve(file) : reject(new Error("PNG export failed."))),
              "image/png",
            ),
          );
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      const url = URL.createObjectURL(blob);
      const anchor = Object.assign(document.createElement("a"), {
        href: url,
        download: `${(current?.title ?? "diagram").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${extension}`,
      });
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`${kind.toUpperCase()} downloaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't export this diagram.");
    }
  };

  const copyImage = async () => {
    if (!previewSvg || !navigator.clipboard || !("ClipboardItem" in window)) {
      toast.error("Copying an image is not supported in this browser.");
      return;
    }
    try {
      const image = new Image();
      const url = URL.createObjectURL(
        new Blob([previewSvg], { type: "image/svg+xml;charset=utf-8" }),
      );
      try {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Image conversion failed."));
          image.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image clipboard is not supported.");
        context.drawImage(image, 0, 0);
        const png = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (file) => (file ? resolve(file) : reject(new Error("Image conversion failed."))),
            "image/png",
          ),
        );
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        toast.success("Diagram copied as an image");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't copy the image.");
    }
  };

  const fixWithAi = async () => {
    if (!current) return;
    setRefining(true);
    try {
      const corrected = await generateDiagram({
        prompt: current.prompt,
        type: current.type,
        level: getLevel(selectedLevel).id,
        subject: selectedSubject,
      });
      setCode(corrected.code);
      setCurrent({
        ...current,
        code: corrected.code,
        explanation: corrected.explanation,
        subject: selectedSubject,
      });
      toast.success("A corrected version is ready to preview");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't fix this diagram.");
    } finally {
      setRefining(false);
    }
  };

  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPan({ x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y });
  };
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      setZoom((value) => Math.min(2.5, Math.max(0.4, value * (event.deltaY < 0 ? 1.08 : 0.92))));
    } else setOffset((value) => ({ ...value, y: value.y - event.deltaY }));
  };

  const preview = (
    <div
      ref={canvasRef}
      onPointerDown={beginPan}
      onPointerMove={(event) =>
        pan && setOffset({ x: pan.ox + event.clientX - pan.x, y: pan.oy + event.clientY - pan.y })
      }
      onPointerUp={() => setPan(null)}
      onPointerCancel={() => setPan(null)}
      onWheel={handleWheel}
      className="relative flex min-h-[340px] flex-1 touch-none items-center justify-center overflow-hidden rounded-xl border bg-muted/30 sm:min-h-[460px]"
      aria-label="Diagram preview canvas; drag to pan and use Control plus scroll to zoom"
    >
      {previewSvg ? (
        <motion.div
          key={current?.id}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-h-full max-w-full cursor-grab [&_svg]:h-auto [&_svg]:max-h-[70vh] [&_svg]:max-w-full active:cursor-grabbing"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
          dangerouslySetInnerHTML={{ __html: previewSvg }}
        />
      ) : loading ? (
        <DiagramSkeleton />
      ) : current && renderError ? (
        <div className="max-w-md space-y-3 p-6 text-center">
          <p className="font-semibold text-destructive">Couldn't render this Mermaid code</p>
          <p className="break-words text-sm text-muted-foreground">{renderError}</p>
          <GradientButton onClick={() => void fixWithAi()} disabled={refining}>
            <Workflow className="h-4 w-4" />
            Fix with AI
          </GradientButton>
        </div>
      ) : (
        <div className="p-6 text-center text-sm text-muted-foreground">
          <GitBranch className="mx-auto mb-3 h-8 w-8 opacity-50" />
          Your diagram preview will appear here.
        </div>
      )}
    </div>
  );

  return (
    <div className="mobile-action-content mx-auto w-full max-w-[1500px] space-y-5 px-4 py-5 md:px-8">
      <PageHeader
        title="Diagram Maker"
        icon={Network}
        accent="diagrams"
        description="Turn an idea or a process into a clear, editable diagram."
      />
      <div className="grid min-w-0 gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        <SoftCard className="order-2 space-y-4 p-4 sm:p-5 xl:order-1">
          <details
            open={optionsOpen}
            onToggle={(event) => setOptionsOpen(event.currentTarget.open)}
          >
            <summary className="min-h-11 cursor-pointer list-none rounded-xl border p-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Diagram options
            </summary>
            <div className="mt-4 space-y-4">
              <div
                className="grid grid-cols-3 rounded-xl bg-muted p-1"
                role="tablist"
                aria-label="Diagram mode"
              >
                {(["General", "Flowchart Generator", "Mind Map"] as DiagramMode[]).map((item) => (
                  <button
                    key={item}
                    role="tab"
                    aria-selected={mode === item}
                    onClick={() => {
                      setMode(item);
                      if (item === "Mind Map") setType(item);
                      if (item === "Flowchart Generator") setType("Flowchart");
                    }}
                    className={cn(
                      "rounded-lg px-2 py-2 text-xs font-medium transition-colors",
                      mode === item
                        ? "bg-card shadow-soft"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
              {mode !== "General" && (
                <p className="rounded-xl bg-muted/70 p-3 text-xs text-muted-foreground">
                  {mode === "Flowchart Generator"
                    ? "Describe a process, e.g. checking whether a number is even or odd. Every result includes clear Start and End shapes."
                    : "Describe a topic and we’ll organise it into a Mermaid mind map with connected branches."}
                </p>
              )}
              <label className="block space-y-1.5 text-sm font-medium" htmlFor="diagram-prompt">
                What would you like to visualise?
              </label>
              <Textarea
                id="diagram-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
                placeholder="Describe a process, system, or concept…"
              />
              <div className="space-y-2">
                <p className="text-sm font-medium">Diagram type</p>
                <div className="flex flex-wrap gap-1.5">
                  {TYPES.map((item) => (
                    <button
                      key={item}
                      aria-pressed={type === item}
                      onClick={() => {
                        setType(item);
                        setMode(item === "Mind Map" ? "Mind Map" : "General");
                      }}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        type === item
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:bg-muted",
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block space-y-1.5 text-sm font-medium">
                Subject
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger aria-label="Subject">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              {subject === "Other" && (
                <label className="block space-y-1.5 text-sm font-medium" htmlFor="other-subject">
                  Enter subject
                  <Textarea
                    id="other-subject"
                    value={otherSubject}
                    onChange={(event) => setOtherSubject(event.target.value)}
                    rows={2}
                    maxLength={100}
                    placeholder="Type your subject"
                  />
                </label>
              )}
              <label className="block space-y-1.5 text-sm font-medium">
                Learning level
                <Select
                  value={getLevel(selectedLevel).id}
                  onValueChange={(value) => {
                    levelChosen.current = true;
                    setSelectedLevel(value as LevelId);
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
              <GradientButton
                className="hidden w-full md:inline-flex"
                size="lg"
                onClick={() => void generate()}
                disabled={loading || !prompt.trim()}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Workflow className="h-4 w-4" />
                )}
                {loading ? "Generating…" : "Generate diagram"}
              </GradientButton>
              <StickyActionBar>
                <GradientButton
                  size="lg"
                  onClick={() => void generate()}
                  disabled={loading || !prompt.trim()}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Workflow className="h-4 w-4" />
                  )}
                  {loading ? "Generating…" : "Generate diagram"}
                </GradientButton>
              </StickyActionBar>
              <div className="border-t pt-4">
                <h2 className="mb-2 text-sm font-semibold">History</h2>
                {diagrams.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Your saved diagrams will show up here.
                  </p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {diagrams.map((diagram) => {
                      const HistoryIcon = diagram.type === "Mind Map" ? Network : GitBranch;
                      return (
                        <li
                          key={diagram.id}
                          className="group flex items-center gap-2 rounded-xl p-2 hover:bg-muted"
                        >
                          <button
                            onClick={() => load(diagram)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <HistoryIcon className="h-4 w-4 shrink-0 text-diagrams" />
                            <span className="min-w-0 flex-1 truncate text-sm">{diagram.title}</span>
                            <span
                              title={new Date(diagram.createdAt).toLocaleString()}
                              className="shrink-0 text-xs text-muted-foreground"
                            >
                              {new Date(diagram.createdAt).toLocaleTimeString(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                            <span className="sr-only">{diagram.type}</span>
                          </button>
                          <button
                            aria-label={`Delete ${diagram.title}`}
                            onClick={() => setRemoveId(diagram.id)}
                            className="min-h-11 min-w-11 rounded-md p-2 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </details>
        </SoftCard>

        <SoftCard className="order-1 flex min-w-0 flex-col gap-3 p-3 sm:p-4 xl:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              className="flex gap-1 rounded-xl bg-muted p-1"
              role="tablist"
              aria-label="Diagram details"
            >
              {(["Preview", "Code", "Explanation"] as ViewTab[]).map((item) => (
                <button
                  key={item}
                  role="tab"
                  aria-selected={tab === item}
                  onClick={() => setTab(item)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium",
                    tab === item ? "bg-card shadow-soft" : "text-muted-foreground",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
            {current && (
              <div className="flex flex-wrap items-center gap-1">
                <IconButton label="Copy code" onClick={() => void copyCode()}>
                  <Copy />
                </IconButton>
                <IconButton label="Download PNG" onClick={() => void download("png")}>
                  <FileImage />
                </IconButton>
                <IconButton label="Download SVG" onClick={() => void download("svg")}>
                  <Download />
                </IconButton>
                <IconButton label="Copy as image" onClick={() => void copyImage()}>
                  <Expand />
                </IconButton>
                <GradientButton size="sm" variant="secondary" onClick={save}>
                  <Save className="h-4 w-4" />
                  Save
                </GradientButton>
              </div>
            )}
          </div>

          {tab === "Preview" ? (
            <>
              {preview}
              <div className="flex flex-wrap items-center gap-2">
                <GradientButton
                  variant="secondary"
                  size="sm"
                  aria-label="Zoom out"
                  onClick={() => setZoom((value) => Math.max(0.4, value - 0.1))}
                >
                  <Minus className="h-4 w-4" />
                </GradientButton>
                <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <GradientButton
                  variant="secondary"
                  size="sm"
                  aria-label="Zoom in"
                  onClick={() => setZoom((value) => Math.min(2.5, value + 0.1))}
                >
                  <Plus className="h-4 w-4" />
                </GradientButton>
                <GradientButton
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setZoom(1);
                    setOffset({ x: 0, y: 0 });
                  }}
                >
                  Fit
                </GradientButton>
                <GradientButton
                  className="ml-auto"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFullscreen(true)}
                >
                  <Maximize2 className="h-4 w-4" />
                  Fullscreen
                </GradientButton>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && instruction.trim()) void refine(instruction);
                  }}
                  placeholder="Tell AI what to change…"
                  disabled={!current || refining}
                  className="h-10 min-w-0 rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex flex-wrap gap-2">
                  <GradientButton
                    size="sm"
                    variant="secondary"
                    disabled={!current || refining}
                    onClick={() => void refine("Make it simpler")}
                  >
                    <Lightbulb className="h-4 w-4" />
                    Simpler
                  </GradientButton>
                  <GradientButton
                    size="sm"
                    variant="secondary"
                    disabled={!current || refining}
                    onClick={() => void refine("Add more detail")}
                  >
                    <Plus className="h-4 w-4" />
                    More detail
                  </GradientButton>
                  <GradientButton
                    size="sm"
                    disabled={!current || !instruction.trim() || refining}
                    onClick={() => void refine(instruction)}
                  >
                    {refining ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Workflow className="h-4 w-4" />
                    )}
                    Refine
                  </GradientButton>
                </div>
              </div>
            </>
          ) : tab === "Code" ? (
            <div className="flex min-h-[380px] flex-1 flex-col gap-2">
              {renderError && (
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <span className="min-w-0 flex-1">Mermaid syntax error: {renderError}</span>
                  <GradientButton size="sm" onClick={() => void fixWithAi()} disabled={refining}>
                    <Workflow className="h-4 w-4" />
                    Fix with AI
                  </GradientButton>
                </div>
              )}
              <Textarea
                aria-label="Editable Mermaid code"
                spellCheck={false}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                disabled={!current}
                className="min-h-[380px] flex-1 resize-y font-mono text-sm leading-relaxed"
                placeholder="Generate a diagram or paste Mermaid code here…"
              />
            </div>
          ) : current ? (
            <div className="min-h-[380px] flex-1 overflow-y-auto rounded-xl border p-5">
              <Markdown content={current.explanation} />
            </div>
          ) : (
            <div className="flex min-h-[380px] flex-1 items-center justify-center text-sm text-muted-foreground">
              Generate a diagram to see its explanation.
            </div>
          )}
        </SoftCard>
      </div>

      <AnimatePresence>
        {fullscreen && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col bg-background p-4 sm:p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Fullscreen diagram preview"
            onKeyDown={(event) => {
              if (event.key === "Escape") setFullscreen(false);
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{current?.title}</h2>
              <button
                autoFocus
                aria-label="Close fullscreen"
                onClick={() => setFullscreen(false)}
                className="rounded-xl border p-2 hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div
              className="flex flex-1 items-center justify-center overflow-auto rounded-2xl border bg-muted/20 p-6"
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AlertDialog open={!!removeId} onOpenChange={(open) => !open && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this diagram?</AlertDialogTitle>
            <AlertDialogDescription>
              This diagram will be removed from your history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeId) removeDiagram(removeId);
                if (current?.id === removeId) {
                  setCurrent(null);
                  setCode("");
                  setPreviewSvg("");
                }
                setRemoveId(null);
                toast.success("Diagram removed");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-lg border bg-card p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

function DiagramSkeleton() {
  return (
    <div className="w-3/4 space-y-8" aria-busy="true" aria-label="Generating diagram">
      <div className="mx-auto h-12 w-40 animate-pulse rounded-xl bg-muted" />
      <div className="flex justify-around gap-3">
        <div className="h-12 w-32 animate-pulse rounded-xl bg-muted" />
        <div className="h-12 w-32 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="mx-auto h-12 w-40 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
