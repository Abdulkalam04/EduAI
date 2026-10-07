export async function renderMermaidSvg(
  code: string,
  theme: "light" | "dark",
  id = `diagram-${Date.now()}`,
): Promise<string> {
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === "dark" ? "dark" : "neutral",
    fontFamily: "Inter",
  });
  const rendered = await mermaid.render(id.replace(/[^a-zA-Z0-9_-]/g, ""), code);
  return rendered.svg;
}
