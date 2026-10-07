import { memo, useEffect, useId, useState, type ReactNode, isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { useUiStore } from "@/store/useUiStore";
import { renderMermaidSvg } from "@/lib/mermaid";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={label}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

export function Mermaid({ code, className }: { code: string; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const theme = useUiStore((s) => s.theme);
  const [systemDark, setSystemDark] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const actualTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  useEffect(() => {
    let alive = true;
    setSvg(null);
    setFailed(false);
    renderMermaidSvg(code, actualTheme, `m${id}${Date.now()}`)
      .then((rendered) => {
        if (alive) setSvg(rendered);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [code, actualTheme, id]);
  if (failed)
    return (
      <div
        role="alert"
        className="my-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm"
      >
        <p className="font-medium">This diagram couldn’t be rendered.</p>
        <pre className="md-pre mt-2 overflow-x-auto">
          <code>{code}</code>
        </pre>
      </div>
    );
  if (!svg)
    return <div className={`my-4 h-40 animate-pulse rounded-xl bg-muted ${className ?? ""}`} />;
  return (
    <div
      className={`my-4 flex justify-center overflow-auto rounded-xl border bg-card p-4 [&_svg]:max-w-full ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function Pre({ children, streaming }: { children?: ReactNode; streaming: boolean }) {
  const child = Array.isArray(children) ? children[0] : children;
  const className = isValidElement<{ className?: string }>(child)
    ? (child.props.className ?? "")
    : "";
  const lang = /language-(\w+)/.exec(className)?.[1];
  const raw = textOf(children).replace(/\n$/, "");
  if (lang === "mermaid" && !streaming) return <Mermaid code={raw} />;
  return (
    <div className="md-code group my-4 overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between border-b bg-muted px-3 py-1">
        <span className="text-xs font-medium text-muted-foreground">{lang ?? "code"}</span>
        <CopyButton text={raw} />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">{children}</pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { plainText: ["mermaid"], detect: false }]]}
        components={{
          pre: ({ children }) => <Pre streaming={streaming}>{children}</Pre>,
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-xl border">
              <table>{children}</table>
            </div>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
