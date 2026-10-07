import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Bug,
  Check,
  ChevronDown,
  Code2,
  Eye,
  FlaskConical,
  Lightbulb,
  Loader2,
  Play,
  Sparkles,
  Timer,
  WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GradientButton, PageHeader, SoftCard } from "@/components/ui-custom";
import { Markdown } from "@/components/tutor/Markdown";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { codeAction } from "@/lib/api";
import {
  CODE_LANGUAGES,
  type CodeExercise,
  type CodeActionKind,
  type CodeActionResult,
  type CodeLanguage,
  type ExerciseDifficulty,
} from "@/lib/types";
import { useUserStore, LEVELS, type LevelId } from "@/store/useUserStore";
import { useLearningStore } from "@/store/useLearningStore";
import { resolvedTheme, useUiStore } from "@/store/useUiStore";
import { pageHead } from "@/components/ComingSoonPage";

const MonacoEditor = lazy(async () => {
  const monaco = await import("@monaco-editor/react");
  return { default: monaco.Editor };
});
type ActionTab = "Output" | "AI Feedback" | "Test Cases" | "Hints";
type MobileTab = "Code" | "Output" | "AI";
const ACTIONS: { id: CodeActionKind; icon: typeof Sparkles; label: string }[] = [
  { id: "Explain", icon: Sparkles, label: "Explain" },
  { id: "Debug", icon: Bug, label: "Debug" },
  { id: "Predict Output", icon: Eye, label: "Predict Output" },
  { id: "Give Hint", icon: Lightbulb, label: "Give Hint" },
  { id: "Generate Test Cases", icon: FlaskConical, label: "Generate Test Cases" },
];
const editorLanguage: Record<CodeLanguage, string> = {
  Python: "python",
  Java: "java",
  C: "c",
  "C++": "cpp",
  JavaScript: "javascript",
  SQL: "sql",
  "HTML/CSS": "html",
};

export const Route = createFileRoute("/coding")({
  head: pageHead(
    "Coding Practice",
    "Work with code using guided AI actions, hints, and interview practice.",
  ),
  component: CodingPractice,
});

