import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { Check, ArrowLeft, ArrowRight } from "lucide-react";
import { LEVELS, SUBJECTS, useUserStore, type LevelId } from "@/store/useUserStore";
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
  const [level, setLevel] = useState<LevelId>(store.level);
  const [subjects, setSubjects] = useState<string[]>(store.interests);

  const finish = () => {
    store.set({
      name: name.trim(),
      level,
      interests: subjects,
      subject: subjects[0] ?? "Maths",
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
        <DialogTitle className="sr-only">Welcome to EduAI</DialogTitle>
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
                  </div>
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
              <GradientButton variant="ghost" onClick={finish}>
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
