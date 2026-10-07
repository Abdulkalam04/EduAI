import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type LevelId = "c1-5" | "c6-8" | "c9-10" | "c11-12" | "grad";

export interface LevelMeta {
  id: LevelId;
  label: string;
  short: string;
  style: string;
}

export const LEVELS: LevelMeta[] = [
  {
    id: "c1-5",
    label: "Class 1–5",
    short: "Class 1–5",
    style: "Stories and simple examples",
  },
  {
    id: "c6-8",
    label: "Class 6–8",
    short: "Class 6–8",
    style: "Clear concepts with everyday analogies",
  },
  {
    id: "c9-10",
    label: "Class 9–10",
    short: "Class 9–10",
    style: "Exam-focused, step-by-step",
  },
  {
    id: "c11-12",
    label: "Class 11–12",
    short: "Class 11–12",
    style: "Deeper theory, derivations and board + entrance prep",
  },
  {
    id: "grad",
    label: "Graduation",
    short: "Graduation",
    style: "Technical, with equations and industry examples",
  },
];

export const SUBJECTS = [
  "Maths",
  "Science",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "English",
  "DBMS",
  "Programming",
] as const;

export const getLevel = (id: LevelId): LevelMeta => LEVELS.find((l) => l.id === id) ?? LEVELS[2]!;

interface UserState {
  name: string;
  level: LevelId;
  subject: string;
  interests: string[];
  xp: number;
  streak: number;
  onboarded: boolean;
  levelSet: boolean;
  set: (p: Partial<Omit<UserState, "set" | "reset">>) => void;
  reset: () => void;
}

const initial = {
  name: "",
  level: "c9-10" as LevelId,
  subject: "Maths",
  interests: [] as string[],
  xp: 0,
  streak: 0,
  onboarded: false,
  levelSet: false,
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      ...initial,
      set: (p) => set(p.level ? { ...p, levelSet: true } : p),
      reset: () => set(initial),
    }),
    {
      name: "eduai-user",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
