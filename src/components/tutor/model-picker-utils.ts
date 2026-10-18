export function formatTtft(ms: number | null) {
  if (ms === null || !Number.isFinite(ms)) return null;
  const validMs = Math.max(0, ms);
  if (validMs < 100) return "<0.1s";
  return `~${(Math.round(validMs / 100) / 10).toFixed(1)}s`;
}

export function modelProviderBadge(provider: string): string | null {
  if (provider === "mistral") return "Mistral";
  return null;
}
