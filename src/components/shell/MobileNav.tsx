import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Home, Bot, FileQuestion, ClipboardList, LayoutGrid, Settings } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ALL_NAV } from "@/lib/nav";
import { FeatureIcon } from "@/components/ui-custom";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

const TABS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/tutor", label: "Tutor", icon: Bot },
  { to: "/solver", label: "Solver", icon: FileQuestion },
  { to: "/practice", label: "Practice", icon: ClipboardList },
];

export function MobileNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const more = ALL_NAV.filter((n) => !TABS.some((t) => t.to === n.to));
  const moreActive = !TABS.some((t) => t.to === path);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5">
          {TABS.map((t) => {
            const active = path === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-12 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:scale-95",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tab-dot"
                    className="absolute top-0 h-0.5 w-8 rounded-full bg-gradient-primary"
                  />
                )}
                <t.icon className="h-5 w-5" />
                {t.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-label="Open all tools"
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:scale-95",
              moreActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <LayoutGrid className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>All tools</DrawerTitle>
          </DrawerHeader>
          <div className="grid grid-cols-3 gap-3 px-4 pb-4">
            {more.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                aria-current={path === n.to ? "page" : undefined}
                className="flex min-h-16 flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-3 text-center text-xs font-medium shadow-soft transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
              >
                <FeatureIcon icon={n.icon} accent={n.accent} />
                {n.title}
              </Link>
            ))}
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              aria-current={path === "/settings" ? "page" : undefined}
              className="flex min-h-16 flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-3 text-center text-xs font-medium shadow-soft transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
            >
              <FeatureIcon icon={Settings} accent="progress" />
              Settings
            </Link>
          </div>
          <div className="px-4 pb-6">
            <ThemeToggle />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
