import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  mockProgress,
  progressMastery,
  type ProgressSnapshot,
  type VivaReport,
} from "@/lib/mock/learning";

interface LearningState {
  vivaReports: VivaReport[];
  progress: ProgressSnapshot;
  saveVivaReport: (report: VivaReport) => void;
  setProgress: (progress: ProgressSnapshot) => void;
  recordQuestions: (count: number, score: number) => void;
}

const freshProgress = (): ProgressSnapshot => ({
  ...structuredClone(mockProgress),
  mastery: structuredClone(progressMastery),
});

export const useLearningStore = create<LearningState>()(
  persist(
    (set) => ({
      vivaReports: [],
      progress: freshProgress(),
      saveVivaReport: (report) =>
        set((state) => {
          const previous = state.progress;
          const attempted = previous.questionsAttempted + report.total;
          const averageScore = Math.round(
            (previous.averageScore * previous.questionsAttempted +
              (report.score / report.total) * 100 * report.total) /
              Math.max(1, attempted),
          );
          const mastery = Object.fromEntries(
            Object.entries(previous.mastery).map(([subject, topics]) => [
              subject,
              topics.map((topic) => {
                const related = report.questions.filter(
                  (question) => question.topic === topic.name,
                );
                if (!related.length) return topic;
                const gained = related.reduce((sum, question) => sum + question.feedback.score, 0);
                const adjusted = Math.round(topic.value * 0.8 + (gained / related.length) * 20);
                return { ...topic, value: Math.min(100, adjusted) };
              }),
            ]),
          );
          const day = new Date().toISOString().slice(0, 10);
          const activity = previous.activity.some((entry) => entry.date === day)
            ? previous.activity.map((entry) =>
                entry.date === day ? { ...entry, count: entry.count + report.total } : entry,
              )
            : [...previous.activity.slice(1), { date: day, count: report.total }];
          const progress: ProgressSnapshot = {
            ...previous,
            questionsAttempted: attempted,
            averageScore,
            mastery,
            activity,
            streak: Math.max(previous.streak, 1),
            longestStreak: Math.max(previous.longestStreak, previous.streak),
          };
          return { vivaReports: [report, ...state.vivaReports], progress };
        }),
      setProgress: (progress) => set({ progress }),
      recordQuestions: (count, score) =>
        set((state) => {
          const previous = state.progress;
          const attempted = previous.questionsAttempted + count;
          const averageScore = Math.round(
            (previous.averageScore * previous.questionsAttempted + score * count) /
              Math.max(1, attempted),
          );
          return { progress: { ...previous, questionsAttempted: attempted, averageScore } };
        }),
    }),
    {
      name: "eduai-learning",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
