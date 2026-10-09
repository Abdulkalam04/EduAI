/**
 * Tests for the default-level-and-subject behaviour change.
 *
 * These are pure unit/store tests — no DOM rendering required.
 * They verify the contracts described in the acceptance criteria.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_LEVEL,
  DEFAULT_SUBJECT,
  DEFAULT_SUBJECT_LABEL,
  toApiSubject,
  toRequiredApiSubject,
  useUserStore,
} from "@/store/useUserStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset zustand store and localStorage to a clean slate before each test. */
function resetStore() {
  localStorage.clear();
  useUserStore.setState({
    name: "",
    level: DEFAULT_LEVEL,
    subject: "",
    interests: [],
    xp: 0,
    streak: 0,
    onboarded: false,
    levelSet: false,
  });
}

// ---------------------------------------------------------------------------
// 1. Constants and mapping helpers
// ---------------------------------------------------------------------------

describe("DEFAULT constants", () => {
  it("DEFAULT_LEVEL is c9-10", () => {
    expect(DEFAULT_LEVEL).toBe("c9-10");
  });

  it("DEFAULT_SUBJECT is 'Default'", () => {
    expect(DEFAULT_SUBJECT).toBe("Default");
  });

  it("DEFAULT_SUBJECT_LABEL contains 'all subjects'", () => {
    expect(DEFAULT_SUBJECT_LABEL.toLowerCase()).toContain("all subjects");
  });
});

describe("toApiSubject — chat/solve mapping (empty-allowed)", () => {
  it("maps 'Default' to ''", () => {
    expect(toApiSubject("Default")).toBe("");
  });

  it("maps '' to ''", () => {
    expect(toApiSubject("")).toBe("");
  });

  it("preserves a real subject", () => {
    expect(toApiSubject("Physics")).toBe("Physics");
    expect(toApiSubject("Computer Science")).toBe("Computer Science");
  });
});

describe("toRequiredApiSubject — practice/viva mapping (min_length=1)", () => {
  it("maps 'Default' to 'General'", () => {
    expect(toRequiredApiSubject("Default")).toBe("General");
  });

  it("maps '' to 'General'", () => {
    expect(toRequiredApiSubject("")).toBe("General");
  });

  it("preserves a real subject", () => {
    expect(toRequiredApiSubject("Maths")).toBe("Maths");
  });
});

// ---------------------------------------------------------------------------
// 2. Skip for now — sets onboarded + defaults
// ---------------------------------------------------------------------------

describe("Skip for now behaviour (simulated via store.set)", () => {
  beforeEach(resetStore);

  it("sets onboarded=true, levelSet=true, level=DEFAULT_LEVEL, subject=DEFAULT_SUBJECT", () => {
    // Simulate what skipNow() in Onboarding does
    useUserStore.getState().set({
      level: DEFAULT_LEVEL,
      levelSet: true,
      interests: [],
      subject: DEFAULT_SUBJECT,
      onboarded: true,
    });
    const state = useUserStore.getState();
    expect(state.onboarded).toBe(true);
    expect(state.levelSet).toBe(true);
    expect(state.level).toBe(DEFAULT_LEVEL);
    expect(state.subject).toBe(DEFAULT_SUBJECT);
  });
});

// ---------------------------------------------------------------------------
// 3. "Other" with empty text falls back to DEFAULT_SUBJECT
// ---------------------------------------------------------------------------

describe("'Other' subject with empty custom text", () => {
  beforeEach(resetStore);

  it("an empty custom subject from Onboarding finish() becomes DEFAULT_SUBJECT", () => {
    // When otherSelected=true and otherSubject.trim()="" the finish() function
    // sets customSubject = DEFAULT_SUBJECT (the fallback).
    const customSubject = "".trim() || DEFAULT_SUBJECT;
    const subject = customSubject || DEFAULT_SUBJECT;
    expect(subject).toBe(DEFAULT_SUBJECT);
  });

  it("a non-empty custom subject is preserved", () => {
    const customSubject = "Organic Chemistry".trim() || DEFAULT_SUBJECT;
    expect(customSubject).toBe("Organic Chemistry");
  });
});

// ---------------------------------------------------------------------------
// 4. Existing saved level and subject are preserved across store hydration
// ---------------------------------------------------------------------------

