import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Mail, ShieldCheck } from "lucide-react";
import { GradientButton, SoftCard } from "@/components/ui-custom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

type AuthMode = "signin" | "signup" | "verify" | "forgot" | "reset";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function LoginPage() {
  const navigate = useNavigate();
  const {
    user,
    loading,
    signInEmail,
    signUpEmail,
    verifySignupCode,
    resendSignupCode,
    signInGoogle,
    requestPasswordReset,
    confirmPasswordReset,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!user) return;
    void navigate({ to: "/", replace: true });
  }, [navigate, user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((cur) => Math.max(0, cur - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const canSubmit = useMemo(() => {
    if (mode === "signin") return Boolean(isValidEmail(email) && password && !submitting);
    if (mode === "signup")
      return Boolean(
        name.trim() &&
        isValidEmail(email) &&
        password.length >= 8 &&
        confirmPassword === password &&
        !submitting,
      );
    if (mode === "verify") return Boolean(isValidEmail(email) && otp.trim() && !submitting);
    if (mode === "forgot") return Boolean(isValidEmail(email) && !submitting);
    if (mode === "reset")
      return Boolean(
        isValidEmail(email) &&
        otp.trim() &&
        newPassword.length >= 8 &&
        confirmPassword === newPassword &&
        !submitting,
      );
    return false;
  }, [confirmPassword, email, mode, name, newPassword, otp, password, submitting]);

  const clearStatus = () => {
    setError("");
    setSuccess("");
  };

  const handleSignin = async (event: FormEvent) => {
    event.preventDefault();
    clearStatus();
    if (!isValidEmail(email) || !password) return;
    setSubmitting(true);
    try {
      await signInEmail(email, password);
      await navigate({ to: "/", replace: true });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async (event: FormEvent) => {
    event.preventDefault();
    clearStatus();
    if (
      !name.trim() ||
      !isValidEmail(email) ||
      !password ||
      password.length < 8 ||
      confirmPassword !== password
    ) {
      setError("Please complete the form and use a password with at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const requiresConfirmation = await signUpEmail(name.trim(), email, password);
      if (requiresConfirmation) {
        setMode("verify");
        setSuccess("We sent a sign-up code to your email. Enter it below.");
        return;
      }

      setSuccess("Account created. Redirecting to your dashboard...");
      await navigate({ to: "/", replace: true });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to create your account.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    clearStatus();
    if (!otp.trim()) {
      setError("Enter the code sent to your email.");
      return;
    }
    setSubmitting(true);
    try {
      await verifySignupCode(email, otp.trim());
      setSuccess("Your account is confirmed. You are signed in.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "The code could not be verified.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (event: FormEvent) => {
    event.preventDefault();
    clearStatus();
    if (!isValidEmail(email)) return;
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      setMode("reset");
      setSuccess("If an account exists for that email, we sent a code. Check spam too.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to send the reset code.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (event: FormEvent) => {
    event.preventDefault();
    clearStatus();
    if (
      !isValidEmail(email) ||
      !otp.trim() ||
      !newPassword ||
      newPassword.length < 8 ||
      confirmPassword !== newPassword
    ) {
      setError("Enter the recovery code and a new password that matches the confirmation.");
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset(email, otp.trim(), newPassword);
      setSuccess("Your password was reset. Redirecting to your dashboard...");
      await navigate({ to: "/", replace: true });
    } catch (error) {
      setError(error instanceof Error ? error.message : "The password reset failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!isValidEmail(email) || cooldown > 0) return;
    clearStatus();
    try {
      if (mode === "verify") {
        await resendSignupCode(email);
      } else if (mode === "reset") {
        await requestPasswordReset(email);
      }
      setCooldown(60);
      setSuccess("A fresh code was sent.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "We couldn't resend the code right now.");
    }
  };

  const handleGoogle = async () => {
    clearStatus();
    setSubmitting(true);
    try {
      await signInGoogle();
      await navigate({ to: "/", replace: true });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Google sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const authHeader =
    mode === "signin"
      ? "Welcome back"
      : mode === "signup"
        ? "Create an account"
        : mode === "verify"
          ? "Verify your email"
          : mode === "forgot"
            ? "Reset your password"
            : "Choose a new password";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0F6B5C] text-lg font-bold text-white shadow-soft">
            E
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">EduAI</p>
            <h1 className="text-lg font-semibold">Study smarter</h1>
          </div>
        </div>

        <SoftCard className="rounded-3xl p-5 shadow-soft sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-2 rounded-xl border bg-muted/30 p-1">
            {[
              { id: "signin", label: "Sign in" },
              { id: "signup", label: "Create account" },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  clearStatus();
                  setMode(id as AuthMode);
                }}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${mode === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-[#0F6B5C]" />
            <span>{authHeader}</span>
          </div>

          <div aria-live="polite" className="min-h-6 text-sm">
            {error ? <p className="text-red-600 dark:text-red-400">{error}</p> : null}
            {success ? <p className="text-emerald-600 dark:text-emerald-400">{success}</p> : null}
          </div>

          {mode === "signin" && (
            <form onSubmit={handleSignin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="text-xs text-[#0F6B5C] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="signin-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="********"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-3 flex items-center text-muted-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <GradientButton type="submit" disabled={!canSubmit} className="w-full">
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                {submitting ? "Signing in..." : "Sign in"}
              </GradientButton>
            </form>
          )}

          {mode === "signup" && (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Full name</Label>
                <Input
                  id="signup-name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-3 flex items-center text-muted-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-confirm">Confirm password</Label>
                <Input
                  id="signup-confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                />
              </div>
              <GradientButton type="submit" disabled={!canSubmit} className="w-full">
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                {submitting ? "Creating account..." : "Create account"}
              </GradientButton>
            </form>
          )}

          {mode === "verify" && (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="verify-email">Email</Label>
                <Input
                  id="verify-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="verify-code">Code</Label>
                <Input
                  id="verify-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter one-time code"
                />
              </div>
              <GradientButton type="submit" disabled={!canSubmit} className="w-full">
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                {submitting ? "Verifying..." : "Verify code"}
              </GradientButton>
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0}
                className="w-full text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <GradientButton type="submit" disabled={!canSubmit} className="w-full">
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                {submitting ? "Sending..." : "Send reset code"}
              </GradientButton>
              <button
                type="button"
                onClick={() => {
                  clearStatus();
                  setMode("signin");
                }}
                className="w-full text-sm text-[#0F6B5C] hover:underline"
              >
                Back to sign in
              </button>
            </form>
          )}

          {mode === "reset" && (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-code">Code</Label>
                <Input
                  id="reset-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 6-10 digit code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-password">New password</Label>
                <div className="relative">
                  <Input
                    id="reset-password"
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-3 flex items-center text-muted-foreground"
                    onClick={() => setShowNewPassword((v) => !v)}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-confirm">Confirm new password</Label>
                <Input
                  id="reset-confirm"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                />
              </div>
              <GradientButton type="submit" disabled={!canSubmit} className="w-full">
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                {submitting ? "Updating..." : "Reset password"}
              </GradientButton>
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0}
                className="w-full text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearStatus();
                  setMode("signin");
                }}
                className="w-full text-sm text-[#0F6B5C] hover:underline"
              >
                Back to sign in
              </button>
            </form>
          )}

          <div className="mt-5 border-t pt-4">
            <button
              type="button"
              onClick={handleGoogle}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
            >
              <span className="text-base">G</span>
              Continue with Google
            </button>
          </div>
        </SoftCard>
      </div>
    </div>
  );
}
