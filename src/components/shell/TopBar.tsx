import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouterState, Link } from "@tanstack/react-router";
import { Search, ChevronDown, Check, User, Settings, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LEVELS, SUBJECTS, getLevel, useUserStore } from "@/store/useUserStore";
import { useUiStore } from "@/store/useUiStore";
import { titleFor } from "@/lib/nav";
import { checkApiHealth, resetLearningActivity } from "@/lib/api";
import { useChatStore } from "@/store/useChatStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { useLearningStore } from "@/store/useLearningStore";
import { Logo } from "./Logo";

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "S";

const pillBtn =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl border bg-card px-3 text-sm font-medium shadow-soft transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]";

export function TopBar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { level, subject, name, set, reset } = useUserStore();
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const queryClient = useQueryClient();
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const lvl = getLevel(level);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        await checkApiHealth();
        if (mounted) setBackendConnected(true);
      } catch {
        if (mounted) setBackendConnected(false);
      }
    };
    void check();
    const interval = window.setInterval(() => void check(), 30_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const resetLearningAndOnboarding = async () => {
    setResetting(true);
    try {
      await resetLearningActivity();
      useChatStore.getState().clearHistory();
      usePracticeStore.getState().clearHistory();
      useLearningStore.getState().clearHistory();
      reset();
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setResetOpen(false);
      toast.success("Learning activity cleared. Set up your profile again.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Couldn't reset learning activity.");
    } finally {
      setResetting(false);
    }
  };

  const LevelMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger className={pillBtn}>
        <span className="hidden lg:inline">{lvl.label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-xl">
        <DropdownMenuLabel>Learning level</DropdownMenuLabel>
        {LEVELS.map((l) => (
          <DropdownMenuItem
            key={l.id}
            onSelect={() => set({ level: l.id })}
            className="flex items-start gap-2 rounded-lg"
          >
            <span className="flex-1">
              <span className="block font-medium">{l.label}</span>
              <span className="block text-xs text-muted-foreground">{l.style}</span>
            </span>
            {l.id === level && <Check className="mt-0.5 h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const Avatar = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Profile menu"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
      >
        {initials(name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        <DropdownMenuLabel>
          {name || "Student"}
          <span className="block text-xs font-normal text-muted-foreground">{lvl.label}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/progress">
            <User className="mr-2 h-4 w-4" />
            My progress
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setResetOpen(true)}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset learning data & onboarding
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <header className="sticky top-0 z-30 border-b bg-background/75 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 md:px-8">
        <div className="md:hidden">
          <Logo />
        </div>
        <p className="hidden truncate text-lg font-semibold md:block">{titleFor(path)}</p>
        <div className="ml-auto flex items-center gap-2">
          <div
            role="status"
            aria-label={
              backendConnected === null
                ? "Checking backend connection"
                : backendConnected
                  ? "Backend connected"
                  : "Backend unavailable"
            }
            title={
              backendConnected
                ? "Backend connected"
                : backendConnected === null
                  ? "Checking backend connection"
                  : "Backend unavailable"
            }
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-card px-2.5 text-xs"
          >
            <span
              className={`h-2 w-2 rounded-full ${backendConnected ? "bg-success" : backendConnected === false ? "bg-destructive" : "animate-pulse bg-warning"}`}
            />
            <span className="hidden sm:inline">
              {backendConnected ? "Connected" : backendConnected === false ? "Offline" : "Checking"}
            </span>
          </div>
          <button
            onClick={() => setPaletteOpen(true)}
            className={`${pillBtn} !hidden text-muted-foreground lg:!inline-flex lg:w-56`}
            aria-label="Search (Ctrl K)"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="rounded-md border bg-muted px-1.5 text-[10px] font-medium">⌘K</kbd>
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className={`${pillBtn} !inline-flex px-2.5 md:!inline-flex lg:!hidden`}
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
          {LevelMenu}
          <div className="hidden lg:block">
            <DropdownMenu>
              <DropdownMenuTrigger className={pillBtn}>
                {subject}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-xl">
                <DropdownMenuLabel>Subject</DropdownMenuLabel>
                {SUBJECTS.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onSelect={() => set({ subject: s })}
                    className="rounded-lg"
                  >
                    <span className="flex-1">{s}</span>
                    {s === subject && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {Avatar}
        </div>
      </div>
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset learning activity and onboarding?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently clears chat history, practice results, viva history, and progress on
              the configured backend, then restarts your profile setup. This backend does not
              separate users, so the reset affects everyone using it. Uploaded documents and created
              diagrams or presentations are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetting}
              onClick={(event) => {
                event.preventDefault();
                void resetLearningAndOnboarding();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? "Resetting…" : "Clear activity and restart"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
