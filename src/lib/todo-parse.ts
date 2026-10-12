import type { TodoItemInput } from "./types";

export interface ParsedTodoResult {
  items: TodoItemInput[];
  warnings: string[];
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

export function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isValidIsoDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function computeTargetDate(token: string, hasNext: boolean, today: Date): string | null {
  const lower = token.toLowerCase();
  if (isValidIsoDate(lower)) {
    return lower;
  }
  if (lower === "today") {
    return formatIsoDate(today);
  }
  if (lower === "tomorrow" || lower === "tmrw") {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    return formatIsoDate(d);
  }
  if (lower in WEEKDAYS) {
    const targetDay = WEEKDAYS[lower];
    if (targetDay !== undefined) {
      const currentDay = today.getDay();
      let diff = (targetDay - currentDay + 7) % 7;
      if (diff === 0 && hasNext) {
        diff = 7;
      }
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
      return formatIsoDate(d);
    }
  }
  return null;
}

const DATE_WORDS =
  "today|tomorrow|tmrw|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|sunday|sun|\\d{4}-\\d{2}-\\d{2}";

const START_DATE_RE = new RegExp(
  `^(?:(?:by|on|due|next)\\s+)?(?:(next)\\s+)?(${DATE_WORDS})(?:\\s*[:-]\\s*|\\s+|$)`,
  "i",
);

const END_DATE_RE = new RegExp(
  `(?:\\s*[:-]\\s*|\\s+)(?:(?:by|on|due|next)\\s+)?(?:(next)\\s+)?(${DATE_WORDS})$`,
  "i",
);

/**
 * Extracts a due date from the start or end of a candidate string.
 * If extracted and non-empty text remains, the date phrase is removed from text.
 * Otherwise, the original text is preserved.
 */
function extractDueDate(input: string, today: Date): { text: string; dueDate?: string } {
  const text = input.trim();

  // Try matching at the end first (most common: "Physics tomorrow", "Math by Friday")
  const endMatch = text.match(END_DATE_RE);
  if (endMatch) {
    const hasNext = Boolean(endMatch[1]) || /\bnext\s+/i.test(endMatch[0]);
    const token = endMatch[2] ?? "";
    const dueDate = computeTargetDate(token, hasNext, today);
    if (dueDate) {
      const candidateText = text.slice(0, endMatch.index).trim();
      // Remove trailing prepositions like "by", "on" if left behind
      const cleanedCandidate = candidateText.replace(/\s+(?:by|on|due)$/i, "").trim();
      if (cleanedCandidate.length > 0) {
        return { text: cleanedCandidate, dueDate };
      }
      return { text, dueDate };
    }
  }

  // Try matching at the start ("Tomorrow: Revise physics", "By Friday Math paper")
  const startMatch = text.match(START_DATE_RE);
  if (startMatch) {
    const hasNext = Boolean(startMatch[1]) || /^(?:next\b)/i.test(startMatch[0]);
    const token = startMatch[2] ?? "";
    const dueDate = computeTargetDate(token, hasNext, today);
    if (dueDate) {
      const candidateText = text.slice(startMatch[0].length).trim();
      if (candidateText.length > 0) {
        return { text: candidateText, dueDate };
      }
      return { text, dueDate };
    }
  }

  return { text };
}

/**
 * Parses user input for todo tasks.
 * Splits on newlines, semicolons, and commas (without splitting on "and" or "then").
 * Strips leading bullets / numbering.
 * Extracts start/end due dates.
 * Deduplicates case-insensitively and enforces limits (50 items, 300 chars).
 */
export function parseTodoInput(raw: string, today: Date = new Date()): ParsedTodoResult {
  const warnings: string[] = [];
  if (!raw || !raw.trim()) {
    return { items: [], warnings };
  }

  // Split on newlines, semicolons, and commas
  const rawSegments = raw.split(/[\r\n;,]+/);
  const items: TodoItemInput[] = [];
  const seen = new Set<string>();

  let hadDuplicates = false;
  let hadTruncated = false;
  let hadDroppedOverMax = false;

  for (const seg of rawSegments) {
    // Strip leading bullets / numbering / checkbox brackets
    let cleaned = seg.trim();
    while (true) {
      const next = cleaned.replace(/^\s*(?:[-*•+–—]|\[[ xX]?\]|\d+[.)])\s*/, "");
      if (next === cleaned) break;
      cleaned = next;
    }

    // Collapse internal whitespace
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;

    // Extract due date
    const { text, dueDate } = extractDueDate(cleaned, today);
    let finalText = text.replace(/\s+/g, " ").trim();
    if (!finalText) continue;

    if (finalText.length > 300) {
      finalText = finalText.slice(0, 300).trim();
      hadTruncated = true;
    }

    const lowerKey = finalText.toLowerCase();
    if (seen.has(lowerKey)) {
      hadDuplicates = true;
      continue;
    }

    if (items.length >= 50) {
      hadDroppedOverMax = true;
      continue;
    }

    seen.add(lowerKey);
    items.push({
      text: finalText,
      ...(dueDate ? { due_date: dueDate } : {}),
    });
  }

  if (hadTruncated) {
    warnings.push("Some tasks were shortened to 300 characters.");
  }
  if (hadDuplicates) {
    warnings.push("Duplicate tasks were removed.");
  }
  if (hadDroppedOverMax) {
    warnings.push("Only the first 50 tasks were kept.");
  }

  return { items, warnings };
}