function CodingPractice() {
  const level = useUserStore((state) => state.level);
  const [language, setLanguage] = useState<CodeLanguage>("Python");
  const [exercise, setExercise] = useState<CodeExercise | null>(null);
  const [code, setCode] = useState("");
  const [tab, setTab] = useState<ActionTab>("Output");
  const [mobileTab, setMobileTab] = useState<MobileTab>("Code");
  const [result, setResult] = useState<CodeActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState<CodeActionKind>("Run");
  const [error, setError] = useState("");
  const [problemOpen, setProblemOpen] = useState(true);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<ExerciseDifficulty>("Easy");
  const [exerciseLevel, setExerciseLevel] = useState<LevelId>(level);
  const [interviewPractice, setInterviewPractice] = useState(false);
  const [interviewStartedAt, setInterviewStartedAt] = useState<number | null>(null);
  const [interviewSeconds, setInterviewSeconds] = useState(0);
  const [interviewDone, setInterviewDone] = useState(false);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const theme = useUiStore((state) => state.theme);
  const isDark = resolvedTheme(theme) === "dark";

  const runAction = useCallback(
    async (action: CodeActionKind) => {
      if (action !== "Generate Exercise" && !code.trim()) {
        const message = "Enter code or generate an exercise before requesting a coding action.";
        setError(message);
        toast.error(message);
        return;
      }
      setBusy(true);
      setError("");
      setLastAction(action);
      try {
        const next = await codeAction({
          action,
          code,
          language,
          level: action === "Generate Exercise" ? exerciseLevel : level,
          topic,
          difficulty,
          hintIndex: hintsRevealed,
        });
        if (next.exercise) {
          setExercise(next.exercise);
          setCode(next.exercise.starter[language] ?? "");
          setHintsRevealed(0);
          setGenerateOpen(false);
        }
        setResult(next);
        setTab(
          action === "Generate Test Cases"
            ? "Test Cases"
            : action === "Give Hint"
              ? "Hints"
              : action === "Run" || action === "Predict Output"
                ? "Output"
                : "AI Feedback",
        );
        setMobileTab(action === "Run" || action === "Predict Output" ? "Output" : "AI");
        if (action === "Interview") setInterviewDone(true);
        toast.success(action === "Run" ? "Code run complete" : `${action} complete`);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "The coding action failed.";
        setError(message);
        toast.error(message);
      } finally {
        setBusy(false);
      }
    },
    [code, language, level, exerciseLevel, topic, difficulty, hintsRevealed],
  );

  useEffect(() => {
    if (!interviewPractice || interviewStartedAt === null || interviewDone) return;
    const timer = window.setInterval(
      () => setInterviewSeconds(Math.floor((Date.now() - interviewStartedAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [interviewPractice, interviewStartedAt, interviewDone]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void runAction("Run");
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [runAction]);

  useEffect(() => {
    if (mobileTab === "AI") setTab("AI Feedback");
    else if (mobileTab === "Output") setTab("Output");
  }, [mobileTab]);

  const changeLanguage = (next: CodeLanguage) => {
    setLanguage(next);
    const starter = exercise?.starter[next];
    if (starter !== undefined) setCode(starter);
    setResult(null);
  };

  const nextHint = async () => {
    const count = hintsRevealed + 1;
    setHintsRevealed(count);
    await runAction("Give Hint");
  };
  const availableHints = result?.hints ?? exercise?.hints ?? [];

  const actionPanel = (
    <div className="flex h-full min-h-[320px] flex-col">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as ActionTab)}
        className="flex h-full flex-col"
      >
        <TabsList className="grid h-auto w-full grid-cols-4">
          {(["Output", "AI Feedback", "Test Cases", "Hints"] as ActionTab[]).map((item) => (
            <TabsTrigger key={item} value={item} className="px-1 text-xs sm:px-2 sm:text-sm">
              {item}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent
          value="Output"
          className="min-h-0 flex-1 overflow-auto rounded-xl border bg-[#111827] p-4 font-mono text-xs text-emerald-300"
        >
          <p className="mb-3 text-gray-400">
            $ {language === "Python" ? "python main.py" : `${language} · execution unavailable`}
          </p>
          {result?.output ? (
            <pre className="whitespace-pre-wrap">{result.output}</pre>
          ) : (
            <p className="text-gray-500">Run your Python code to see the output.</p>
          )}
          {error && (
            <p role="alert" className="mt-3 whitespace-pre-wrap text-rose-300">
              {error}
              <button onClick={() => void runAction(lastAction)} className="ml-2 underline">
                Retry
              </button>
            </p>
          )}
        </TabsContent>
        <TabsContent
          value="AI Feedback"
          className="min-h-0 flex-1 overflow-y-auto rounded-xl border p-4"
        >
          {result?.markdown && lastAction !== "Give Hint" && tab === "AI Feedback" ? (
            <Markdown content={result.markdown} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Choose Explain, Debug, or Predict Output for level-aware feedback.
            </p>
          )}
          {interviewPractice && interviewDone && (
            <div className="mt-4 border-t pt-4">
              <Markdown content={result?.markdown ?? ""} />
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
              <button
                onClick={() => void runAction(lastAction)}
                className="ml-2 font-semibold underline"
              >
                Retry
              </button>
            </div>
          )}
        </TabsContent>
        <TabsContent value="Test Cases" className="min-h-0 flex-1 overflow-auto rounded-xl border">
          {result?.tests?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">Input</th>
                    <th className="p-3">Expected</th>
                    <th className="p-3">Actual</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.tests.map((test, index) => (
                    <tr key={`${test.input}-${index}`} className="border-t">
                      <td className="p-3 font-mono text-xs">{test.input}</td>
                      <td className="p-3 font-mono text-xs">{test.expected}</td>
                      <td className="p-3 font-mono text-xs">{test.actual}</td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-1 text-xs font-medium",
                            test.passed
                              ? "bg-success/15 text-success"
                              : "bg-destructive/10 text-destructive",
                          )}
                        >
                          {test.passed ? "Passed" : "Review"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              Generate test cases to check common inputs.
            </p>
          )}
        </TabsContent>
        <TabsContent value="Hints" className="min-h-0 flex-1 overflow-y-auto rounded-xl border p-4">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Hints unlock one at a time. Try each idea before revealing the next.
            </p>
            {availableHints.slice(0, hintsRevealed).map((hint, index) => (
              <div key={hint} className="flex gap-3 rounded-xl bg-muted/70 p-3 text-sm">
                <span className="font-semibold text-primary">Hint {index + 1}</span>
                <span>{hint}</span>
              </div>
            ))}
            <GradientButton
              size="sm"
              onClick={() => void nextHint()}
              disabled={
                busy || (availableHints.length > 0 && hintsRevealed >= availableHints.length)
              }
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lightbulb className="h-4 w-4" />
              )}
              {availableHints.length > 0 && hintsRevealed >= availableHints.length
                ? "All hints revealed"
                : `Reveal Hint ${hintsRevealed + 1}`}
            </GradientButton>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );

  const editor = (
    <div className="flex h-[48vh] min-h-[320px] flex-col overflow-hidden rounded-xl border bg-[#111827] lg:h-[62vh]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-gray-300">
        <span className="font-mono">
          main.{language === "Python" ? "py" : language.toLowerCase()}
        </span>
        <span className="text-gray-500">JetBrains Mono</span>
      </div>
      <Suspense
        fallback={
          <div className="flex-1 animate-pulse bg-muted/20" aria-label="Loading code editor" />
        }
      >
        <MonacoEditor
          height="100%"
          language={editorLanguage[language]}
          theme={isDark ? "vs-dark" : "light"}
          value={code}
          onChange={(value) => setCode(value ?? "")}
          options={{
            minimap: { enabled: false },
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: "on",
            tabSize: 4,
            padding: { top: 14 },
          }}
        />
      </Suspense>
    </div>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto w-full max-w-[1500px] space-y-4 px-4 py-5 md:px-8">
        <PageHeader
          title="Coding Practice"
          icon={Code2}
          accent="coding"
          description="Explore code, find bugs, and learn with step-by-step AI guidance."
        />
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-soft">
          <Select value={language} onValueChange={(value) => changeLanguage(value as CodeLanguage)}>
            <SelectTrigger className="w-36" aria-label="Programming language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CODE_LANGUAGES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <GradientButton variant="secondary" size="sm" onClick={() => setGenerateOpen(true)}>
            <WandSparkles className="h-4 w-4" />
            New exercise
          </GradientButton>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Interview practice
              <Switch
                checked={interviewPractice}
                onCheckedChange={(checked) => {
                  setInterviewPractice(checked);
                  setInterviewStartedAt(checked ? Date.now() : null);
                  setInterviewSeconds(0);
                  setInterviewDone(false);
                }}
              />
            </label>
            {interviewPractice && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 font-mono text-xs">
                <Timer className="h-3.5 w-3.5" />
                {Math.floor(interviewSeconds / 60)}:{String(interviewSeconds % 60).padStart(2, "0")}
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={language === "Python" ? undefined : 0}>
                  <GradientButton
                    size="sm"
                    onClick={() => void runAction(interviewPractice ? "Interview" : "Run")}
                    disabled={busy || language !== "Python"}
                  >
                    <Play className="h-4 w-4" />
                    Run
                  </GradientButton>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {language === "Python" ? "Run code · Ctrl/Cmd + Enter" : "Run supports Python only"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        {exercise ? (
          <>
            <button
              onClick={() => setProblemOpen((open) => !open)}
              aria-expanded={problemOpen}
              className="flex w-full items-center justify-between rounded-xl border bg-muted/50 px-4 py-2.5 text-left text-sm font-semibold"
            >
              <span>
                Problem · {exercise.title}
                <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">
                  {exercise.difficulty}
                </span>
              </span>
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", problemOpen && "rotate-180")}
              />
            </button>
            {problemOpen && (
              <SoftCard className="space-y-3 p-4">
                <p className="text-sm">{exercise.statement}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {exercise.examples.map((example) => (
                    <div key={example.input} className="rounded-xl bg-muted/60 p-3 text-xs">
                      <p className="font-semibold">Example</p>
                      <p className="mt-1 font-mono">Input: {example.input}</p>
                      <p className="font-mono">Output: {example.output}</p>
                    </div>
                  ))}
                </div>
              </SoftCard>
            )}
          </>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Enter your code or generate an exercise to begin.
          </p>
        )}
        {interviewPractice && (
          <SoftCard className="flex flex-wrap items-center gap-3 p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-coding-soft text-coding">
              <Code2 className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Interview practice
              </p>
              <p className="text-sm">
                When you are ready, request Interview feedback to review your approach.
              </p>
            </div>
            {interviewDone && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                <Check className="h-4 w-4" />
                Reviewed
              </span>
            )}
          </SoftCard>
        )}

        <div className="hidden lg:block">
          <ResizablePanelGroup orientation="horizontal" className="min-h-[450px] gap-2">
            <ResizablePanel defaultSize={60} minSize={35}>
              {editor}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40} minSize={28}>
              <div className="h-full rounded-xl border bg-card p-3">{actionPanel}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
        <div className="space-y-3 lg:hidden">
          <Tabs value={mobileTab} onValueChange={(value) => setMobileTab(value as MobileTab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="Code">Code</TabsTrigger>
              <TabsTrigger value="Output">Output</TabsTrigger>
              <TabsTrigger value="AI">AI</TabsTrigger>
            </TabsList>
            <TabsContent value="Code">{editor}</TabsContent>
            <TabsContent value="Output" className="min-h-[320px]">
              {actionPanel}
            </TabsContent>
            <TabsContent value="AI" className="min-h-[320px]">
              <div className="rounded-xl border bg-card p-3">{actionPanel}</div>
            </TabsContent>
          </Tabs>
        </div>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map(({ id, icon: Icon, label }) => (
            <GradientButton
              key={id}
              variant="secondary"
              size="sm"
              onClick={() => void runAction(id)}
              disabled={busy}
            >
              {busy && lastAction === id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              {label}
            </GradientButton>
          ))}
        </div>
        <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate a coding exercise</DialogTitle>
              <DialogDescription>
                Choose a topic and difficulty. We’ll tailor the exercise to your learning level.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <label className="block space-y-1.5 text-sm font-medium">
                <Input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="Enter a topic"
                  aria-label="Exercise topic"
                />
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                Difficulty
                <Select
                  value={difficulty}
                  onValueChange={(value) => setDifficulty(value as ExerciseDifficulty)}
                >
                  <SelectTrigger aria-label="Exercise difficulty">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["Easy", "Medium", "Hard"] as const).map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                Level
                <Select
                  value={exerciseLevel}
                  onValueChange={(value) => setExerciseLevel(value as LevelId)}
                >
                  <SelectTrigger aria-label="Exercise level">
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
            </div>
            <DialogFooter>
              <GradientButton variant="secondary" onClick={() => setGenerateOpen(false)}>
                Cancel
              </GradientButton>
              <GradientButton
                onClick={() => void runAction("Generate Exercise")}
                disabled={busy || !topic.trim()}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate exercise
              </GradientButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
