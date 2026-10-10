import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { Check, ArrowLeft, ArrowRight } from "lucide-react";
import {
  LEVELS,
  SUBJECTS,
  useUserStore,
  DEFAULT_LEVEL,
  DEFAULT_SUBJECT,
  type LevelId,
} from "@/store/useUserStore";
import { GradientButton, Chip } from "@/components/ui-custom";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { initials } from "./profile-utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function Onboarding() {
  const store = useUserStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(store.name);
  const [level, setLevel] = useState<LevelId | null>(store.levelSet ? store.level : null);
  const [subjects, setSubjects] = useState<string[]>(() =>
    store.interests.filter((subject) => (SUBJECTS as readonly string[]).includes(subject)),
  );
  const [otherSubject, setOtherSubject] = useState(
    () =>
      store.interests.find((subject) => !(SUBJECTS as readonly string[]).includes(subject)) ?? "",
  );
  const [otherSelected, setOtherSelected] = useState(Boolean(otherSubject));

  const finish = () => {
    // If "Other" is selected but left empty, fall back to DEFAULT_SUBJECT
    const customSubject = otherSelected ? otherSubject.trim() || DEFAULT_SUBJECT : "";
    const selectedSubjects = [
      ...subjects,
      ...(customSubject && customSubject !== DEFAULT_SUBJECT ? [customSubject] : []),
    ];
    // level===null means user picked "Default" — keep levelSet:false so the app shows Default everywhere
    store.set({
      name: name.trim(),
      level: level ?? DEFAULT_LEVEL,
      levelSet: level !== null,
      interests: selectedSubjects,
      subject: customSubject || subjects[0] || DEFAULT_SUBJECT,
      onboarded: true,
    });
    navigate({ to: "/" });
  };

  /** "Skip for now" — sets sensible defaults so nothing blocks the user. */
  const skipNow = () => {
    store.set({
      name: name.trim(),
      level: DEFAULT_LEVEL,
      levelSet: false,
      interests: [],
      subject: DEFAULT_SUBJECT,
      onboarded: true,
    });
    navigate({ to: "/" });
  };
  const next = () => {
    if (step === 2) finish();
    else setStep(step + 1);
  };

  const toggle = (s: string) =>
    setSubjects((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <Dialog open>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto rounded-2xl border bg-card p-6 sm:p-10 [&>button]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">Set up EduAI</DialogTitle>
        <DialogDescription className="sr-only">
          Set up your profile, learning level, and subjects.
        </DialogDescription>
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="relative w-full"
        >
          <div className="mb-8 flex items-center justify-between">
            <Logo />
            <div className="flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ width: i === step ? 28 : 8 }}
                  className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-muted")}
                />
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22 }}
              className="min-h-[300px]"
            >
              {step === 0 && (
                <div>
                  <h2 className="text-2xl font-bold sm:text-3xl">What should we call you?</h2>
                  <p className="mt-2 text-muted-foreground">Your tutor will greet you by name.</p>
                  <div className="mt-10 flex flex-col items-center gap-6">
                    <motion.div
                      key={initials(name)}
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                      className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-3xl font-bold text-primary-foreground"
                    >
                      {initials(name)}
                    </motion.div>
                    <input
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      maxLength={40}
                      aria-label="Your name"
                      className="h-12 w-full max-w-sm rounded-xl border bg-background px-4 text-center text-lg outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
                    />
                  </div>
                </div>
              )}
              {step === 1 && (
                <div>
                  <h2 className="text-2xl font-bold sm:text-3xl">Pick your level</h2>
                  <p className="mt-2 text-muted-foreground">
                    This helps tailor explanations. You can change it anytime.
                  </p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setLevel(null)}
                      aria-pressed={level === null}
                      className={cn(
                        "relative flex items-start gap-3 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        level === null
                          ? "border-primary bg-accent-soft text-primary"
                          : "hover:bg-muted",
                      )}
                    >
                      <span>
                        <span className="block font-semibold">Default</span>
                        <span className="text-sm text-muted-foreground">No class chosen yet</span>
                      </span>
                      {level === null && <Check className="h-5 w-5 text-primary" />}
                    </button>
                    {LEVELS.map((l) => {
                      const sel = l.id === level;
                      return (
                        <button
                          key={l.id}
                          onClick={() => setLevel(l.id)}
                          aria-pressed={sel}
                          className={cn(
                            "relative flex items-start gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            sel ? "border-primary bg-accent-soft text-primary" : "hover:bg-muted",
                            l.id === "grad" && "sm:col-span-2",
                          )}
                        >
                          <span className="flex-1">
                            <span className="block font-semibold">{l.label}</span>
                            <span className="text-sm text-muted-foreground">{l.style}</span>
                          </span>
                          <AnimatePresence>
                            {sel && (
                              <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0 }}
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                              >
                                <Check className="h-4 w-4" />
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {step === 2 && (
                <div>
                  <h2 className="text-2xl font-bold sm:text-3xl">What are you studying?</h2>
                  <p className="mt-2 text-muted-foreground">Choose one or more subjects.</p>
                  <div className="mt-8 flex flex-wrap gap-2.5">
                    {SUBJECTS.map((s) => (
                      <Chip key={s} selected={subjects.includes(s)} onClick={() => toggle(s)}>
                        {subjects.includes(s) && <Check className="h-4 w-4" />}
                        {s}
                      </Chip>
                    ))}
                    <Chip
                      selected={otherSelected}
                      onClick={() => setOtherSelected((selected) => !selected)}
                    >
                      {otherSelected && <Check className="h-4 w-4" />}
                      Other
                    </Chip>
                  </div>
                  {otherSelected && (
                    <label
                      className="mt-4 block space-y-1.5 text-sm font-medium"
                      htmlFor="onboarding-other-subject"
                    >
                      Enter subject
                      <input
                        id="onboarding-other-subject"
                        autoFocus
                        value={otherSubject}
                        maxLength={80}
                        onChange={(event) => setOtherSubject(event.target.value)}
                        placeholder="Type your subject"
                        className="h-11 w-full rounded-xl border bg-background px-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </label>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {step > 0 && (
                <GradientButton variant="ghost" onClick={() => setStep(step - 1)}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </GradientButton>
              )}
              <GradientButton variant="ghost" onClick={skipNow}>
                Skip for now
              </GradientButton>
            </div>
            <GradientButton size="lg" onClick={next}>
              {step === 2 ? "Finish" : "Next"}
              <ArrowRight className="h-4 w-4" />
            </GradientButton>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
