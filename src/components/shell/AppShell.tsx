import { usePracticeStore } from "@/store/usePracticeStore";
import { useCreativeStore } from "@/store/useCreativeStore";
import { useLearningStore } from "@/store/useLearningStore";
import { useBookStore } from "@/store/useBookStore";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { MotionConfig } from "framer-motion";
import { Toaster } from "@/components/ui/sonner";
import { useUiStore, applyTheme, applyUiPreferences } from "@/store/useUiStore";
import { useUserStore } from "@/store/useUserStore";
import { useChatStore } from "@/store/useChatStore";
import { TopBar } from "./TopBar";
import { MobileNav } from "./MobileNav";
import { Onboarding } from "./Onboarding";

const Sidebar = lazy(() => import("./Sidebar").then((module) => ({ default: module.Sidebar })));
const CommandPalette = lazy(() =>
  import("./CommandPalette").then((module) => ({ default: module.CommandPalette })),
);

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { theme, hydrated, reduceMotion, accent, fontSize } = useUiStore();
  const paletteOpen = useUiStore((s) => s.paletteOpen);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const onboarded = useUserStore((s) => s.onboarded);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    window.localStorage.removeItem("useMock");
    void Promise.all([
      useUiStore.persist.rehydrate(),
      useUserStore.persist.rehydrate(),
      useChatStore.persist.rehydrate(),
      useBookStore.persist.rehydrate(),
      usePracticeStore.persist.rehydrate(),
      useCreativeStore.persist.rehydrate(),
      useLearningStore.persist.rehydrate(),
    ]).finally(() => {
      useUiStore.setState({ hydrated: true });
    });
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(!useUiStore.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  useEffect(() => {
    if (!hydrated) return;
    const applyAppearance = () => {
      applyTheme(theme);
      applyUiPreferences({ accent, reduceMotion, fontSize });
    };
    applyAppearance();
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applyAppearance);
    return () => media.removeEventListener("change", applyAppearance);
  }, [accent, fontSize, hydrated, reduceMotion, theme]);

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      <div className="flex min-h-dvh w-full">
        {desktop && (
          <Suspense fallback={<div className="hidden w-[264px] shrink-0 md:block" />}>
            <Sidebar />
          </Suspense>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className={path === "/tutor" ? "flex-1 pb-0 pt-0" : "flex-1 pb-24 pt-0 md:pb-8"}>
            <div
              key={path}
              className={`mx-auto w-full ${["/coding", "/diagrams", "/ppt"].includes(path) ? "max-w-[1500px]" : "max-w-[1200px]"}`}
            >
              {children}
            </div>
          </main>
        </div>
        <MobileNav />
        {paletteOpen && (
          <Suspense fallback={null}>
            <CommandPalette />
          </Suspense>
        )}
        {hydrated && !onboarded && <Onboarding />}
        <Toaster />
      </div>
    </MotionConfig>
  );
}
