import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Code2,
  FileQuestion,
  GraduationCap,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FeatureIcon, GradientButton, SectionHeader, SoftCard } from "@/components/ui-custom";
import { ALL_NAV } from "@/lib/nav";
import { LEVELS } from "@/store/useUserStore";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome to EduAI — Learning that grows with you" },
      {
        name: "description",
        content: "One free, open-source AI study companion that adapts from Class 1 to graduation.",
      },
      { property: "og:title", content: "Welcome to EduAI — Learning that grows with you" },
      {
        property: "og:description",
        content: "Explore an AI study companion for every learning level.",
      },
    ],
  }),
  component: WelcomePage,
});

const FEATURES = [
  { title: "AI Tutor", to: "/tutor", description: "Understand ideas in your own words." },
  { title: "Exam Solver", to: "/solver", description: "Work through papers step by step." },
  {
    title: "Study From My Book",
    to: "/book",
    description: "Ask questions grounded in your notes.",
  },
  {
    title: "Practice Papers",
    to: "/practice",
    description: "Build a paper for your level and topic.",
  },
  { title: "Diagrams", to: "/diagrams", description: "Turn concepts into clear visual maps." },
  { title: "PPT Maker", to: "/ppt", description: "Create and edit lesson presentations." },
  { title: "Coding", to: "/coding", description: "Practise coding with helpful guidance." },
  { title: "Viva", to: "/viva", description: "Rehearse answers with an AI examiner." },
] as const;

const LOOP = [
  { label: "Upload paper", icon: Upload, accent: "book" },
  { label: "Solve", icon: FileQuestion, accent: "solver" },
  { label: "Exam-style answers", icon: BookOpen, accent: "tutor" },
  { label: "Check my attempt", icon: ClipboardCheck, accent: "practice" },
  { label: "Find weak topics", icon: Lightbulb, accent: "progress" },
  { label: "Practice again", icon: RefreshCw, accent: "viva" },
] as const;

