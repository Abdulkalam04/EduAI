import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function MobileStickyAction({
  children,
  tabBarHidden = false,
  className,
}: {
  children: ReactNode;
  tabBarHidden?: boolean;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-x-0 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur md:hidden",
        tabBarHidden
          ? "bottom-[env(safe-area-inset-bottom)]"
          : "bottom-[calc(3.5rem+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
