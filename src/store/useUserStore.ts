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

/** The sentinel value stored in the profile when no subject has been chosen. */
export const DEFAULT_SUBJECT = "Default";

/** The level used when the user hasn't explicitly set one. */
export const DEFAULT_LEVEL: LevelId = "c9-10";

/**
 * Label shown in the UI for the default subject.
 * Always display this string instead of the raw "Default" sentinel.
 */
export const DEFAULT_SUBJECT_LABEL = "Default (all subjects)";

/**
 * Maps the stored subject value to the value we actually send to the backend.
 * "Default" → "" (empty string) for Chat/Solve (backend handles "" gracefully).
 * Use toBackendSubject("general") variant for endpoints that require min_length=1.
 */
export function toApiSubject(subject: string): string {
  return subject === DEFAULT_SUBJECT || subject === "" ? "" : subject;
}

/**
 * For endpoints where subject has min_length=1 (Practice, Viva),
 * "Default" maps to "General".
 */
export function toRequiredApiSubject(subject: string): string {
  return subject === DEFAULT_SUBJECT || subject === "" ? "General" : subject;
}

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
  level: DEFAULT_LEVEL,
  subject: "",
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
      set: (p) =>
        set(p.level !== undefined && p.levelSet === undefined ? { ...p, levelSet: true } : p),
      reset: () => set(initial),
    }),
    {
      name: "eduai-user",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<UserState>;
        const migratedState = { ...state };

        if (migratedState.subject === "Maths" && !migratedState.interests?.length) {
          migratedState.subject = "";
        }
        if (
          version < 2 &&
          migratedState.level === "c9-10" &&
          migratedState.levelSet &&
          !migratedState.name?.trim() &&
          !migratedState.subject &&
          !migratedState.interests?.length
        ) {
          migratedState.levelSet = false;
        }

        return migratedState;
      },
    },
  ),
);

/**
 * Returns the effective level and subject to use for API calls.
 * Falls back to defaults when the user has not made an explicit choice.
 *
 * - effectiveLevel: always a valid LevelId
 * - effectiveSubject: the stored subject, or DEFAULT_SUBJECT when empty
 * - levelLabel: human-readable level label
 * - subjectLabel: human-readable subject (DEFAULT_SUBJECT_LABEL when default)
 */
export function useEffectiveProfile() {
  const level = useUserStore((s) => s.level);
  const subject = useUserStore((s) => s.subject);
  const levelSet = useUserStore((s) => s.levelSet);

  const effectiveLevel: LevelId = level ?? DEFAULT_LEVEL;
  const effectiveSubject: string = subject && subject !== "" ? subject : DEFAULT_SUBJECT;

  const levelMeta = getLevel(effectiveLevel);

  const subjectLabel =
    effectiveSubject === DEFAULT_SUBJECT ? DEFAULT_SUBJECT_LABEL : effectiveSubject;

  return {
    effectiveLevel,
    effectiveSubject,
    levelSet,
    levelLabel: levelMeta.short,
    subjectLabel,
    /** Value to send to Chat / Solve (min_length not required): "" when default */
    apiSubject: toApiSubject(effectiveSubject),
    /** Value to send to Practice / Viva (min_length=1 required): "General" when default */
    requiredApiSubject: toRequiredApiSubject(effectiveSubject),
  };
}
