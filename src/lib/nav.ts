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
  type LucideIcon,
} from "lucide-react";

export type Accent =
  "tutor" | "solver" | "book" | "practice" | "diagrams" | "ppt" | "coding" | "viva" | "progress";

export interface NavItem {
  title: string;
  to: string;
  icon: LucideIcon;
  accent: Accent;
  description: string;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Learn",
    items: [
      {
        title: "Home",
        to: "/",
        icon: LayoutDashboard,
        accent: "tutor",
        description: "Your learning home",
      },
      {
        title: "Ask",
        to: "/tutor",
        icon: Bot,
        accent: "tutor",
        description: "Ask a question and get a clear explanation",
      },
      {
        title: "Study",
        to: "/study",
        icon: BookOpen,
        accent: "book",
        description: "Choose a tool for what you want to learn",
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
        description: "See your study activity and progress",
      },
    ],
  },
];

export const ALL_NAV = NAV_GROUPS.flatMap((group) => group.items);

export const TOOLS: NavItem[] = [
  {
    title: "Learn from my book",
    to: "/book",
    icon: BookOpen,
    accent: "book",
    description: "Ask questions about a book or notes you upload.",
  },
  {
    title: "Solve a question paper",
    to: "/solver",
    icon: FileQuestion,
    accent: "solver",
    description: "Upload a paper and work through its solutions.",
  },
  {
    title: "Practice for my exam",
    to: "/practice",
    icon: ClipboardList,
    accent: "practice",
    description: "Make a practice paper and check your answers.",
  },
  {
    title: "Practise speaking",
    to: "/viva",
    icon: Mic,
    accent: "viva",
    description: "Practise spoken answers one question at a time.",
  },
  {
    title: "Learn coding",
    to: "/coding",
    icon: Code2,
    accent: "coding",
    description: "Solve coding problems with helpful hints.",
  },
  {
    title: "Make a diagram",
    to: "/diagrams",
    icon: Workflow,
    accent: "diagrams",
    description: "Turn a topic into a clear visual diagram.",
  },
  {
    title: "Make a presentation",
    to: "/ppt",
    icon: Presentation,
    accent: "ppt",
    description: "Create slides to explain a topic.",
  },
];

export const titleFor = (path: string) =>
  path === "/settings"
    ? "Settings"
    : (ALL_NAV.find((item) => item.to === path)?.title ??
      TOOLS.find((item) => item.to === path)?.title ??
      "EduAI");
