import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import { motion, animate, useInView, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Accent } from "@/lib/nav";
import { getLevel, type LevelId } from "@/store/useUserStore";

/* ---------- GradientButton ---------- */
type BtnVariant = "primary" | "secondary" | "ghost";
export function GradientButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        size === "sm" && "h-11 px-3 text-base md:h-9 md:text-sm",
        size === "md" && "h-11 px-4 text-base md:h-10 md:text-sm",
        size === "lg" && "h-12 px-6 text-base",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary-hover",
        variant === "secondary" && "border bg-card text-foreground hover:bg-muted",
        variant === "ghost" && "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------- SoftCard ---------- */
export function SoftCard({
  className,
  interactive,
  children,
  ...props
}: HTMLMotionProps<"div"> & { interactive?: boolean }) {
  return (
    <motion.div
      {...props}
      transition={{ duration: 0.15 }}
      className={cn(
        "rounded-2xl border bg-card text-card-foreground transition-colors duration-200",
        interactive && "hover:bg-muted/50",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

/* ---------- FeatureIcon ---------- */
export function FeatureIcon({
  icon: Icon,
  accent,
  size = "md",
  className,
}: {
  icon: LucideIcon;
  accent: Accent;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const ic = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        dims,
        className,
      )}
      style={{ background: `var(--${accent}-soft)`, color: `var(--${accent})` }}
    >
      <Icon className={ic} />
    </span>
  );
}

/* ---------- LevelBadge ---------- */
export function LevelBadge({ level, className }: { level: LevelId; className?: string }) {
  const meta = getLevel(level);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-card/70 px-2.5 py-0.5 text-xs font-medium text-foreground backdrop-blur",
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

/* ---------- SectionHeader / PageHeader ---------- */
export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  icon,
  accent,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  accent?: Accent;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        {icon && accent && <FeatureIcon icon={icon} accent={accent} size="lg" />}
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ---------- EmptyState ---------- */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  accent = "tutor",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  accent?: Accent;
}) {
  return (
    <SoftCard className="flex flex-col items-start gap-3 rounded-2xl bg-muted p-6">
      <div>
        <FeatureIcon icon={Icon} accent={accent} size="lg" />
      </div>
      <h3 className="text-xl font-semibold">{title}</h3>
      {description && <p className="max-w-md text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </SoftCard>
  );
}

/* ---------- ProgressRing ---------- */
export function ProgressRing({
  value,
  size = 72,
  stroke = 7,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          stroke="var(--muted)"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          stroke="var(--primary)"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * Math.min(100, value)) / 100 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="absolute text-sm font-semibold">
        {label ?? (
          <>
            <AnimatedNumber value={value} />%
          </>
        )}
      </span>
    </div>
  );
}

/* ---------- ProgressBar ---------- */
export function ProgressBar({
  value,
  color = "var(--primary)",
  className,
}: {
  value: number;
  color?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/* ---------- AnimatedNumber ---------- */
export function AnimatedNumber({ value, duration = 0.25 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const prev = useRef(0);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, inView, reduce, duration]);
  return (
    <span ref={ref} className="tabular-nums">
      {display.toLocaleString()}
    </span>
  );
}

/* ---------- SegmentedControl ---------- */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  id,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  id: string;
}) {
  return (
    <div role="tablist" className="inline-flex rounded-xl bg-muted p-1">
      {options.map((o) => (
        <button
          key={o}
          role="tab"
          aria-selected={value === o}
          onClick={() => onChange(o)}
          className={cn(
            "relative rounded-lg px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === o && (
            <motion.span
              layoutId={`seg-${id}`}
              className="absolute inset-x-0 bottom-0 h-0.5 bg-primary"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          <span className="relative">{o}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Chip ---------- */
export function Chip({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary border-b-2 bg-transparent text-primary"
          : "bg-card text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/* ---------- CardSkeleton ---------- */
export function Shimmer({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}
export function CardSkeleton({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-6", className)}>
      <Shimmer className="h-10 w-10 rounded-xl" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Shimmer
            key={i}
            className={cn("h-3", i === 0 ? "w-2/3" : i === lines - 1 ? "w-1/2" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}

export { StickyActionBar } from "./StickyActionBar";
