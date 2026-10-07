import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Monitor,
  Moon,
  Palette,
  Sun,
  Wifi,
  XCircle,
} from "lucide-react";
import { pageHead } from "@/components/ComingSoonPage";
import { GradientButton, PageHeader, SoftCard } from "@/components/ui-custom";
import { useUiStore, type AccentColor, type Theme } from "@/store/useUiStore";
import { LEVELS, SUBJECTS, useUserStore } from "@/store/useUserStore";
import { useChatStore } from "@/store/useChatStore";
import { useBookStore } from "@/store/useBookStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { useCreativeStore } from "@/store/useCreativeStore";
import { useLearningStore } from "@/store/useLearningStore";
import { checkApiHealth, getApiUrl } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { AnswerStyle } from "@/lib/mock/tutor";

export const Route = createFileRoute("/settings")({
  head: pageHead(
    "Settings",
    "Manage your profile, learning preferences, appearance, backend and data.",
  ),
  component: SettingsPage,
});

const THEMES: { label: string; value: Theme; icon: typeof Sun }[] = [
  { label: "Light", value: "light", icon: Sun },
  { label: "Dark", value: "dark", icon: Moon },
  { label: "System", value: "system", icon: Monitor },
];
const ACCENTS: { label: string; value: AccentColor; color: string }[] = [
  { label: "Indigo", value: "indigo", color: "#6656e8" },
  { label: "Teal", value: "teal", color: "#128b88" },
  { label: "Rose", value: "rose", color: "#d34b6a" },
  { label: "Amber", value: "amber", color: "#bd7a16" },
];