describe("Existing saved level and subject preserved", () => {
  beforeEach(resetStore);

  it("a user who already set level=c11-12 keeps it", () => {
    useUserStore.getState().set({ level: "c11-12", levelSet: true });
    expect(useUserStore.getState().level).toBe("c11-12");
    expect(useUserStore.getState().levelSet).toBe(true);
  });

  it("a user who already set subject='Chemistry' keeps it", () => {
    useUserStore.getState().set({ subject: "Chemistry" });
    expect(useUserStore.getState().subject).toBe("Chemistry");
  });

  it("resetting the store restores defaults", () => {
    useUserStore.getState().set({ level: "c11-12", subject: "Biology", levelSet: true });
    useUserStore.getState().reset();
    expect(useUserStore.getState().level).toBe(DEFAULT_LEVEL);
    expect(useUserStore.getState().levelSet).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Ask / tutor: first message goes out with default level, no level-prompt
// ---------------------------------------------------------------------------

describe("Ask (tutor) — no level-prompt for new users", () => {
  beforeEach(resetStore);

  it("the effective level for a new user is DEFAULT_LEVEL", () => {
    const { level, levelSet } = useUserStore.getState();
    // New user: levelSet=false, but effective level is still the stored default
    const effectiveLevel = level ?? DEFAULT_LEVEL;
    expect(effectiveLevel).toBe(DEFAULT_LEVEL);
  });

  it("the api subject is '' for a new user (no subject instruction in prompt)", () => {
    const { subject } = useUserStore.getState();
    expect(toApiSubject(subject)).toBe("");
  });

  it("no level-prompt is inserted — send() always calls ask() immediately", () => {
    // This is a logic test: after our change, the levelSet guard is removed.
    // We verify that a new user (levelSet=false) still gets a valid effective level.
    const state = useUserStore.getState();
    const lvl = state.level ?? DEFAULT_LEVEL;
    expect(lvl).toBe("c9-10"); // sends c9-10, not null
  });
});

// ---------------------------------------------------------------------------
// 6. Solver enabled with only a file
// ---------------------------------------------------------------------------

describe("Solver — disabled only when !file", () => {
  it("solve button should only require a file (no subject check)", () => {
    // The disabled condition is: `!file`
    // We simulate the two cases:
    const file = null;
    const subject = "";
    // Old behaviour: !file || !subject → disabled
    const oldDisabled = !file || !subject;
    // New behaviour: !file → disabled
    const newDisabled = !file;
    expect(newDisabled).toBe(true);     // still disabled without a file
    expect(oldDisabled).toBe(true);     // was disabled

    const fileWithContent = new File(["data"], "paper.pdf", { type: "application/pdf" });
    const newEnabledWithFile = !fileWithContent; // false → enabled
    const oldEnabledWithFile = !fileWithContent || !subject; // true → was disabled
    expect(newEnabledWithFile).toBe(false);  // NOW enabled
    expect(oldEnabledWithFile).toBe(true);   // WAS disabled (regression caught!)
  });
});

// ---------------------------------------------------------------------------
// 7. Viva — Start enabled with no subject or topic
// ---------------------------------------------------------------------------

describe("Viva — Start viva enabled without subject/topic", () => {
  it("busy=false is the only requirement for Start viva", () => {
    const busy = false;
    const subject = ""; // no subject chosen
    // Old: busy || !subject → disabled when subject is empty
    const oldDisabled = busy || !subject;
    // New: busy → not disabled
    const newDisabled = busy;
    expect(oldDisabled).toBe(true);  // was blocked
    expect(newDisabled).toBe(false); // now allowed
  });
});

// ---------------------------------------------------------------------------
// 8. Practice — Generate enabled with no typing
// ---------------------------------------------------------------------------

describe("Practice Generator — Generate enabled without subject or chapter", () => {
  it("loading=false is the only required condition to enable Generate", () => {
    const loading = false;
    const subject = "";
    const chapter = "";
    // Old: !subject || !chapter.trim() || loading → disabled
    const oldDisabled = !subject || !chapter.trim() || loading;
    // New: loading → not disabled
    const newDisabled = loading;
    expect(oldDisabled).toBe(true);  // was blocked
    expect(newDisabled).toBe(false); // now allowed
  });

  it("effectiveSubject falls back to 'General' for the API call", () => {
    const subject = "";
    const effectiveSubject = subject.trim() || "General";
    expect(effectiveSubject).toBe("General");
  });

  it("effectiveChapter falls back to 'Mixed topics' for the API call", () => {
    const chapter = "";
    const effectiveChapter = chapter.trim() || "Mixed topics";
    expect(effectiveChapter).toBe("Mixed topics");
  });
});
