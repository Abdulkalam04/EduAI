import { useEffect, useState } from "react";
import { useRouterState, Link } from "@tanstack/react-router";
import { Search, Check } from "lucide-react";
import {
  LEVELS,
  SUBJECTS,
  getLevel,
  useUserStore,
  DEFAULT_LEVEL,
  DEFAULT_SUBJECT,
  DEFAULT_SUBJECT_LABEL,
} from "@/store/useUserStore";
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
  const [isEditingOther, setIsEditingOther] = useState(false);
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
                    onClick={() => set({ level: DEFAULT_LEVEL, levelSet: false })}
                    className={`flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${!levelSet ? "border-primary bg-primary/10 text-primary" : "bg-card"}`}
                  >
                    <span>
                      <span className="block font-medium">Default</span>
                      <span className="block text-sm text-muted-foreground">
                        General learning, adaptable to any level
                      </span>
                    </span>
                    {!levelSet && <Check className="h-5 w-5 text-primary" />}
                  </button>
                  {LEVELS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={levelSet && item.id === level}
                      onClick={() => set({ level: item.id, levelSet: true })}
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
                      (
                      {subject
                        ? SUBJECTS.includes(subject as (typeof SUBJECTS)[number])
                          ? subject
                          : isOtherSubject
                            ? subject
                            : subject
                        : DEFAULT_SUBJECT_LABEL}
                      )
                    </span>
                  </legend>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      aria-pressed={!subject && !isOtherSubject}
                      onClick={() => {
                        setOtherSubjectSelected(false);
                        setOtherSubjectDraft("");
                        setIsEditingOther(false);
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
                          setIsEditingOther(false);
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
                        if (!subject || SUBJECTS.includes(subject as (typeof SUBJECTS)[number])) {
                          setIsEditingOther(true);
                          setOtherSubjectDraft("");
                        } else {
                          // Already has a custom subject typed — keep it without asking again
                          setOtherSubjectDraft(subject);
                        }
                      }}
                      className={`flex min-h-11 items-center justify-between rounded-xl border px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isOtherSubject ? "border-primary bg-primary/10 text-primary" : "bg-card"}`}
                    >
                      <span>
                        Other
                        {isOtherSubject &&
                        subject &&
                        !SUBJECTS.includes(subject as (typeof SUBJECTS)[number])
                          ? ` (${subject})`
                          : ""}
                      </span>
                      {isOtherSubject && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  </div>
                  {isOtherSubject && (
                    <div className="pt-1">
                      {isEditingOther ||
                      !subject ||
                      SUBJECTS.includes(subject as (typeof SUBJECTS)[number]) ? (
                        <div className="space-y-1.5">
                          <label
                            className="block text-sm font-medium"
                            htmlFor="profile-other-subject"
                          >
                            Enter subject
                          </label>
                          <div className="flex gap-2">
                            <input
                              id="profile-other-subject"
                              value={otherSubjectDraft}
                              maxLength={80}
                              onChange={(event) => {
                                setOtherSubjectDraft(event.target.value);
                                set({ subject: event.target.value.trim() });
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  setIsEditingOther(false);
                                }
                              }}
                              placeholder="Type your subject"
                              className="h-11 flex-1 rounded-xl border bg-background px-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                            <button
                              type="button"
                              onClick={() => setIsEditingOther(false)}
                              className="rounded-xl border bg-card px-3 text-sm font-medium hover:bg-muted"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-3 py-2 text-sm">
                          <div>
                            <span className="text-xs text-muted-foreground">Custom subject: </span>
                            <span className="font-semibold text-foreground">{subject}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setOtherSubjectDraft(subject);
                              setIsEditingOther(true);
                            }}
                            className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                          >
                            Change
                          </button>
                        </div>
                      )}
                    </div>
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