function SettingsPage() {
  const ui = useUiStore();
  const { name, level, interests, set } = useUserStore();
  const [apiUrl, setApiUrl] = useState(() => getApiUrl());
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState<boolean | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const updateApiUrl = (value: string) => {
    setApiUrl(value);
    window.localStorage.setItem("apiUrl", value.trim());
  };

  const testConnection = async () => {
    setTesting(true);
    setConnection(null);
    try {
      await checkApiHealth();
      setConnection(true);
      toast.success("Connected to the AI backend.");
    } catch (cause) {
      setConnection(false);
      toast.error(cause instanceof Error ? cause.message : "The backend could not be reached.");
    } finally {
      setTesting(false);
    }
  };

  const toggleSubject = (subject: string) => {
    const next = interests.includes(subject)
      ? interests.filter((item) => item !== subject)
      : [...interests, subject];
    set({ interests: next });
  };

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
      data["useMock"] = ui.useMock;
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

  const resetEverything = () => {
    for (const key of [
      "eduai-user",
      "eduai-ui",
      "eduai-chats",
      "eduai-book",
      "eduai-practice",
      "eduai-creative",
      "eduai-learning",
      "apiUrl",
      "useMock",
    ]) {
      localStorage.removeItem(key);
    }
    useUserStore.persist.clearStorage();
    useChatStore.persist.clearStorage();
    useBookStore.persist.clearStorage();
    usePracticeStore.persist.clearStorage();
    useCreativeStore.persist.clearStorage();
    useLearningStore.persist.clearStorage();
    useUiStore.persist.clearStorage();
    window.location.reload();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Make EduAI feel like yours."
        icon={Palette}
        accent="progress"
      />
      <Tabs defaultValue="profile" className="space-y-5">
        <div className="-mx-1 w-full min-w-0 overflow-x-auto px-1 pb-1">
          <TabsList className="grid h-auto min-w-[600px] grid-cols-5">
            {["Profile", "Learning", "Appearance", "Backend", "Data"].map((item) => (
              <TabsTrigger key={item} value={item.toLowerCase()} className="min-h-11">
                {item}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="profile">
          <SoftCard className="space-y-6 p-5 sm:p-6">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Your name</Label>
              <Input
                id="profile-name"
                value={name}
                maxLength={40}
                autoComplete="name"
                onChange={(event) => set({ name: event.target.value })}
                placeholder="What should we call you?"
              />
            </div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Learning level</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {LEVELS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={item.id === level}
                    onClick={() => set({ level: item.id })}
                    className={`min-h-14 rounded-xl border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] ${item.id === level ? "border-primary bg-primary/5" : "bg-card"}`}
                  >
                    <span className="font-medium">
                      {item.emoji} {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{item.style}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Subjects you’re interested in</legend>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.map((subject) => (
                  <button
                    key={subject}
                    type="button"
                    aria-pressed={interests.includes(subject)}
                    onClick={() => toggleSubject(subject)}
                    className={`min-h-11 rounded-full border px-4 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${interests.includes(subject) ? "border-primary bg-primary/10 text-primary" : "bg-card"}`}
                  >
                    {subject}
                  </button>
                ))}
              </div>
            </fieldset>
          </SoftCard>
        </TabsContent>
        <TabsContent value="learning">
          <SoftCard className="space-y-6 p-5 sm:p-6">
            <PreferenceSelect<AnswerStyle>
              id="answer-style"
              label="Default answer style"
              value={ui.answerStyle}
              values={["Simple", "Exam Answer", "Detailed"]}
              onChange={ui.setAnswerStyle}
            />
            <PreferenceSelect
              id="solver-mode"
              label="Default solver mode"
              value={ui.solverMode === "teach" ? "Teach Me" : "Exam Answer"}
              values={["Teach Me", "Exam Answer"]}
              onChange={(value) => ui.setSolverMode(value === "Teach Me" ? "teach" : "exam")}
            />
          </SoftCard>
        </TabsContent>
        <TabsContent value="appearance">
          <SoftCard className="space-y-6 p-5 sm:p-6">
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Theme</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {THEMES.map(({ label, value, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={ui.theme === value}
                    onClick={() => ui.setTheme(value)}
                    className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ui.theme === value ? "border-primary bg-primary/5" : "bg-card"}`}
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
                    onClick={() => ui.setAccent(item.value)}
                    className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ui.accent === item.value ? "border-primary" : ""}`}
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
              onCheckedChange={ui.setReduceMotion}
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
                onValueChange={(value) => ui.setFontSize(value[0] ?? 16)}
                aria-label="Font size"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Compact</span>
                <span>Large</span>
              </div>
            </div>
          </SoftCard>
        </TabsContent>
        <TabsContent value="backend">
          <SoftCard className="space-y-5 p-5 sm:p-6">
            <div className="space-y-2">
              <Label htmlFor="api-url">API URL</Label>
              <Input
                id="api-url"
                value={apiUrl}
                onChange={(event) => updateApiUrl(event.target.value)}
                placeholder="http://localhost:8000"
                inputMode="url"
                autoComplete="url"
              />
              <p className="text-xs text-muted-foreground">
                Requests are sent to this server when demo mode is disabled.
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
              {connection !== null && (
                <span
                  role="status"
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${connection ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}
                >
                  {connection ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {connection ? "Connected" : "Not connected"}
                </span>
              )}
            </div>
            <div className="border-t pt-4">
              <PreferenceSwitch
                label="Use demo data"
                description="Keep this on to use local mock responses without a backend."
                checked={ui.useMock}
                onCheckedChange={ui.setUseMock}
              />
            </div>
          </SoftCard>
        </TabsContent>
        <TabsContent value="data">
          <SoftCard className="space-y-5 p-5 sm:p-6">
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
            <div className="border-t pt-5">
              <h2 className="font-semibold">Reset everything</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Permanently clear your saved EduAI data and preferences from this device.
              </p>
              <GradientButton
                className="mt-4"
                variant="secondary"
                onClick={() => setResetOpen(true)}
              >
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Reset everything
              </GradientButton>
            </div>
          </SoftCard>
        </TabsContent>
      </Tabs>
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all EduAI data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes your saved profile, learning history, practice papers,
              documents and created decks from this device. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my data</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                resetEverything();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
