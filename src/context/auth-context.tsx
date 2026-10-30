"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/types";
import { profileAccessError } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/client";

export type AuthStatus =
  | "restoring"
  | "signed_out"
  | "loading_profile"
  | "profile_missing"
  | "profile_error"
  | "ready"
  | "recovery";
interface AuthContextType {
  currentProfile: Profile | null;
  supabase: SupabaseClient | null;
  configurationReady: boolean;
  status: AuthStatus;
  error: string | null;
  isAuthenticated: boolean;
  demoEnabled: boolean;
  isDemo: boolean;
  recoveryError: string | null;
  retryProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  finishRecovery: () => void;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [error, setError] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const version = useRef(0);
  const invalidate = useCallback(() => {
    version.current += 1;
  }, []);
  const recovering = useRef(false);
  const mounted = useRef(true);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [configurationReady, setConfigurationReady] = useState(false);

  const loadProfile = useCallback(async () => {
    const requestVersion = ++version.current;
    setCurrentProfile(null);
    setError(null);
    setStatus("loading_profile");
    try {
      const res = await fetch("/api/auth/profile", { cache: "no-store" });
      const data = await res.json();
      if (
        !mounted.current ||
        requestVersion !== version.current ||
        recovering.current
      )
        return;
      if (res.status === 401) {
        setStatus("signed_out");
        return;
      }
      if (!res.ok || !data.profile) {
        setError(
          data.error || "Unable to retrieve your profile. Retry or sign out.",
        );
        setStatus(
          data.code === "PROFILE_MISSING" ? "profile_missing" : "profile_error",
        );
        return;
      }
      const accessError = profileAccessError(data.profile);
      if (accessError) {
        setError(accessError);
        setStatus("profile_error");
        return;
      }
      setCurrentProfile(data.profile);
      setIsDemo(Boolean(data.demo));
      setStatus("ready");
    } catch {
      if (
        mounted.current &&
        requestVersion === version.current &&
        !recovering.current
      ) {
        setError(
          "Unable to contact the account service. Check your connection and retry.",
        );
        setStatus("profile_error");
      }
    }
  }, []);

  const restore = useCallback(async () => {
    const res = await fetch("/api/demo/session", { cache: "no-store" });
    const demo = await res.json();
    if (!mounted.current) return;
    setDemoEnabled(Boolean(demo.enabled));
    setConfigurationReady(true);
    if (demo.enabled) {
      setIsDemo(true);
      if (demo.profile) await loadProfile();
      else setStatus("signed_out");
      return;
    }
    const supabase = client ?? createClient();
    if (supabase && !client) setClient(supabase);
    if (!supabase) {
      setError(
        "Supabase is not configured. Set the public Supabase URL and key, then restart the app.",
      );
      setStatus("signed_out");
      return;
    }
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (!mounted.current || recovering.current) return;
    if (sessionError) {
      setError("Your session could not be restored. Sign in again.");
      setStatus("signed_out");
    } else if (data.session) await loadProfile();
    else setStatus("signed_out");
  }, [client, loadProfile]);

  useEffect(() => {
    mounted.current = true;
    const parameters = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const recovery =
      sessionStorage.getItem("civiscope_recovery") === "active" ||
      hash.get("type") === "recovery" ||
      parameters.get("flow") === "recovery";
    if (recovery) {
      recovering.current = true;
      sessionStorage.setItem("civiscope_recovery", "active");
      setStatus("recovery");
    }
    if (parameters.has("error") || hash.has("error")) {
      setRecoveryError(
        "This link is invalid or expired. Request a new password reset email.",
      );
    }
    const { data: subscription } = client?.auth.onAuthStateChange(
      (event, session: Session | null) => {
        if (event === "PASSWORD_RECOVERY") {
          ++version.current;
          recovering.current = true;
          sessionStorage.setItem("civiscope_recovery", "active");
          setCurrentProfile(null);
          setStatus("recovery");
        } else if (event === "SIGNED_OUT") {
          ++version.current;
          setCurrentProfile(null);
          setStatus(recovering.current ? "recovery" : "signed_out");
        } else if (session && !recovering.current) {
          // Schedule outside the auth callback to avoid taking the SDK's session lock.
          setTimeout(() => {
            if (mounted.current && !recovering.current) void loadProfile();
          }, 0);
        }
      },
    ) ?? { data: undefined };
    void restore().catch(() => {
      if (mounted.current && !recovering.current) {
        setError("Unable to restore your session. Refresh to retry.");
        setStatus("signed_out");
      }
    });
    return () => {
      mounted.current = false;
      invalidate();
      subscription?.subscription.unsubscribe();
    };
  }, [client, loadProfile, restore, invalidate]);

  const signOut = async () => {
    if (isDemo || demoEnabled) {
      const res = await fetch("/api/demo/session", { method: "DELETE" });
      if (!res.ok) throw new Error("Unable to sign out. Please retry.");
    } else if (client) {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    }
    ++version.current;
    recovering.current = false;
    sessionStorage.removeItem("civiscope_recovery");
    setCurrentProfile(null);
    setStatus("signed_out");
    setError(null);
  };
  const finishRecovery = () => {
    recovering.current = false;
    sessionStorage.removeItem("civiscope_recovery");
    setRecoveryError(null);
    void loadProfile();
  };
  return (
    <AuthContext.Provider
      value={{
        currentProfile,
        supabase: client,
        configurationReady,
        status,
        error,
        isAuthenticated: status === "ready",
        demoEnabled,
        isDemo,
        recoveryError,
        retryProfile: loadProfile,
        signOut,
        refreshSession: restore,
        finishRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
