import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen } from "lucide-react";
import { GradientButton } from "@/components/ui-custom";

type NetworkInformation = EventTarget & { saveData?: boolean };

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
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8 pb-28 text-foreground md:pb-8">
      <div className="w-full max-w-lg rounded-3xl border bg-card p-6 text-center shadow-soft sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <BookOpen className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">Welcome to EduAI</h1>
        <p className="mt-3 text-muted-foreground">
          Ask questions, practise for exams, and learn at your own pace.
        </p>
        <div className="mt-6 overflow-hidden rounded-2xl bg-muted">
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
        <Link
          to="/"
          className="fixed inset-x-4 bottom-[env(safe-area-inset-bottom)] z-30 mx-auto inline-flex w-fit md:static md:mx-0"
        >
          <GradientButton size="lg">
            Start learning <ArrowRight className="h-4 w-4" />
          </GradientButton>
        </Link>
      </div>
    </main>
  );
}
