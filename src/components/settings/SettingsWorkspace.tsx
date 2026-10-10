import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useBlocker, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  Loader2,
  Monitor,
  Moon,
  Palette,
  Server,
  Sun,
  UserRound,
  Wifi,
  XCircle,
} from "lucide-react";
import { GradientButton, PageHeader, SoftCard, StickyActionBar } from "@/components/ui-custom";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  checkApiHealth,
  getAccessToken,
  getApiUrl,
  resetLearningActivity,
  setAccessToken,
} from "@/lib/api";
import type { AnswerStyle } from "@/lib/types";
import { LEVELS, SUBJECTS, getLevel, useUserStore } from "@/store/useUserStore";
import { useChatStore } from "@/store/useChatStore";
import { useLearningStore } from "@/store/useLearningStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { useUiStore, type AccentColor, type Theme } from "@/store/useUiStore";

export type SettingsSectionId = "profile" | "learning" | "appearance" | "backend" | "data";

const SECTIONS: {
  id: SettingsSectionId;
  title: string;
  icon: typeof UserRound;
}[] = [
  { id: "profile", title: "Profile", icon: UserRound },
  { id: "learning", title: "Learning", icon: BookOpen },
  { id: "appearance", title: "Appearance", icon: Palette },
  { id: "backend", title: "Backend", icon: Server },
  { id: "data", title: "Data", icon: Database },
];

const THEMES: { label: string; value: Theme; icon: typeof Sun }[] = [
  { label: "Light", value: "light", icon: Sun },
  { label: "Dark", value: "dark", icon: Moon },
  { label: "System", value: "system", icon: Monitor },
];
const ACCENTS: { label: string; value: AccentColor; color: string }[] = [
  { label: "Blue", value: "blue", color: "var(--palette-blue)" },
  { label: "Teal", value: "teal", color: "var(--palette-teal)" },
  { label: "Coral", value: "coral", color: "var(--palette-coral)" },
  { label: "Amber", value: "amber", color: "var(--palette-amber)" },
];

interface SettingsDraft {
  user: {
    name: string;
    level: (typeof LEVELS)[number]["id"];
    levelSet: boolean;
    subject: string;
    interests: string[];
  };
  ui: {
    theme: Theme;
    accent: AccentColor;
    reduceMotion: boolean;
    fontSize: number;
    answerStyle: AnswerStyle;
    solverMode: "teach" | "exam";
  };
  apiUrl: string;
  accessToken: string;
}

interface SettingsContextValue {
  draft: SettingsDraft;
  updateDraft: (update: (current: SettingsDraft) => SettingsDraft) => void;
  connected: boolean | null;
  setConnected: (connected: boolean | null) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function useSettingsDraft() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("Settings sections must be rendered inside SettingsPage.");
  return context;
}

function readDraft(): SettingsDraft {
  const user = useUserStore.getState();
  const ui = useUiStore.getState();
  return {
    user: {
      name: user.name,
      level: user.level,
      levelSet: user.levelSet,
      subject: user.subject,
      interests: [...user.interests],
    },
    ui: {
      theme: ui.theme,
      accent: ui.accent,
      reduceMotion: ui.reduceMotion,
      fontSize: ui.fontSize,
      answerStyle: ui.answerStyle,
      solverMode: ui.solverMode,
    },
    apiUrl: getApiUrl(),
    accessToken: getAccessToken(),
  };
}

function sameDraft(a: SettingsDraft, b: SettingsDraft) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sectionUrl(id: SettingsSectionId) {
  return `/settings/${id}` as const;
}

function useDesktopBreakpoint() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return desktop;
}

