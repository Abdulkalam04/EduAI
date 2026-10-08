import { GraduationCap } from "lucide-react";

export function Logo({ showText = true }: { showText?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <GraduationCap className="h-5 w-5" />
      </span>
      {showText && <span className="font-display text-lg font-bold tracking-tight">EduAI</span>}
    </span>
  );
}
