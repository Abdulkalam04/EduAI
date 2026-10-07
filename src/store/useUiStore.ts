import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";
export type AccentColor = "indigo" | "teal" | "rose" | "amber";

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
      accent: "indigo",
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
        return { ...currentState, ...preferences };
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
  indigo: ["oklch(0.585 0.233 277.1)", "oklch(0.606 0.25 292.7)"],
  teal: ["oklch(0.6 0.14 180)", "oklch(0.65 0.15 200)"],
  rose: ["oklch(0.62 0.22 15)", "oklch(0.66 0.2 350)"],
  amber: ["oklch(0.68 0.16 65)", "oklch(0.72 0.17 85)"],
};

export function applyUiPreferences(
  preferences: Pick<UiState, "accent" | "reduceMotion" | "fontSize">,
) {
  const root = document.documentElement;
  const [primary, secondary] = ACCENT_VALUES[preferences.accent];
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-2", secondary);
  root.style.setProperty("--ring", primary);
  root.style.setProperty("font-size", `${preferences.fontSize}px`);
  root.dataset["reduceMotion"] = String(preferences.reduceMotion);
}
