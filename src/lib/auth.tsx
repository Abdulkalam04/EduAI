import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { type Session, type User } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "./supabase";
import { useBookStore } from "@/store/useBookStore";
import { useChatStore } from "@/store/useChatStore";
import { useCreativeStore } from "@/store/useCreativeStore";
import { useLearningStore } from "@/store/useLearningStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { LEVELS, useUserStore, type LevelId } from "@/store/useUserStore";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  introSeen: boolean;
  markIntroSeen: () => void;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (name: string, email: string, password: string) => Promise<boolean>;
  verifySignupCode: (email: string, token: string) => Promise<void>;
  resendSignupCode: (email: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  confirmPasswordReset: (email: string, token: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string>;
  refreshSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AccountProfile {
  name: string;
  level: LevelId;
  subject: string;
  interests: string[];
  onboarded: boolean;
  levelSet: boolean;
  nameCustomized?: boolean;
}

const ACCOUNT_PROFILE_KEY_PREFIX = "eduai-account-profile:";

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used in AuthProvider");
  return context;
}

export const authEnabled = hasSupabaseConfig;
const INTRO_SEEN_KEY = "eduai_intro_seen";

function clearIntroSeen(): void {
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(INTRO_SEEN_KEY);
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }
}

const FRIENDLY_SUPABASE: Record<string, string> = {
  invalid_credentials: "Incorrect email or password. Please try again.",
  email_not_confirmed: "This email is not confirmed yet. Enter the code sent to your inbox.",
  user_already_exists: "An account with that email already exists. Try signing in.",
  email_exists: "An account with that email already exists. Try signing in.",
  weak_password: "Password must be at least 8 characters.",
  over_email_send_rate_limit:
    "Too many emails were sent recently. Please wait a few minutes and try again.",
  over_request_rate_limit: "Too many requests. Please wait a moment and try again.",
  otp_expired: "That code expired. Request a new one.",
  invalid_otp: "The code is invalid. Please try again.",
  validation_failed: "Please check the form and try again.",
  network_error: "Network error. Please check your connection and try again.",
};

