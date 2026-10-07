export interface Topic {
  name: string;
  value: number;
}
export interface Activity {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: "tutor" | "solver" | "practice" | "book" | "ppt";
}
export interface PlanItem {
  id: string;
  title: string;
  meta: string;
  done: boolean;
}

export interface DashboardData {
  stats: { dailyProgress: number; streak: number; xpWeek: number; solved: number };
  mastery: Record<string, Topic[]>;
  suggestion: { strong: string; weak: string };
  activity: Activity[];
  plan: PlanItem[];
}

export const dashboardMock: DashboardData = {
  stats: { dailyProgress: 72, streak: 6, xpWeek: 1240, solved: 87 },
  mastery: {
    Maths: [
      { name: "Algebra", value: 90 },
      { name: "Geometry", value: 70 },
      { name: "Trigonometry", value: 40 },
    ],
    Science: [
      { name: "Motion", value: 82 },
      { name: "Chemical Reactions", value: 64 },
      { name: "Electricity", value: 45 },
    ],
    CS: [
      { name: "Loops", value: 88 },
      { name: "Arrays", value: 73 },
      { name: "Recursion", value: 38 },
    ],
  },
  suggestion: { strong: "Algebra", weak: "Trigonometry" },
  activity: [
    {
      id: "a1",
      title: "Asked the AI Tutor",
      detail: "Why does sin²θ + cos²θ = 1?",
      time: "12 min ago",
      kind: "tutor",
    },
    {
      id: "a2",
      title: "Solved a question paper",
      detail: "Maths sample paper · 18/20 correct",
      time: "2 h ago",
      kind: "solver",
    },
    {
      id: "a3",
      title: "Practice set completed",
      detail: "Quadratic equations · 92%",
      time: "Yesterday",
      kind: "practice",
    },
    {
      id: "a4",
      title: "Studied from your book",
      detail: "Chapter 4 · Carbon compounds",
      time: "Yesterday",
      kind: "book",
    },
    {
      id: "a5",
      title: "Created a presentation",
      detail: "Water cycle · 8 slides",
      time: "2 days ago",
      kind: "ppt",
    },
  ],
  plan: [
    { id: "p1", title: "Revise trigonometric identities", meta: "15 min · Maths", done: true },
    {
      id: "p2",
      title: "Solve 10 practice questions on heights & distances",
      meta: "20 min · Maths",
      done: false,
    },
    { id: "p3", title: "Viva warm-up: Laws of motion", meta: "10 min · Physics", done: false },
  ],
};