export function SettingsPage() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const desktop = useDesktopBreakpoint();
  const [draft, setDraft] = useState(readDraft);
  const [savedDraft, setSavedDraft] = useState(readDraft);
  const [connected, setConnected] = useState<boolean | null>(null);
  const hasChanges = !sameDraft(draft, savedDraft);
  const activeSection = SECTIONS.find((section) => sectionUrl(section.id) === path);
  const isSectionRoute = Boolean(activeSection);

  useEffect(() => {
    if (desktop && path === "/settings") {
      void navigate({ to: "/settings/profile", replace: true });
    }
  }, [desktop, navigate, path]);

  useBlocker({
    shouldBlockFn: () => window.confirm("You have unsaved changes. Leave without saving?"),
    enableBeforeUnload: () => hasChanges,
    disabled: !hasChanges,
  });

  const contextValue = useMemo<SettingsContextValue>(
    () => ({
      draft,
      updateDraft: (update) => setDraft(update),
      connected,
      setConnected,
    }),
    [connected, draft],
  );

  const save = () => {
    useUserStore.getState().set(draft.user);
    const ui = useUiStore.getState();
    ui.setTheme(draft.ui.theme);
    ui.setAccent(draft.ui.accent);
    ui.setReduceMotion(draft.ui.reduceMotion);
    ui.setFontSize(draft.ui.fontSize);
    ui.setAnswerStyle(draft.ui.answerStyle);
    ui.setSolverMode(draft.ui.solverMode);
    window.localStorage.setItem("apiUrl", draft.apiUrl.trim());
    setAccessToken(draft.accessToken);
    const saved = structuredClone(draft);
    setSavedDraft(saved);
    setDraft(saved);
  };

  const summaryFor = (section: SettingsSectionId) => {
    switch (section) {
      case "profile":
        return `${draft.user.name.trim() || "Student"} · ${
          draft.user.levelSet ? getLevel(draft.user.level).label : "No class selected"
        }`;
      case "learning":
        return `${draft.user.interests.length} subjects, ${draft.ui.answerStyle}`;
      case "appearance":
        return `${draft.ui.theme[0]!.toUpperCase()}${draft.ui.theme.slice(1)}, ${
          ACCENTS.find((item) => item.value === draft.ui.accent)?.label ?? "Teal"
        }`;
      case "backend":
        return `${connected ? "Connected" : "Not connected"} · ${draft.apiUrl}`;
      case "data":
        return "Reset or clear your learning data";
    }
  };

  return (
    <SettingsContext.Provider value={contextValue}>
      <div className="space-y-5 px-4 py-4 pb-[calc(var(--tabbar-h)+48px+var(--action-gap)+env(safe-area-inset-bottom))] md:px-8 md:py-6 md:pb-6">
        {!isSectionRoute ? (
          <>
            <PageHeader
              title="Settings"
              description="Set your profile, study preferences, and display options."
              icon={Palette}
              accent="tutor"
            />
            <SectionList
              activePath={path}
              desktop={desktop}
              showMobileList
              showSectionContent={false}
              connected={connected}
              summaryFor={summaryFor}
            />
          </>
        ) : (
          <>
            <header className="flex min-h-11 items-center gap-3">
              <Link
                to="/settings"
                aria-label="Back to settings sections"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <h1 className="text-xl font-semibold">{activeSection?.title}</h1>
            </header>
            <SectionList
              activePath={path}
              desktop={desktop}
              showMobileList={false}
              showSectionContent
              connected={connected}
              summaryFor={summaryFor}
            />
          </>
        )}

        {hasChanges && (
          <StickyActionBar showOnDesktop>
            <GradientButton className="w-full" onClick={save}>
              Save
            </GradientButton>
          </StickyActionBar>
        )}
      </div>
    </SettingsContext.Provider>
  );
}

