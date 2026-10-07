import {
  LayoutDashboard,
  Bot,
  BookOpen,
  FileQuestion,
  ClipboardList,
  Mic,
  Code2,
  Workflow,
  Presentation,
  TrendingUp,
  NotebookPen,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";

export type Accent =
  | "tutor"
  | "solver"
  | "book"
  | "practice"
  | "diagrams"
  | "ppt"
  | "coding"
  | "viva"
  | "progress"
  | "notes";

export interface NavItem {
  title: string;
  to: string;
  icon: LucideIcon;
  accent: Accent;
  description: string;
  sub?: boolean;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Learn",
    items: [
      {
        title: "Dashboard",
        to: "/",
        icon: LayoutDashboard,
        accent: "tutor",
        description: "Your learning overview",
      },
      {
        title: "AI Tutor",
        to: "/tutor",
        icon: Bot,
        accent: "tutor",
        description: "Ask anything, explained at your level",
      },
      {
        title: "Study From My Book",
        to: "/book",
        icon: BookOpen,
        accent: "book",
        description: "Upload a chapter and learn from it",
      },
    ],
  },
  {
    label: "Practice",
    items: [
      {
        title: "Exam Solver",
        to: "/solver",
        icon: FileQuestion,
        accent: "solver",
        description: "Snap a question paper, get worked solutions",
      },
      {
        title: "Practice Papers",
        to: "/practice",
        icon: ClipboardList,
        accent: "practice",
        description: "Fresh papers tuned to your syllabus",
      },
      {
        title: "Paper Checking",
        to: "/practice/check",
        icon: ScanSearch,
        accent: "practice",
        description: "Upload handwritten answers for AI marking",
        sub: true,
      },
      {
        title: "Viva Mode",
        to: "/viva",
        icon: Mic,
        accent: "viva",
        description: "Rehearse oral exams with an AI examiner",
      },
      {
        title: "Coding",
        to: "/coding",
        icon: Code2,
        accent: "coding",
        description: "Solve problems with hints, not answers",
      },
    ],
  },
  {
    label: "Create",
    items: [
      {
        title: "Diagrams",
        to: "/diagrams",
        icon: Workflow,
        accent: "diagrams",
        description: "Flowcharts and concept maps in seconds",
      },
      {
        title: "PPT Maker",
        to: "/ppt",
        icon: Presentation,
        accent: "ppt",
        description: "Turn a topic into a clean slide deck",
      },
    ],
  },
  {
    label: "Track",
    items: [
      {
        title: "Progress",
        to: "/progress",
        icon: TrendingUp,
        accent: "progress",
        description: "Mastery, streaks and weak spots",
      },
    ],
  },
];

export const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);

const byPath = (to: string) => ALL_NAV.find((n) => n.to === to)!;

export const TOOLS: NavItem[] = [
  ...["/tutor", "/solver", "/book", "/practice", "/diagrams", "/ppt", "/coding", "/viva"].map(
    byPath,
  ),
  {
    title: "Notes AI",
    to: "/tutor",
    icon: NotebookPen,
    accent: "notes",
    description: "Crisp revision notes from any topic",
  },
];

export const titleFor = (path: string) =>
  path === "/settings" ? "Settings" : (ALL_NAV.find((n) => n.to === path)?.title ?? "EduAI");
