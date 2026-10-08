import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen } from "lucide-react";
import { GradientButton } from "@/components/ui-custom";

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
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="w-full max-w-lg rounded-3xl border bg-card p-6 text-center shadow-soft sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <BookOpen className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">Welcome to EduAI</h1>
        <p className="mt-3 text-muted-foreground">
          Ask questions, practise for exams, and learn at your own pace.
        </p>
        <Link to="/" className="mt-7 inline-flex">
          <GradientButton size="lg">
            Start learning <ArrowRight className="h-4 w-4" />
          </GradientButton>
        </Link>
      </div>
    </main>
  );
}