function SectionList({
  activePath,
  desktop,
  showMobileList,
  showSectionContent,
  connected,
  summaryFor,
}: {
  activePath: string;
  desktop: boolean;
  showMobileList: boolean;
  showSectionContent: boolean;
  connected: boolean | null;
  summaryFor: (section: SettingsSectionId) => string;
}) {
  return (
    <div
      className={
        desktop ? "grid min-w-0 gap-5 md:grid-cols-[minmax(220px,0.32fr)_minmax(0,1fr)]" : ""
      }
    >
      {(desktop || showMobileList) && (
        <nav
          aria-label="Settings sections"
          className={`overflow-hidden rounded-2xl border bg-card ${
            desktop ? "h-fit divide-y md:sticky md:top-20" : "divide-y"
          } ${desktop ? "" : "md:hidden"}`}
        >
          {SECTIONS.map(({ id, title, icon: Icon }) => {
            const active = activePath === sectionUrl(id);
            return (
              <Link
                key={id}
                to={sectionUrl(id)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                  active ? "bg-primary/10 text-primary" : "bg-card text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{title}</span>
                  <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground">
                    {id === "backend" && connected && (
                      <span
                        aria-label="Connected"
                        className="h-2 w-2 shrink-0 rounded-full bg-success"
                      />
                    )}
                    {summaryFor(id)}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </nav>
      )}
      {(desktop || showSectionContent) && (
        <div className="min-w-0">
          <Outlet />
        </div>
      )}
    </div>
  );
}

export function SettingsSectionContent({ section }: { section: SettingsSectionId }) {
  const { draft, updateDraft, connected, setConnected } = useSettingsDraft();
  const queryClient = useQueryClient();
  const [testing, setTesting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [otherSubjectOpen, setOtherSubjectOpen] = useState(false);
  const name = draft.user.name;
  const { level, levelSet, interests, subject } = draft.user;
  const ui = draft.ui;
  const otherSubjectDraft =
    interests.find((item) => !(SUBJECTS as readonly string[]).includes(item)) ??
    ((SUBJECTS as readonly string[]).includes(subject) ? "" : subject);
  const otherSubjectSelected = Boolean(otherSubjectDraft) || otherSubjectOpen;

  const updateUser = (update: (current: SettingsDraft["user"]) => SettingsDraft["user"]) =>
    updateDraft((current) => ({ ...current, user: update(current.user) }));
  const updateUi = (update: (current: SettingsDraft["ui"]) => SettingsDraft["ui"]) =>
    updateDraft((current) => ({ ...current, ui: update(current.ui) }));

  const testConnection = async () => {
    setTesting(true);
    setConnected(null);
    try {
      await checkApiHealth();
      setConnected(true);
      toast.success("Connected to the AI backend.");
    } catch (cause) {
      setConnected(false);
      toast.error(cause instanceof Error ? cause.message : "The backend could not be reached.");
    } finally {
      setTesting(false);
    }
  };

  const toggleSubject = (item: string) =>
    updateUser((current) => ({
      ...current,
      interests: current.interests.includes(item)
        ? current.interests.filter((value) => value !== item)
        : [...current.interests, item],
    }));

  const exportData = () => {
    const stores = [
      "eduai-user",
      "eduai-ui",
      "eduai-chats",
      "eduai-book",
      "eduai-practice",
      "eduai-creative",
      "eduai-learning",
    ];
    try {
      const data = Object.fromEntries(
        stores.flatMap((key) => {
          const value = localStorage.getItem(key);
          return value === null ? [] : [[key, JSON.parse(value) as unknown]];
        }),
      );
      data["apiUrl"] = getApiUrl();
      data["accessToken"] = getAccessToken();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = Object.assign(document.createElement("a"), {
        href: url,
        download: `eduai-data-${new Date().toISOString().slice(0, 10)}.json`,
      });
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Your EduAI data export is ready.");
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? `Couldn't export your data: ${cause.message}`
          : "Couldn't export your data.",
      );
    }
  };

  const resetLearningAndOnboarding = async () => {
    setResetting(true);
    try {
      await resetLearningActivity();
      useChatStore.getState().clearHistory();
      usePracticeStore.getState().clearHistory();
      useLearningStore.getState().clearHistory();
      useUserStore.getState().reset();
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setResetOpen(false);
      toast.success("Learning data cleared. Set up your profile again.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Couldn't reset your learning data.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <SoftCard className="min-w-0 space-y-6 p-4 sm:p-6">
        {section === "profile" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="profile-name">Your name</Label>
              <Input
                id="profile-name"
                value={name}
                maxLength={40}
                autoComplete="name"
                onChange={(event) =>
                  updateUser((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="What should we call you?"
              />
            </div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Learning level</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  type="button"
                  aria-pressed={!levelSet}
                  onClick={() => updateUser((current) => ({ ...current, levelSet: false }))}
                  className={`min-h-14 rounded-xl border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] ${
                    !levelSet ? "border-primary bg-primary/5" : "bg-card"
                  }`}
                >
                  <span className="font-medium">Default</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    No class chosen yet
                  </span>
                </button>
                {LEVELS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={levelSet && item.id === level}
                    onClick={() =>
                      updateUser((current) => ({
                        ...current,
                        level: item.id,
                        levelSet: true,
                      }))
                    }
                    className={`min-h-14 rounded-xl border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] ${
                      levelSet && item.id === level ? "border-primary bg-primary/5" : "bg-card"
                    }`}
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{item.style}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Subjects you’re interested in</legend>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={interests.includes(item)}
                    onClick={() => toggleSubject(item)}
                    className={`min-h-11 rounded-full border px-4 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      interests.includes(item)
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-card"
                    }`}
                  >
                    {item}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={otherSubjectSelected}
                  onClick={() => {
                    if (otherSubjectSelected) {
                      setOtherSubjectOpen(false);
                      updateUser((current) => ({
                        ...current,
                        interests: current.interests.filter((item) =>
                          (SUBJECTS as readonly string[]).includes(item),
                        ),
                        subject: "",
                      }));
                    } else {
                      setOtherSubjectOpen(true);
                    }
                  }}
                  className={`min-h-11 rounded-full border px-4 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    otherSubjectSelected ? "border-primary bg-primary/10 text-primary" : "bg-card"
                  }`}
                >
                  Other{otherSubjectDraft ? ` (${otherSubjectDraft})` : ""}
                </button>
              </div>
              {otherSubjectSelected && (
                <label
                  className="block space-y-1.5 text-sm font-medium"
                  htmlFor="settings-other-subject"
                >
                  Enter subject
                  <Input
                    id="settings-other-subject"
                    value={otherSubjectDraft}
                    maxLength={80}
                    onChange={(event) => {
                      const customSubject = event.target.value.trim();
                      updateUser((current) => ({
                        ...current,
                        subject: customSubject,
                        interests: [
                          ...current.interests.filter((item) =>
                            (SUBJECTS as readonly string[]).includes(item),
                          ),
                          ...(customSubject ? [customSubject] : []),
                        ],
                      }));
                    }}
                    placeholder="Type your subject"
                  />
                </label>
              )}
            </fieldset>
          </>
        )}

        {section === "learning" && (
          <>
            <PreferenceSelect<AnswerStyle>
              id="answer-style"
              label="Default answer style"
              value={ui.answerStyle}
              values={["Simple", "Exam Answer", "Detailed"]}
              onChange={(value) => updateUi((current) => ({ ...current, answerStyle: value }))}
            />
            <PreferenceSelect
              id="solver-mode"
              label="Default solver mode"
              value={ui.solverMode === "teach" ? "Teach Me" : "Exam Answer"}
              values={["Teach Me", "Exam Answer"]}
              onChange={(value) =>
                updateUi((current) => ({
                  ...current,
                  solverMode: value === "Teach Me" ? "teach" : "exam",
                }))
              }
            />
          </>
        )}

        {section === "appearance" && (
          <>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Theme</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {THEMES.map(({ label, value, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={ui.theme === value}
                    onClick={() => updateUi((current) => ({ ...current, theme: value }))}
                    className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      ui.theme === value ? "border-primary bg-primary/5" : "bg-card"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Accent colour</legend>
              <div className="flex flex-wrap gap-3">
                {ACCENTS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-label={`${item.label} accent`}
                    aria-pressed={ui.accent === item.value}
                    onClick={() => updateUi((current) => ({ ...current, accent: item.value }))}
                    className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      ui.accent === item.value ? "border-primary" : ""
                    }`}
                  >
                    <span
                      className="h-5 w-5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm">{item.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <PreferenceSwitch
              label="Reduce motion"
              description="Limit decorative animations throughout the app."
              checked={ui.reduceMotion}
              onCheckedChange={(checked) =>
                updateUi((current) => ({ ...current, reduceMotion: checked }))
              }
            />
            <div className="space-y-3">
              <div className="flex justify-between gap-3">
                <Label htmlFor="font-size">Font size</Label>
                <span className="text-sm tabular-nums text-muted-foreground">{ui.fontSize}px</span>
              </div>
              <Slider
                id="font-size"
                min={14}
                max={20}
                step={1}
                value={[ui.fontSize]}
                onValueChange={(value) =>
                  updateUi((current) => ({ ...current, fontSize: value[0] ?? 16 }))
                }
                aria-label="Font size"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Compact</span>
                <span>Large</span>
              </div>
            </div>
          </>
        )}

        {section === "backend" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="api-url">API URL</Label>
              <Input
                id="api-url"
                value={draft.apiUrl}
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, apiUrl: event.target.value }))
                }
                placeholder="http://localhost:8000"
                inputMode="url"
                autoComplete="url"
              />
              <p className="text-xs text-muted-foreground">
                EduAI sends backend requests to this server.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="access-token">Access token</Label>
              <Input
                id="access-token"
                type="password"
                value={draft.accessToken}
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, accessToken: event.target.value }))
                }
                placeholder="Optional Bearer token"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Required if the backend is configured with an access token.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <GradientButton
                variant="secondary"
                onClick={() => void testConnection()}
                disabled={testing}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wifi className="h-4 w-4" />
                )}
                Test connection
              </GradientButton>
              {connected !== null && (
                <span
                  role="status"
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                    connected ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {connected ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {connected ? "Connected" : "Not connected"}
                </span>
              )}
            </div>
          </>
        )}

        {section === "data" && (
          <>
            <div>
              <h2 className="font-semibold">Export your data</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Download your saved profile, conversations, papers, decks, documents and progress.
              </p>
              <GradientButton className="mt-4" variant="secondary" onClick={exportData}>
                <Download className="h-4 w-4" />
                Export my data
              </GradientButton>
            </div>
            <div className="border-t border-destructive/30 pt-5">
              <h2 className="font-semibold text-destructive">Danger zone</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Clear chats, practice results, viva history, and progress on the study server, then
                start profile setup again. Uploaded documents and created diagrams or presentations
                are kept. This shared server reset affects everyone who uses it.
              </p>
              <GradientButton
                className="mt-4"
                variant="secondary"
                onClick={() => setResetOpen(true)}
              >
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Reset learning data & onboarding
              </GradientButton>
            </div>
          </>
        )}
      </SoftCard>

      {section === "data" && (
        <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset learning data and onboarding?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently clears chat history, practice results, viva history, and progress
                on the configured backend, then restarts profile setup. This shared backend reset
                affects everyone who uses it. Uploaded documents and created diagrams or
                presentations are kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resetting}>Keep my data</AlertDialogCancel>
              <AlertDialogAction
                disabled={resetting}
                onClick={(event) => {
                  event.preventDefault();
                  void resetLearningAndOnboarding();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {resetting ? "Resetting…" : "Clear learning data"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

function PreferenceSwitch({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

function PreferenceSelect<T extends string>({
  id,
  label,
  values,
  value,
  onChange,
}: {
  id: string;
  label: string;
  values: T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="min-h-11 rounded-xl border bg-background px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}
