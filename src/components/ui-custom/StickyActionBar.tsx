import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function StickyActionBar({
  children,
  tabBarHidden = false,
  showOnDesktop = false,
  className,
}: {
  children: ReactNode;
  tabBarHidden?: boolean;
  showOnDesktop?: boolean;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className={cn(
        "fixed left-4 right-4 z-30 mx-auto max-w-[760px]",
        showOnDesktop ? "md:block" : "md:hidden",
        tabBarHidden ? "sticky-action-offset-no-tabbar" : "sticky-action-offset",
      )}
      style={{
        bottom: tabBarHidden
          ? "calc(env(safe-area-inset-bottom) + var(--action-gap))"
          : "calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--action-gap))",
        ...(showOnDesktop ? { left: "calc(264px + 1rem)" } : {}),
      }}
    >
      <div className={cn("sticky-action-surface", className)}>{children}</div>
    </div>,
    document.body,
  );
}