export function friendlySupabaseError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const friendly = code ? FRIENDLY_SUPABASE[code] : undefined;
  if (friendly) return friendly;
  if (message.includes("invalid login credentials")) {
    return FRIENDLY_SUPABASE["invalid_credentials"] ?? "Incorrect email or password.";
  }
  if (message.includes("email not confirmed")) {
    return FRIENDLY_SUPABASE["email_not_confirmed"] ?? "This email is not confirmed.";
  }
  if (message.includes("user already registered") || message.includes("already exists")) {
    return FRIENDLY_SUPABASE["user_already_exists"] ?? "An account with that email already exists.";
  }
  if (message.includes("weak password") || message.includes("password is too weak")) {
    return FRIENDLY_SUPABASE["weak_password"] ?? "Password must be at least 8 characters.";
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return FRIENDLY_SUPABASE["over_request_rate_limit"] ?? "Too many requests.";
  }
  if (message.includes("network")) {
    return FRIENDLY_SUPABASE["network_error"] ?? "Network error.";
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function syncUserScopedIdentity(nextUid: string): void {
  if (typeof window === "undefined") return;
  const previousUid = window.localStorage.getItem("eduai-last-uid") ?? "";
  if (previousUid !== nextUid && (previousUid || nextUid)) {
    if (previousUid) saveAccountProfile(previousUid);
    clearUserScopedStores();
    if (nextUid) restoreAccountProfile(nextUid);
  }
  if (nextUid) {
    window.localStorage.setItem("eduai-last-uid", nextUid);
  } else {
    window.localStorage.removeItem("eduai-last-uid");
  }
}

function saveAccountProfile(uid: string): void {
  const { name, level, subject, interests, onboarded, levelSet, nameCustomized } =
    useUserStore.getState();
  const profile: AccountProfile = {
    name,
    level,
    subject,
    interests,
    onboarded,
    levelSet,
    nameCustomized,
  };
  window.localStorage.setItem(`${ACCOUNT_PROFILE_KEY_PREFIX}${uid}`, JSON.stringify(profile));
}

function restoreAccountProfile(uid: string): void {
  const stored = window.localStorage.getItem(`${ACCOUNT_PROFILE_KEY_PREFIX}${uid}`);
  if (!stored) return;

  const profile: unknown = JSON.parse(stored);
  if (!isAccountProfile(profile)) {
    throw new Error("Saved account profile is invalid.");
  }

  useUserStore.setState({
    name: profile.name,
    level: profile.level,
    subject: profile.subject,
    interests: profile.interests,
    onboarded: profile.onboarded,
    levelSet: profile.levelSet,
    nameCustomized: profile.nameCustomized ?? false,
  });
}

function isAccountProfile(profile: unknown): profile is AccountProfile {
  return (
    typeof profile === "object" &&
    profile !== null &&
    "name" in profile &&
    typeof profile.name === "string" &&
    "level" in profile &&
    LEVELS.some(({ id }) => id === profile.level) &&
    "subject" in profile &&
    typeof profile.subject === "string" &&
    "interests" in profile &&
    Array.isArray(profile.interests) &&
    profile.interests.every((interest) => typeof interest === "string") &&
    "onboarded" in profile &&
    typeof profile.onboarded === "boolean" &&
    "levelSet" in profile &&
    typeof profile.levelSet === "boolean" &&
    (!("nameCustomized" in profile) || typeof profile.nameCustomized === "boolean")
  );
}

function accountDisplayName(user: User): string {
  const metadataName =
    [user.user_metadata["full_name"], user.user_metadata["name"]]
      .find((value): value is string => typeof value === "string" && Boolean(value.trim()))
      ?.trim() ?? "";
  if (metadataName) return metadataName;

  const emailName = user.email?.split("@")[0]?.trim() ?? "";
  return emailName ? `${emailName.charAt(0).toLocaleUpperCase()}${emailName.slice(1)}` : "";
}

export async function syncAuthenticatedUser(user: User | null): Promise<void> {
  if (!useUserStore.persist.hasHydrated()) {
    await useUserStore.persist.rehydrate();
  }
  syncUserScopedIdentity(user?.id ?? "");
  if (user && !useUserStore.getState().nameCustomized && !useUserStore.getState().name.trim()) {
    const name = accountDisplayName(user);
    if (name) useUserStore.getState().set({ name });
  }
}

export async function getAccessToken(): Promise<string> {
  if (!supabase) return "";
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

export async function refreshSession(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.refreshSession();
}

function clearUserScopedStores() {
  useUserStore.setState(useUserStore.getInitialState());
  useChatStore.getState().clearHistory();
  useBookStore.getState().setDocs([]);
  usePracticeStore.getState().clearHistory();
  useCreativeStore.setState({ diagrams: [], decks: [] });
  useLearningStore.getState().clearHistory();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("eduai:clear-user-cache"));
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [introSeen, setIntroSeen] = useState(false);

  const markIntroSeen = useCallback(() => {
    try {
      if (typeof window !== "undefined") window.sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      // The in-memory flag still prevents replay during this app mount.
    }
    setIntroSeen(true);
  }, []);

  const resetIntroSeen = useCallback(() => {
    clearIntroSeen();
    setIntroSeen(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setSession(null);
      setUser(null);
      return;
    }

    let active = true;
    const client = supabase;
    const applySession = async (nextSession: Session | null, event?: string) => {
      if (!active) return;
      const nextUser = nextSession?.user ?? null;
      try {
        await syncAuthenticatedUser(nextUser);
      } catch (error) {
        console.error("Unable to synchronize the signed-in user's profile.", error);
      }
      if (!active) return;
      if (event === "SIGNED_OUT") {
        resetIntroSeen();
      }
      setSession(nextSession);
      setUser(nextUser);
      setLoading(false);
    };

    const { data: subscription } = client.auth.onAuthStateChange((event, nextSession) => {
      void applySession(nextSession, event);
    });
    void client.auth
      .getSession()
      .then(({ data }) => applySession(data.session))
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Unable to restore the authentication session.", error);
        void applySession(null);
      });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [resetIntroSeen]);

  const signInEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendlySupabaseError(error));
  }, []);

  const signUpEmail = useCallback(
    async (name: string, email: string, password: string): Promise<boolean> => {
      if (!supabase) return false;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name.trim() } },
      });
      if (error) throw new Error(friendlySupabaseError(error));
      const requiresConfirmation = Boolean(data.user && !data.session);
      return requiresConfirmation;
    },
    [],
  );

  const verifySignupCode = useCallback(async (email: string, token: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
    if (error) throw new Error(friendlySupabaseError(error));
  }, []);

  const resendSignupCode = useCallback(async (email: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) throw new Error(friendlySupabaseError(error));
  }, []);

  const signInGoogle = useCallback(async () => {
    const client = supabase;
    if (!client) return;

    const native = Capacitor.isNativePlatform();
    const redirectTo = native ? "com.abdul.eduai://login-callback" : window.location.origin;
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: native,
      },
    });

    if (error) throw new Error(friendlySupabaseError(error));
    if (native && data.url) {
      await Browser.open({ url: data.url });
      const listener = await CapApp.addListener("appUrlOpen", async (event) => {
        const url = String(event.url ?? "");
        if (!url.startsWith("com.abdul.eduai://login-callback")) return;
        const match = url.match(/[?&]code=([^&]+)/i);
        if (!match?.[1]) {
          listener.remove();
          await Browser.close();
          return;
        }
        const code = decodeURIComponent(match[1]);
        const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
        listener.remove();
        await Browser.close();
        if (exchangeError) throw new Error(friendlySupabaseError(exchangeError));
      });
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw new Error(friendlySupabaseError(error));
  }, []);

  const confirmPasswordReset = useCallback(
    async (email: string, token: string, password: string) => {
      if (!supabase) return;
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "recovery",
      });
      if (verifyError) throw new Error(friendlySupabaseError(verifyError));
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(friendlySupabaseError(updateError));
      const { data } = await supabase.auth.signInWithPassword({ email, password });
      if (!data.session) throw new Error("Unable to sign in after resetting the password.");
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    clearUserScopedStores();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("eduai-last-uid");
    }
    resetIntroSeen();
  }, [resetIntroSeen]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      introSeen,
      markIntroSeen,
      signInEmail,
      signUpEmail,
      verifySignupCode,
      resendSignupCode,
      signInGoogle,
      requestPasswordReset,
      confirmPasswordReset,
      signOut,
      getAccessToken,
      refreshSession,
    }),
    [
      confirmPasswordReset,
      introSeen,
      loading,
      markIntroSeen,
      requestPasswordReset,
      resendSignupCode,
      session,
      signInEmail,
      signInGoogle,
      signOut,
      signUpEmail,
      user,
      verifySignupCode,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
