import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Home, Bot, BookOpen, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePracticeStore } from "@/store/usePracticeStore";

const TABS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/tutor", label: "Ask", icon: Bot },
  { to: "/study", label: "Study", icon: BookOpen },
  { to: "/progress", label: "Progress", icon: TrendingUp },
];

export function MobileNav() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const stage = usePracticeStore((state) => state.view.stage);
  const [composerFocused, setComposerFocused] = useState(false);

  useEffect(() => {
    const update = () => {
      setComposerFocused(
        document.activeElement instanceof Element &&
          Boolean(document.activeElement.closest("[data-tutor-composer]")),
      );
    };
    const updateAfterFocusOut = () => window.setTimeout(update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", updateAfterFocusOut);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", updateAfterFocusOut);
    };
  }, []);

  if (
    path === "/viva" ||
    (path.startsWith("/practice") && stage === "attempt") ||
    (path === "/tutor" && composerFocused)
  ) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      aria-label="Primary"
    >
      <div className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = path === tab.to;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:scale-95",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="tab-dot"
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-primary"
                />
              )}
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
