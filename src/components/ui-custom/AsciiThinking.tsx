import { useEffect, useRef } from "react";
import { useUiStore } from "@/store/useUiStore";

const CHARS = ".:-=+*#%@";
const SIZE = 88;
const COUNT = 44;

export function AsciiThinking({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useUiStore((state) => state.reduceMotion);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    let visible = true;
    let frame = 0;
    let foreground = getComputedStyle(root).getPropertyValue("--foreground").trim();
    let accent = getComputedStyle(root).getPropertyValue("--primary").trim();
    const fontSize = 9;

    const draw = (time: number) => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const bounds = canvas.getBoundingClientRect();
      const width = bounds.width || SIZE;
      const height = bounds.height || SIZE;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;

      const reduced = reduceMotion || mediaQuery.matches || root.dataset["reduceMotion"] === "true";
      const progress = reduced ? 0 : time * 0.001;
      const radius = Math.min(width, height) * 0.34;
      const centerX = width / 2;
      const centerY = height / 2;
      for (let index = 0; index < COUNT; index++) {
        const angle = (index / COUNT) * Math.PI * 2 + progress * 0.18;
        const ripple = reduced ? 0 : Math.sin(angle * 3 + progress * 1.6) * 2.2;
        const x = centerX + Math.cos(angle) * (radius + ripple);
        const y = centerY + Math.sin(angle) * (radius + ripple);
        const shimmer = reduced ? 0.5 : (Math.sin(index * 1.7 - progress * 4) + 1) / 2;
        context.globalAlpha = 0.38 + shimmer * 0.62;
        context.fillStyle = shimmer > 0.76 ? accent : foreground;
        context.fillText(CHARS[Math.floor(shimmer * (CHARS.length - 1))] ?? ".", x, y);
      }
      context.globalAlpha = 1;
    };

    const animate = (time: number) => {
      if (!visible) return;
      draw(time);
      if (!reduceMotion && !mediaQuery.matches && root.dataset["reduceMotion"] !== "true") {
        frame = window.requestAnimationFrame(animate);
      }
    };

    const redraw = () => {
      foreground = getComputedStyle(root).getPropertyValue("--foreground").trim();
      accent = getComputedStyle(root).getPropertyValue("--primary").trim();
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(animate);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      window.cancelAnimationFrame(frame);
      if (visible) frame = window.requestAnimationFrame(animate);
    });
    observer.observe(canvas);
    const themeObserver = new MutationObserver(redraw);
    themeObserver.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-reduce-motion"],
    });
    mediaQuery.addEventListener("change", redraw);
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      themeObserver.disconnect();
      mediaQuery.removeEventListener("change", redraw);
    };
  }, [reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      role="img"
      aria-label="AI is thinking"
      className={className}
      style={{ width: SIZE, height: SIZE, color: "var(--foreground)" }}
    />
  );
}
