import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, ClipboardCheck, MessageCircle, type LucideIcon } from "lucide-react";
import { GradientButton } from "@/components/ui-custom";

type NetworkInformation = EventTarget & { saveData?: boolean };

const FEATURES: { icon: LucideIcon; text: string }[] = [
  { icon: MessageCircle, text: "Ask a question and get a step-by-step explanation." },
  { icon: ClipboardCheck, text: "Practice with questions based on your subject." },
  { icon: BookOpen, text: "Review your study notes and recent progress." },
];

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome to EduAI" },
      {
        name: "description",
        content: "A friendly study companion that explains ideas at your learning level.",
      },
    ],
  }),
  component: WelcomePage,
});

function WelcomePage() {
  const [videoAllowed, setVideoAllowed] = useState(false);

  useEffect(() => {
    const wideScreen = window.matchMedia("(min-width: 768px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    const updateVideoPermission = () => {
      setVideoAllowed(wideScreen.matches && !reducedMotion.matches && !connection?.saveData);
    };

    updateVideoPermission();
    wideScreen.addEventListener("change", updateVideoPermission);
    reducedMotion.addEventListener("change", updateVideoPermission);
    connection?.addEventListener("change", updateVideoPermission);

    return () => {
      wideScreen.removeEventListener("change", updateVideoPermission);
      reducedMotion.removeEventListener("change", updateVideoPermission);
      connection?.removeEventListener("change", updateVideoPermission);
    };
  }, []);

  return (
    <main className="min-h-dvh bg-background px-4 py-8 pb-28 text-foreground md:py-14 md:pb-14">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-primary">
          <BookOpen className="h-5 w-5" />
        </div>
        <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
          Study with a clear plan
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Ask questions from your lessons, practice for exams, and review what you have studied.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-8 max-w-3xl overflow-hidden rounded-2xl border bg-muted">
          {videoAllowed ? (
            <video
              className="max-h-[min(50vh,28rem)] w-full object-contain"
              controls
              playsInline
              preload="none"
              poster="/media/hero-ascii-poster.jpg"
              aria-label="EduAI welcome video"
            >
              <source src="/media/ii.mp4" type="video/mp4" />
            </video>
          ) : (
            <img
              className="mx-auto max-h-[min(50vh,28rem)] w-full object-contain"
              src="/media/hero-ascii-poster.jpg"
              alt=""
            />
          )}
        </div>
        <div className="fixed inset-x-4 bottom-[env(safe-area-inset-bottom)] z-30 md:static md:mt-6">
          <Link to="/" className="inline-flex">
            <GradientButton size="lg">
              Start learning <ArrowRight className="h-4 w-4" />
            </GradientButton>
          </Link>
        </div>
      </div>
    </main>
  );
}