const FAQS = [
  {
    question: "Who is EduAI for?",
    answer:
      "EduAI is designed for learners from Class 1 through graduation. Its tutor adjusts explanations to the learning level you choose.",
  },
  {
    question: "Is EduAI really free?",
    answer:
      "EduAI is free and open source. AI-powered features connect to an OmniRoute gateway that you configure for your own models and provider.",
  },
  {
    question: "Does it work with my own study material?",
    answer:
      "Yes. Upload supported study documents to ask questions, create study aids, and work with material you provide.",
  },
  {
    question: "Can I change my learning level later?",
    answer:
      "Yes. Change your learning level any time in Settings; tutoring and generated practice use the selected level.",
  },
];

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reducedMotion = useReducedMotion();
  const [motionPreferenceReady, setMotionPreferenceReady] = useState(false);

  useEffect(() => {
    setMotionPreferenceReady(true);
  }, []);

  return (
    <motion.div
      initial={motionPreferenceReady && reducedMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{
        duration: 0.45,
        delay: motionPreferenceReady && reducedMotion ? 0 : delay,
        ease: "easeOut",
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function WelcomePage() {
  const reducedMotion = useReducedMotion();
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const updateVideoPreference = () => {
      window.cancelAnimationFrame(frame);
      if (motionPreference.matches || connection?.saveData) {
        setVideoEnabled(false);
        return;
      }
      frame = window.requestAnimationFrame(() => setVideoEnabled(true));
    };

    updateVideoPreference();
    motionPreference.addEventListener("change", updateVideoPreference);
    return () => {
      window.cancelAnimationFrame(frame);
      motionPreference.removeEventListener("change", updateVideoPreference);
    };
  }, []);

  const scrollToHow = () =>
    document.getElementById("how-it-adapts")?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  const startLearning = () => {
    window.sessionStorage.setItem("eduai-start-onboarding", "true");
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden bg-black text-white">
        <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
          {(!videoEnabled || videoFailed) && (
            <img
              src="/media/hero-ascii-poster.jpg"
              alt=""
              width={566}
              height={850}
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover object-[60%_center] opacity-70 md:object-[68%_center] md:opacity-90"
            />
          )}
          {videoEnabled && !videoFailed && (
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster="/media/hero-ascii-poster.jpg"
              aria-hidden="true"
              tabIndex={-1}
              onError={() => setVideoFailed(true)}
              className="welcome-video-motion welcome-video-mask absolute inset-0 h-full w-full max-w-none object-cover object-[60%_center] opacity-65 md:inset-auto md:left-auto md:right-48 md:top-[-15%] md:h-[130%] md:w-auto md:translate-x-0 md:object-contain md:object-center md:opacity-100"
            >
              <source src="/media/ii.mp4" type="video/mp4" />
            </video>
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/35 to-black/25 md:from-black md:via-black/65 md:to-black/10" />
          <div className="absolute inset-0 bg-black/10 md:hidden" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20 md:hidden" />
        </div>

        <div className="mx-auto flex min-h-[100svh] w-full max-w-7xl items-center px-4 py-14 sm:px-8 sm:py-20 lg:px-12">
          <div className="relative z-10 max-w-2xl">
            <p className="mb-4 font-mono text-[11px] font-semibold tracking-[0.16em] text-white/70 sm:mb-5 sm:text-sm sm:tracking-[0.22em]">
              EDU/AI — AI STUDY COMPANION
            </p>
            <h1 className="font-display text-3xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-7xl">
              One AI study companion, from school to graduation.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/75 sm:mt-5 sm:text-lg">
              Learn at your level. Practise with purpose. Keep moving forward.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2 sm:mt-8 sm:gap-3">
              <Link to="/" onClick={startLearning}>
                <GradientButton size="lg" className="min-h-12">
                  Start learning <ArrowRight className="h-4 w-4" />
                </GradientButton>
              </Link>
              <button
                type="button"
                onClick={scrollToHow}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                See how it works <ArrowDown className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-7 max-w-sm font-mono text-[11px] leading-5 text-white/65 sm:mt-9 sm:text-sm sm:leading-6">
              5 learning levels <span aria-hidden="true">·</span> 12 tools{" "}
              <span aria-hidden="true">·</span> 100% free and open source
            </p>
          </div>
        </div>
        <span className="sr-only">
          A black-and-white particle portrait dissolves into ASCII characters.
        </span>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-12 sm:space-y-24 sm:px-8 sm:py-24 lg:px-12">
        <section id="how-it-adapts" className="scroll-mt-8 space-y-8">
          <Reveal>
            <SectionHeader
              title="How it adapts"
              description="The same question gets a different explanation for every stage of learning."
            />
          </Reveal>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {LEVELS.map((item, index) => (
              <Reveal key={item.id} delay={index * 0.04}>
                <SoftCard className="h-full p-4">
                  <h3 className="font-semibold">{item.label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.style}</p>
                </SoftCard>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="space-y-8">
          <Reveal>
            <SectionHeader
              title="The learning loop"
              description="Move from a question to a clearer next step, then practise again."
            />
          </Reveal>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LOOP.map(({ label, icon, accent }, index) => {
              const Icon = icon;
              return (
                <Reveal key={label} delay={index * 0.04}>
                  <SoftCard className="flex h-full items-center gap-4 p-4">
                    <FeatureIcon icon={Icon} accent={accent} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">STEP {index + 1}</p>
                      <h3 className="font-semibold">{label}</h3>
                    </div>
                    {index < LOOP.length - 1 && (
                      <ArrowRight
                        aria-hidden="true"
                        className="ml-auto hidden h-4 w-4 shrink-0 text-muted-foreground lg:block"
                      />
                    )}
                  </SoftCard>
                </Reveal>
              );
            })}
          </ol>
        </section>

        <section className="space-y-8">
          <Reveal>
            <SectionHeader
              title="Tools for the whole learning journey"
              description="A connected toolkit for understanding, practising, and creating."
            />
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, index) => {
              const item = ALL_NAV.find((navItem) => navItem.to === feature.to);
              if (!item) return null;
              return (
                <Reveal key={feature.title} delay={index * 0.035}>
                  <Link
                    to={feature.to}
                    className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <SoftCard interactive className="h-full p-5">
                      <FeatureIcon icon={item.icon} accent={item.accent} />
                      <h3 className="mt-4 font-semibold">{feature.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
                      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                        Explore <ArrowRight className="h-4 w-4" />
                      </span>
                    </SoftCard>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <div>
              <p className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" /> A little more about EduAI
              </p>
              <h2 className="font-display text-3xl font-bold tracking-tight">
                Good questions welcome.
              </h2>
              <p className="mt-3 text-muted-foreground">
                Bring a topic, a paper, or a curious mind. EduAI helps you take the next step.
              </p>
            </div>
          </Reveal>
          <Reveal>
            <Accordion type="single" collapsible className="w-full">
              {FAQS.map((faq, index) => (
                <AccordionItem key={faq.question} value={`faq-${index}`}>
                  <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </section>

        <Reveal>
          <section className="relative overflow-hidden rounded-3xl border bg-card p-7 text-center shadow-soft sm:p-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-10 bg-gradient-primary"
            />
            <div className="relative mx-auto max-w-2xl">
              <GraduationCap className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
              <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
                100% free and open source.
              </h2>
              <p className="mt-2 text-muted-foreground">
                Built to make thoughtful learning tools available to everyone.
              </p>
              <Link to="/" onClick={startLearning} className="mt-6 inline-flex">
                <GradientButton size="lg">
                  Start learning <ArrowRight className="h-4 w-4" />
                </GradientButton>
              </Link>
            </div>
          </section>
        </Reveal>

        <footer className="flex flex-col gap-4 border-t pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>EduAI · Learn at your level, grow at your pace.</p>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link
              to="/settings"
              className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Settings
            </Link>
            <Link
              to="/tutor"
              className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              AI Tutor
            </Link>
            <Link
              to="/practice"
              className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Practice
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
