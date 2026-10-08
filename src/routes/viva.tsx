import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Loader2,
  Mic,
  MicOff,
  Pause,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  GradientButton,
  MobileStickyAction,
  PageHeader,
  ProgressBar,
  SoftCard,
} from "@/components/ui-custom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { answerViva, createVivaReport, startViva } from "@/lib/api";
import type { VivaAnswerFeedback, VivaQuestion, VivaReport } from "@/lib/types";
import { useUserStore, LEVELS, type LevelId } from "@/store/useUserStore";
import { useLearningStore } from "@/store/useLearningStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { pageHead } from "@/components/ComingSoonPage";

type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = ArrayLike<SpeechRecognitionAlternativeLike>;
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export const Route = createFileRoute("/viva")({
  head: pageHead("Viva Mode", "Practise verbal answers with a supportive AI examiner."),
  component: VivaMode,
});

function VivaMode() {
  const defaultLevel = useUserStore((state) => state.level);
  const saveVivaReport = useLearningStore((state) => state.saveVivaReport);
  const setPracticeView = usePracticeStore((state) => state.setView);
  const [phase, setPhase] = useState<"setup" | "interview" | "report">("setup");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<LevelId>(defaultLevel);
  const [count, setCount] = useState("10");
  const [adaptive, setAdaptive] = useState(true);
  const [timed, setTimed] = useState(true);
  const [questions, setQuestions] = useState<VivaQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [questionSeconds, setQuestionSeconds] = useState(60);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState<
    { question: VivaQuestion; answer: string; feedback: VivaAnswerFeedback }[]
  >([]);
  const [feedback, setFeedback] = useState<VivaAnswerFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<VivaReport | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const followUpsAsked = useRef(0);
  const currentQuestion = questions[index];
  const speechAvailable =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    Boolean(
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition,
    );

  useEffect(
    () => () => {
      recognition.current?.stop();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  useEffect(() => {
    if (phase !== "interview" || !timed || feedback || busy) return;
    const timer = window.setInterval(
      () => setQuestionSeconds((remaining) => Math.max(0, remaining - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [phase, index, timed, feedback, busy]);

  const begin = async () => {
    setBusy(true);
    setError("");
    try {
      const started = await startViva({ subject, topic, level, count: Number(count), adaptive });
      if (!started.length) throw new Error("No viva questions were returned. Please try again.");
      setQuestions(started);
      setAnswers([]);
      setIndex(0);
      setQuestionSeconds(60);
      followUpsAsked.current = 0;
      setAnswer("");
      setFeedback(null);
      setReport(null);
      setPhase("interview");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The viva could not start.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async (finalAnswers = answers) => {
    if (!finalAnswers.length) {
      setPhase("setup");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await createVivaReport({ subject, topic, level, answers: finalAnswers });
      saveVivaReport(next);
      setReport(next);
      setPhase("report");
      if (next.score / next.total > 0.8) toast.success("Excellent work! You completed this viva.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "We couldn't prepare your report.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (skip = false) => {
    if (!currentQuestion || feedback || busy) return;
    setBusy(true);
    setError("");
    try {
      const evaluated = skip
        ? {
            label: "Needs work" as const,
            score: 0,
            explanation: "Skipping is okay; this question will be included in your review.",
            ideal: currentQuestion.explanation,
          }
        : await answerViva(currentQuestion, answer, level);
      const nextAnswers = [
        ...answers,
        { question: currentQuestion, answer: skip ? "" : answer, feedback: evaluated },
      ];
      setAnswers(nextAnswers);
      setFeedback(evaluated);
      const followUpPrompt = currentQuestion.followUp;
      const askFollowUp =
        adaptive &&
        !skip &&
        Boolean(followUpPrompt) &&
        evaluated.label !== "Needs work" &&
        followUpsAsked.current < 2;
      if (askFollowUp && followUpPrompt) {
        followUpsAsked.current += 1;
        const followUpQuestion: VivaQuestion = {
          ...currentQuestion,
          id: `${currentQuestion.id}-followup-${followUpsAsked.current}`,
          question: followUpPrompt,
          followUp: "",
        };
        setQuestions((current) => [
          ...current.slice(0, index + 1),
          followUpQuestion,
          ...current.slice(index + 1),
        ]);
      } else if (index === questions.length - 1) {
        await finish(nextAnswers);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "We couldn't evaluate this answer.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const nextQuestion = () => {
    if (index + 1 >= questions.length) return;
    setIndex((value) => value + 1);
    setAnswer("");
    setQuestionSeconds(60);
    setFeedback(null);
    setTranscript("");
  };

  const repeatQuestion = () => {
    if (!currentQuestion || !speechEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentQuestion.question);
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const toggleMic = () => {
    if (recognition.current) {
      recognition.current.stop();
      recognition.current = null;
      setSpeaking(false);
      return;
    }
    const Recognition =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Recognition) return;
    const instance = new Recognition();
    instance.continuous = true;
    instance.interimResults = true;
    instance.onresult = (event) => {
      let value = "";
      for (let i = 0; i < event.results.length; i++)
        value += event.results[i]?.[0]?.transcript ?? "";
      setTranscript(value);
      setAnswer(value);
    };
    instance.onerror = () => {
      toast.error("Voice input stopped. You can continue typing.");
      setSpeaking(false);
      recognition.current = null;
    };
    instance.onend = () => {
      setSpeaking(false);
      recognition.current = null;
    };
    recognition.current = instance;
    instance.start();
    setSpeaking(true);
  };

  const retryAction = () =>
    phase === "setup" ? void begin() : phase === "interview" ? void submit() : void finish();
  const percent = report ? Math.round((report.score / report.total) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 md:px-8">
      <PageHeader
        title="Viva Mode"
        icon={CircleHelp}
        accent="viva"
        description="Practise speaking your answers with a kind, level-aware examiner."
      />
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Something needs another try</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {error}
            <button onClick={retryAction} className="font-semibold underline">
              Retry
            </button>
          </AlertDescription>
        </Alert>
      )}
      <AnimatePresence mode="wait">
        {phase === "setup" && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <SoftCard className="mx-auto max-w-2xl p-5 sm:p-7">
              <div className="mb-6 flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-viva-soft text-viva">
                  <Sparkles className="h-6 w-6" />
                </span>
                <div>
                  <h2 className="text-xl font-semibold">Set up your viva</h2>
                  <p className="text-sm text-muted-foreground">
                    Choose what you’d like to practise today.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="viva-subject">Subject</Label>
                  <Select value={subject} onValueChange={setSubject}>
                    <SelectTrigger id="viva-subject">
                      <SelectValue placeholder="Choose a subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {["DBMS", "Science", "Computer Science", "Biology", "Physics", "Maths"].map(
                        (item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="viva-topic">Topic (optional)</Label>
                  <Input
                    id="viva-topic"
                    placeholder="e.g. Normalization"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="viva-level">Learning level</Label>
                  <Select value={level} onValueChange={(value) => setLevel(value as LevelId)}>
                    <SelectTrigger id="viva-level">
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
                </div>
                <div className="space-y-2">
                  <Label htmlFor="viva-count">Questions</Label>
                  <Select value={count} onValueChange={setCount}>
                    <SelectTrigger id="viva-count">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["5", "10", "15"].map((item) => (
                        <SelectItem key={item} value={item}>
                          {item} questions
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-xl bg-muted/60 p-4">
                  <div>
                    <p className="text-sm font-medium">Adaptive difficulty</p>
                    <p className="text-xs text-muted-foreground">
                      Ask follow-ups when answers are on track.
                    </p>
                  </div>
                  <Switch
                    checked={adaptive}
                    onCheckedChange={setAdaptive}
                    aria-label="Adaptive difficulty"
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl bg-muted/60 p-4">
                  <div>
                    <p className="text-sm font-medium">Question timer</p>
                    <p className="text-xs text-muted-foreground">Optional 60-second timer.</p>
                  </div>
                  <Switch checked={timed} onCheckedChange={setTimed} aria-label="Question timer" />
                </div>
              </div>
              <MobileStickyAction tabBarHidden>
                <GradientButton
                  className="w-full"
                  size="lg"
                  disabled={busy || !subject}
                  onClick={() => void begin()}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Start viva
                </GradientButton>
              </MobileStickyAction>
            </SoftCard>
          </motion.div>
        )}
        {phase === "interview" && currentQuestion && (
          <motion.div
            key={`interview-${index}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            className="space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {subject}
                  {topic && ` · ${topic}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Question {index + 1} of {questions.length}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {timed && (
                  <span
                    aria-live="polite"
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-xs ${questionSeconds <= 10 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}
                  >
                    <Clock3 className="h-3.5 w-3.5" />
                    {questionSeconds > 0
                      ? `0:${String(questionSeconds).padStart(2, "0")}`
                      : "Time's up"}
                  </span>
                )}
                <div
                  className="flex gap-1.5"
                  aria-label={`Question ${index + 1} of ${questions.length}`}
                >
                  {questions.map((question, i) => (
                    <span
                      key={`${question.id}-${i}`}
                      className={`h-2.5 w-2.5 rounded-full ${i < index ? "bg-success" : i === index ? "bg-primary" : "bg-muted"}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <ProgressBar value={((index + 1) / questions.length) * 100} />
            <SoftCard className="overflow-hidden p-5 sm:p-8">
              <div className="mx-auto max-w-3xl text-center">
                <motion.div
                  animate={
                    speaking
                      ? {
                          boxShadow: [
                            "0 0 0 0 color-mix(in oklab, var(--primary) 18%, transparent)",
                            "0 0 0 14px transparent",
                            "0 0 0 0 color-mix(in oklab, var(--primary) 18%, transparent)",
                          ],
                        }
                      : {}
                  }
                  transition={{ duration: 1.7, repeat: speaking ? Infinity : 0 }}
                  className="mx-auto mb-5 w-fit rounded-full"
                >
                  <Avatar className="h-16 w-16 border-2 border-primary/30">
                    <AvatarFallback className="bg-viva-soft text-xl text-viva">AI</AvatarFallback>
                  </Avatar>
                </motion.div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Your examiner
                </p>
                <h2 className="mt-4 text-2xl font-semibold leading-relaxed sm:text-3xl">
                  {currentQuestion.question}
                </h2>
                {currentQuestion.followUp && adaptive && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    A follow-up may help explore your understanding.
                  </p>
                )}
              </div>
              <div className="mx-auto mt-7 max-w-3xl space-y-3">
                <Label htmlFor="viva-answer">Your answer</Label>
                <Textarea
                  id="viva-answer"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Take a breath and explain it in your own words…"
                  disabled={Boolean(feedback) || busy}
                  className="min-h-48 resize-y"
                />
                {transcript && (
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    Live transcript: {transcript}
                  </p>
                )}
                <div className="sticky bottom-0 z-20 -mx-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur">
                  <div className="flex items-center gap-2">
                    {speechAvailable && (
                      <>
                        <GradientButton
                          variant="secondary"
                          size="sm"
                          onClick={toggleMic}
                          disabled={Boolean(feedback)}
                          aria-label={speaking ? "Stop voice input" : "Start voice input"}
                        >
                          {speaking && !speechEnabled ? (
                            <MicOff className="h-4 w-4" />
                          ) : (
                            <Mic className="h-4 w-4" />
                          )}
                          {speaking && !speechEnabled ? "Stop mic" : "Speak answer"}
                        </GradientButton>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Switch
                            checked={speechEnabled}
                            onCheckedChange={setSpeechEnabled}
                            aria-label="Read questions aloud"
                          />
                          Read aloud
                        </label>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <GradientButton
                      variant="ghost"
                      size="sm"
                      onClick={() => void submit(true)}
                      disabled={busy || Boolean(feedback)}
                    >
                      Skip
                    </GradientButton>
                    <GradientButton
                      variant="secondary"
                      size="sm"
                      onClick={repeatQuestion}
                      disabled={!speechAvailable || !speechEnabled}
                    >
                      <Volume2 className="h-4 w-4" />
                      Repeat question
                    </GradientButton>
                    {!feedback ? (
                      <GradientButton
                        size="sm"
                        onClick={() => void submit()}
                        disabled={busy || !answer.trim()}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Submit answer
                      </GradientButton>
                    ) : (
                      <GradientButton
                        size="sm"
                        onClick={nextQuestion}
                        disabled={index + 1 >= questions.length}
                      >
                        {index + 1 >= questions.length ? "Preparing report…" : "Next question"}
                      </GradientButton>
                    )}
                  </div>
                </div>
                {feedback && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="rounded-xl border bg-muted/50 p-4 text-left"
                  >
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${feedback.label === "Good" ? "bg-success/15 text-success" : feedback.label === "Partially correct" ? "bg-warning/15 text-warning" : "bg-destructive/10 text-destructive"}`}
                    >
                      {feedback.label}
                    </span>
                    <p className="mt-3 text-sm">{feedback.explanation}</p>
                  </motion.div>
                )}
              </div>
            </SoftCard>
            <div className="flex justify-center">
              <GradientButton
                variant="ghost"
                size="sm"
                onClick={() => void finish()}
                disabled={busy}
              >
                <Pause className="h-4 w-4" />
                End viva early
              </GradientButton>
            </div>
          </motion.div>
        )}
        {phase === "report" && report && (
          <motion.div
            key="report"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            <SoftCard className="relative overflow-hidden p-6 text-center sm:p-8">
              {percent > 80 && (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent"
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.2 }}
                />
              )}
              <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success/15 text-success">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <p className="relative mt-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Viva complete
              </p>
              <h2 className="relative mt-2 text-4xl font-bold tabular-nums">
                {report.score}/{report.total}
              </h2>
              <p className="relative mt-1 text-lg font-semibold">
                {percent >= 80 ? "Excellent" : percent >= 60 ? "Good progress" : "Keep practising"}
              </p>
              <p className="relative mt-2 text-sm text-muted-foreground">
                {percent > 80
                  ? "Wonderful work—you explained your ideas clearly."
                  : "Every answer is practice. Keep building your confidence."}
              </p>
              <div className="relative mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  to="/practice"
                  onClick={() =>
                    setPracticeView({ stage: "generate", prefillWeak: report.improvements })
                  }
                >
                  <GradientButton>
                    <Sparkles className="h-4 w-4" />
                    Practise weak topics
                  </GradientButton>
                </Link>
                <GradientButton
                  variant="secondary"
                  onClick={() => {
                    setPhase("setup");
                    setAnswers([]);
                    setReport(null);
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                  Try again
                </GradientButton>
              </div>
            </SoftCard>
            <div className="grid gap-4 sm:grid-cols-2">
              <SoftCard className="p-5">
                <h3 className="flex items-center gap-2 font-semibold text-success">
                  <Check className="h-4 w-4" />
                  Strengths
                </h3>
                {report.strengths.length ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {report.strengths.map((item) => (
                      <li key={item} className="flex gap-2">
                        <Check className="h-4 w-4 shrink-0 text-success" />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    You showed persistence by completing the viva.
                  </p>
                )}
              </SoftCard>
              <SoftCard className="p-5">
                <h3 className="flex items-center gap-2 font-semibold text-warning">
                  <X className="h-4 w-4" />
                  Topics to revisit
                </h3>
                {report.improvements.length ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {report.improvements.map((item) => (
                      <li key={item} className="flex gap-2">
                        <X className="h-4 w-4 shrink-0 text-warning" />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No major gaps this time—keep practising to reinforce it.
                  </p>
                )}
              </SoftCard>
            </div>
            <SoftCard className="p-5">
              <h3 className="mb-3 font-semibold">Question-by-question review</h3>
              <Accordion type="single" collapsible>
                {report.questions.map((item, questionIndex) => (
                  <AccordionItem
                    key={`${item.topic}-${questionIndex}`}
                    value={`q-${questionIndex}`}
                  >
                    <AccordionTrigger>
                      <span className="mr-3 flex min-w-0 flex-1 items-center gap-2 text-left">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${item.feedback.label === "Good" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
                        >
                          {item.feedback.label}
                        </span>
                        <span className="truncate">{item.question}</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-xs text-muted-foreground">
                        Your answer: {item.answer || "Skipped"}
                      </p>
                      <p className="mt-2 text-sm">{item.feedback.explanation}</p>
                      <div className="mt-3 rounded-xl bg-success/10 p-3 text-sm">
                        <span className="font-semibold text-success">
                          A strong answer could include:{" "}
                        </span>
                        {item.feedback.ideal}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </SoftCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
