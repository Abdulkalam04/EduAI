# EduAI – Personal AI Learning Companion (frontend shell + dashboard)

Build the full spec from the brief as a frontend-only app with mock data and a "Demo mode" pill.

## What you get
- Indigo→violet design system, Inter + Plus Jakarta Sans, light/dark toggle (system default, persisted, smooth transition).
- App shell: collapsible sidebar (264px ↔ 72px rail, persisted) with grouped links and animated active pill; sticky blurred top bar with title, search, Level + Subject dropdowns, avatar menu, Demo pill.
- Mobile: bottom tab bar (Home, Tutor, Solver, Practice, More) with a "More" bottom sheet.
- Command palette (Cmd/Ctrl+K): navigate, quick actions, toggle theme, change level.
- 4-step onboarding modal (welcome, name with initials avatar, level cards, subject chips, confetti finish).
- Dashboard: greeting hero (tone adapts to level), 4 animated stat cards, 9 tool cards, subject mastery + AI suggestion, recent activity timeline, "Today's plan" checklist that updates the progress ring.
- "Coming soon" pages for Tutor, Book, Solver, Practice, Viva, Coding, Diagrams, PPT, Progress, Settings, plus a styled 404.
- Motion: page fade/slide, 40ms staggers, card lift, press scale, skeletons, reduced-motion respected.

## Technical details
- Stack adaptation: TanStack Router (file routes in src/routes, one per page) instead of react-router; Tailwind v4 tokens in src/styles.css instead of index.css/tailwind config. Shell lives in __root.tsx.
- Add deps: framer-motion, zustand, canvas-confetti, shadcn command/dropdown/sheet/tooltip components.
- src/components/ui-custom/: GradientButton, SoftCard, FeatureIcon, LevelBadge, SectionHeader, EmptyState, ProgressRing, ProgressBar, AnimatedNumber, SegmentedControl, Chip, PageHeader, CardSkeleton.
- src/store/useUserStore.ts (zustand persist) with level metadata.
- src/lib/api.ts as sole backend gateway (apiUrl from localStorage / VITE_API_URL / localhost:8000, useMock flag, 600–1200ms mock delay); mocks in src/lib/mock/. Dashboard reads via TanStack Query with skeletons.
- Persisted UI state read after hydration to avoid SSR mismatches.
- Per-route head() metadata; record architecture rules in AGENTS.md.
