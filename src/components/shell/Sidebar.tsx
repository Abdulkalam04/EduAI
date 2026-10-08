import { Link, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, Settings, Heart } from "lucide-react";
import { NAV_GROUPS } from "@/lib/nav";
import { useUiStore } from "@/store/useUiStore";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import type { ReactNode } from "react";

function NavLink({
  to,
  icon: Icon,
  title,
  active,
  collapsed,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  active: boolean;
  collapsed: boolean;
}) {
  const link = (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]",
        active ? "text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-pill"
          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <Icon className="relative h-5 w-5 shrink-0" />
      {!collapsed && <span className="relative truncate">{title}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{title}</TooltipContent>
    </Tooltip>
  );
}

function Fade({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { collapsed, setCollapsed } = useUiStore();

  return (
    <TooltipProvider delayDuration={100}>
      <motion.aside
        animate={{ width: collapsed ? 72 : 264 }}
        transition={{ type: "spring", stiffness: 300, damping: 34 }}
        className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar md:flex"
      >
        <div
          className={cn(
            "flex h-16 items-center px-4",
            collapsed ? "justify-center" : "justify-between",
          )}
        >
          <Link to="/" aria-label="EduAI home">
            <Logo showText={!collapsed} />
          </Link>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            className="mx-auto mb-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        <nav
          aria-label="Main navigation"
          className="sidebar-nav-scroll flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3 py-2"
        >
          {NAV_GROUPS.map((g) => (
            <div key={g.label}>
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-border" />
              ) : (
                <p className="mb-1.5 px-3 text-xs font-semibold text-muted-foreground/80">
                  {g.label}
                </p>
              )}
              <div className="space-y-0.5">
                {g.items.map((it) => (
                  <div key={it.to}>
                    <NavLink
                      to={it.to}
                      icon={it.icon}
                      title={it.title}
                      active={path === it.to || path.startsWith(`${it.to}/`)}
                      collapsed={collapsed}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-1 border-t p-3">
          <Fade show={!collapsed}>
            <div className="mb-2 rounded-xl bg-muted p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Heart className="h-4 w-4" /> Free and open source
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Made for students.</p>
            </div>
          </Fade>
          <div className={cn(collapsed && "flex flex-col items-center gap-1")}>
            <ThemeToggle compact={collapsed} />
            <NavLink
              to="/settings"
              icon={Settings}
              title="Settings"
              active={path === "/settings"}
              collapsed={collapsed}
            />
          </div>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
