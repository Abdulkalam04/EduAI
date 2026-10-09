import { useEffect, useState } from "react";
import { useRouterState, Link } from "@tanstack/react-router";
import { Search, Check } from "lucide-react";
import { LEVELS, SUBJECTS, getLevel, useUserStore, DEFAULT_SUBJECT, DEFAULT_SUBJECT_LABEL } from "@/store/useUserStore";
import { useUiStore } from "@/store/useUiStore";
import { titleFor } from "@/lib/nav";
import { checkApiHealth } from "@/lib/api";
import { Logo } from "./Logo";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { initials } from "./profile-utils";

export function TopBar() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { level, levelSet, subject, name, set } = useUserStore();
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [otherSubjectSelected, setOtherSubjectSelected] = useState(false);
  const [otherSubjectDraft, setOtherSubjectDraft] = useState("");
  const currentLevel = getLevel(level);
  const isOtherSubject =
    (otherSubjectSelected && !subject) ||
    (Boolean(subject) && !SUBJECTS.includes(subject as (typeof SUBJECTS)[number]));

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

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 md:h-16 md:px-8">
        <div className="md:hidden">
          <Logo />
        </div>
        <p className="hidden truncate text-lg font-semibold md:block">{titleFor(path)}</p>
        <div className="ml-auto flex items-center gap-3">
          <div
            role="status"
            aria-label={
              backendConnected === null
                ? "Checking study server"
                : backendConnected
                  ? "Study server connected"
                  : "Study server unavailable"
            }
            title={
              backendConnected
                ? "Study server connected"
                : backendConnected === null
                  ? "Checking study server"
                  : "Study server unavailable"
            }
            className="flex min-h-11 items-center gap-2"
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${backendConnected ? "bg-success" : backendConnected === false ? "bg-destructive" : "animate-pulse bg-warning"}`}
            />
            <span className="hidden text-xs text-muted-foreground md:inline">
              {backendConnected ? "Connected" : backendConnected === false ? "Offline" : "Checking"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden min-h-11 items-center gap-2 rounded-xl border bg-card px-3 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex lg:w-56"
            aria-label="Search pages and actions"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search</span>
            <kbd className="rounded-md border bg-muted px-1.5 text-xs font-medium">Ctrl K</kbd>
          </button>
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open profile"
                className="flex h-11 w-11 items-center justify-center rounded-full border bg-primary text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {initials(name)}
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="mx-auto max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)] md:left-1/2 md:max-w-md md:-translate-x-1/2"
            >
              <SheetHeader className="pr-8 text-left">
                <SheetTitle className="text-primary">My Profile</SheetTitle>
                <SheetDescription>
                  {name || "Student"} · Choose the level and subject you are studying.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">Learning level</legend>
                  <button
                    type="button"
                    aria-pressed={!levelSet}
                    onClick={() => set({ levelSet: false })}
                    className={`flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${!levelSet ? "border-primary bg-primary/10 text-primary" : "bg-card"}`}
                  >
                    <span>
                      <span className="block font-medium">Default</span>
                      <span className="block text-sm text-muted-foreground">
                        No class chosen yet
                      </span>
                    </span>
                    {!levelSet && <Check className="h-5 w-5 text-primary" />}
                  </button>
                  {LEVELS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={levelSet && item.id === level}
                      onClick={() => set({ level: item.id })}
                      className={`flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${levelSet && item.id === level ? "border-primary bg-primary/10 text-primary" : "bg-card"}`}
                    >
                      <span>
                        <span className="block font-medium">{item.label}</span>
                        <span className="block text-sm text-muted-foreground">{item.style}</span>
                      </span>
                      {levelSet && item.id === level && <Check className="h-5 w-5 text-primary" />}
                    </button>
                  ))}
                </fieldset>
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">
                    Subject{" "}
                    <span className="font-normal text-muted-foreground">
                      ({subject ? (SUBJECTS.includes(subject as (typeof SUBJECTS)[number]) ? subject : isOtherSubject ? "Other" : subject) : DEFAULT_SUBJECT_LABEL})
                    </span>
                  </legend>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      aria-pressed={!subject && !isOtherSubject}
                      onClick={() => {
                        setOtherSubjectSelected(false);
                        setOtherSubjectDraft("");
                        set({ subject: "" });
                      }}
                      className={`flex min-h-11 items-center justify-between rounded-xl border px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${!subject && !isOtherSubject ? "border-primary bg-primary/10 text-primary" : "bg-card"}`}
                    >
                      {DEFAULT_SUBJECT_LABEL}
                      {!subject && !isOtherSubject && <Check className="h-4 w-4 text-primary" />}
                    </button>
                    {SUBJECTS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={item === subject}
                        onClick={() => {
                          setOtherSubjectSelected(false);
                          setOtherSubjectDraft("");
                          set({ subject: item });
                        }}
                        className={`flex min-h-11 items-center justify-between rounded-xl border px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${item === subject ? "border-primary bg-primary/10 text-primary" : "bg-card"}`}
                      >
                        {item}
                        {item === subject && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-pressed={isOtherSubject}
                      onClick={() => {
                        setOtherSubjectSelected(true);
                        setOtherSubjectDraft(isOtherSubject ? subject : "");
                        set({ subject: isOtherSubject ? subject : "" });
                      }}
                      className={`flex min-h-11 items-center justify-between rounded-xl border px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isOtherSubject ? "border-primary bg-primary/10 text-primary" : "bg-card"}`}
                    >
                      Other
                      {isOtherSubject && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  </div>
                  {isOtherSubject && (
                    <label
                      className="block space-y-1.5 text-sm font-medium"
                      htmlFor="profile-other-subject"
                    >
                      Enter subject
                      <input
                        id="profile-other-subject"
                        autoFocus
                        value={
                          otherSubjectDraft ||
                          (isOtherSubject && !otherSubjectSelected ? subject : "")
                        }
                        maxLength={80}
                        onChange={(event) => {
                          setOtherSubjectDraft(event.target.value);
                          // If left empty, store DEFAULT_SUBJECT as fallback
                          set({ subject: event.target.value || "" });
                        }}
                        onBlur={(event) => {
                          // On blur with empty value, fall back to DEFAULT_SUBJECT
                          if (!event.target.value.trim()) {
                            set({ subject: "" });
                          }
                        }}
                        placeholder="Type your subject (or leave blank for default)"
                        className="h-11 w-full rounded-xl border bg-background px-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </label>
                  )}
                </fieldset>
                <div className="flex gap-3 border-t pt-4">
                  <SheetClose asChild>
                    <Link
                      to="/settings"
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                    >
                      Profile & settings
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      to="/progress"
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[var(--progress)] bg-[var(--progress)] px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                      My progress
                    </Link>
                  </SheetClose>
                </div>
                <p className="sr-only">Current level: {currentLevel.label}</p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
