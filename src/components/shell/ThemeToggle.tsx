import { Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { useUiStore, resolvedTheme } from "@/store/useUiStore";
import { cn } from "@/lib/utils";

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const { theme, setTheme, hydrated } = useUiStore();
  const isDark = hydrated && resolvedTheme(theme) === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "w-10 justify-center px-0" : "w-full",
      )}
    >
      <motion.span
        key={isDark ? "d" : "l"}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </motion.span>
      {!compact && <span>{isDark ? "Dark mode" : "Light mode"}</span>}
    </button>
  );
}
