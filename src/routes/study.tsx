import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen } from "lucide-react";
import { pageHead } from "@/components/ComingSoonPage";
import {
  FeatureIcon,
  GradientButton,
  MobileStickyAction,
  PageHeader,
  SoftCard,
} from "@/components/ui-custom";
import { TOOLS } from "@/lib/nav";

export const Route = createFileRoute("/study")({
  head: pageHead("Study", "Choose a simple tool for the way you want to learn."),
  component: StudyPage,
});

export function StudyPage() {
  return (
    <div className="space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="What would you like to do?"
        description="Choose a goal to get started."
        icon={BookOpen}
        accent="book"
      />
      <div id="study-tools" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SoftCard
              interactive
              className="flex min-h-28 items-center gap-4 rounded-2xl p-4 md:p-6"
            >
              <FeatureIcon icon={tool.icon} accent={tool.accent} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{tool.title}</span>
                <span className="mt-1 line-clamp-1 block text-sm text-muted-foreground">
                  {tool.description}
                </span>
              </span>
              <ArrowRight
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1"
              />
            </SoftCard>
          </Link>
        ))}
      </div>
      <MobileStickyAction>
        <GradientButton
          className="w-full"
          onClick={() => document.getElementById("study-tools")?.scrollIntoView({ block: "start" })}
        >
          Choose a study tool
        </GradientButton>
      </MobileStickyAction>
    </div>
  );
}
