import { usePracticeStore } from "@/store/usePracticeStore";
import { useCreativeStore } from "@/store/useCreativeStore";
import { useLearningStore } from "@/store/useLearningStore";
import { useBookStore } from "@/store/useBookStore";
import { useEffect, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { motion, MotionConfig } from "framer-motion";
import { Toaster } from "@/components/ui/sonner";
import { useUiStore, applyTheme, applyUiPreferences } from "@/store/useUiStore";
import { useUserStore } from "@/store/useUserStore";
import { useChatStore } from "@/store/useChatStore";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileNav } from "./MobileNav";
import { CommandPalette } from "./CommandPalette";
import { Onboarding } from "./Onboarding";

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { theme, hydrated, reduceMotion, accent, fontSize } = useUiStore();
  const onboarded = useUserStore((s) => s.onboarded);

  useEffect(() => {
    void Promise.all([
      useUiStore.persist.rehydrate(),
      useUserStore.persist.rehydrate(),
      useChatStore.persist.rehydrate(),
      useBookStore.persist.rehydrate(),
      usePracticeStore.persist.rehydrate(),
      useCreativeStore.persist.rehydrate(),
      useLearningStore.persist.rehydrate(),
    ]).finally(() => useUiStore.setState({ hydrated: true }));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => applyTheme("system");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [theme, hydrated]);

  useEffect(() => {
    if (hydrated) applyUiPreferences({ accent, reduceMotion, fontSize });
  }, [accent, fontSize, hydrated, reduceMotion]);

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      <div className="flex min-h-screen w-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 pb-24 pt-0 md:pb-8">
            <motion.div
              key={path}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className={`mx-auto w-full ${["/coding", "/diagrams", "/ppt"].includes(path) ? "max-w-[1500px]" : "max-w-[1200px]"}`}
            >
              {children}
            </motion.div>
          </main>
        </div>
        <MobileNav />
        <CommandPalette />
        {hydrated && !onboarded && <Onboarding />}
        <Toaster />
      </div>
    </MotionConfig>
  );
}
