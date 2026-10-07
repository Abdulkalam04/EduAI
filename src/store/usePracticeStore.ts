import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Paper, PaperResult } from "@/lib/types";

export interface Attempt {
  paperId: string;
  answers: Record<string, string>;
  flagged: string[];
  photos: Record<string, string>;
  remainingSec: number;
  status: "inprogress" | "submitted";
  result?: PaperResult;
}
export type Stage =
  | { stage: "generate"; prefillWeak?: string[] }
  | { stage: "attempt"; paperId: string }
  | { stage: "results"; paperId: string };

interface PracticeState {
  papers: Paper[];
  attempts: Record<string, Attempt>;
  view: Stage;
  setView: (v: Stage) => void;
  clearHistory: () => void;
  addPaper: (p: Paper) => void;
  startAttempt: (p: Paper) => void;
  patchAttempt: (paperId: string, patch: Partial<Attempt>) => void;
  removePaper: (id: string) => void;
}

export const usePracticeStore = create<PracticeState>()(
  persist(
    (set) => ({
      papers: [],
      attempts: {},
      view: { stage: "generate" },
      setView: (view) => set({ view }),
      clearHistory: () => set({ papers: [], attempts: {}, view: { stage: "generate" } }),
      addPaper: (p) => set((s) => ({ papers: [p, ...s.papers] })),
      startAttempt: (p) =>
        set((s) => ({
          attempts: {
            ...s.attempts,
            [p.id]: {
              paperId: p.id,
              answers: {},
              flagged: [],
              photos: {},
              remainingSec: p.timeMin * 60,
              status: "inprogress",
            },
          },
          view: { stage: "attempt", paperId: p.id },
        })),
      patchAttempt: (paperId, patch) =>
        set((s) => {
          const a = s.attempts[paperId];
          return a ? { attempts: { ...s.attempts, [paperId]: { ...a, ...patch } } } : {};
        }),
      removePaper: (id) =>
        set((s) => {
          const { [id]: _, ...rest } = s.attempts;
          return { papers: s.papers.filter((p) => p.id !== id), attempts: rest };
        }),
    }),
    { name: "eduai-practice", storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);
