import { Capacitor } from "@capacitor/core";
import { createClient, type Session, type User } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "";
const supabaseAnonKey = (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined) ?? "";

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !Capacitor.isNativePlatform(),
      },
    })
  : null;

export type AuthUser = User | null;
export type AuthSession = Session | null;
