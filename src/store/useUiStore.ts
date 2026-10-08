import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";
export type AccentColor = "teal" | "blue" | "coral" | "amber";

interface UiState {
  collapsed: boolean;
  theme: Theme;
  paletteOpen: boolean;
  hydrated: boolean;
  accent: AccentColor;
  reduceMotion: boolean;
  fontSize: number;
  answerStyle: "Simple" | "Exam Answer" | "Detailed";
  solverMode: "teach" | "exam";
  setCollapsed: (v: boolean) => void;
  setTheme: (t: Theme) => void;
  setPaletteOpen: (v: boolean) => void;
  setAccent: (v: AccentColor) => void;
  setReduceMotion: (v: boolean) => void;
  setFontSize: (v: number) => void;
  setAnswerStyle: (v: UiState["answerStyle"]) => void;
  setSolverMode: (v: UiState["solverMode"]) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      collapsed: false,
      theme: "system",
      paletteOpen: false,
      hydrated: false,
      accent: "teal",
      reduceMotion: false,
      fontSize: 16,
      answerStyle: "Simple",
      solverMode: "teach",
      setCollapsed: (collapsed) => set({ collapsed }),
      setTheme: (theme) => set({ theme }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setAccent: (accent) => set({ accent }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setFontSize: (fontSize) => set({ fontSize: Math.max(14, Math.min(20, fontSize)) }),
      setAnswerStyle: (answerStyle) => set({ answerStyle }),
      setSolverMode: (solverMode) => set({ solverMode }),
    }),
    {
      name: "eduai-ui",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      merge: (persistedState, currentState) => {
        if (!persistedState || typeof persistedState !== "object") return currentState;
        const { useMock: _legacyUseMock, ...preferences } = persistedState as Partial<UiState> & {
          useMock?: boolean;
        };
        const previousAccent = (persistedState as { accent?: string }).accent;
        const accent =
          previousAccent === "indigo" || previousAccent === "teal"
            ? "teal"
            : previousAccent === "rose"
              ? "coral"
              : previousAccent === "blue" ||
                  previousAccent === "coral" ||
                  previousAccent === "amber"
                ? previousAccent
                : currentState.accent;
        return { ...currentState, ...preferences, accent };
      },
      partialize: (s) => ({
        collapsed: s.collapsed,
        theme: s.theme,
        accent: s.accent,
        reduceMotion: s.reduceMotion,
        fontSize: s.fontSize,
        answerStyle: s.answerStyle,
        solverMode: s.solverMode,
      }),
    },
  ),
);

export function resolvedTheme(t: Theme): "light" | "dark" {
  if (t !== "system") return t;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(t: Theme) {
  document.documentElement.classList.toggle("dark", resolvedTheme(t) === "dark");
}

const ACCENT_VALUES: Record<AccentColor, [string, string]> = {
  teal: ["#0F6B5C", "#0B5A4D"],
  blue: ["#426A85", "#34566D"],
  coral: ["#B3392B", "#922C22"],
  amber: ["#8A5300", "#734600"],
};

const DARK_ACCENT_VALUES: Record<AccentColor, [string, string]> = {
  teal: ["#3FB8A0", "#34A48F"],
  blue: ["#8FB2C8", "#789DB5"],
  coral: ["#E77A6D", "#D9685A"],
  amber: ["#E5A93A", "#D19628"],
};

export function applyUiPreferences(
  preferences: Pick<UiState, "accent" | "reduceMotion" | "fontSize">,
) {
  const root = document.documentElement;
  const values = root.classList.contains("dark") ? DARK_ACCENT_VALUES : ACCENT_VALUES;
  const [primary, hover] = values[preferences.accent];
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-hover", hover);
  root.style.setProperty(
    "--primary-foreground",
    root.classList.contains("dark") ? "#07201B" : "#FFFFFF",
  );
  root.style.setProperty("--ring", primary);
  root.style.setProperty("font-size", `${preferences.fontSize}px`);
  root.dataset["reduceMotion"] = String(preferences.reduceMotion);
}
