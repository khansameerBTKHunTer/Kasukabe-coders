"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
export default function AuthCallback() {
  const started = useRef(false);
  const callbackUrl = useRef<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();
  const auth = useAuth();
  useEffect(() => {
    callbackUrl.current ??= window.location.href;
    if (started.current || !auth.configurationReady) return;
    started.current = true;
    void (async () => {
      if (auth.demoEnabled)
        throw new Error(
          "Real email callbacks are unavailable in the isolated demo.",
        );
      const client = auth.supabase;
      if (!client) throw new Error("Supabase is not configured.");
      const original = new URL(callbackUrl.current!);
      const params = original.searchParams;
      const hash = new URLSearchParams(original.hash.slice(1));
      if (params.has("error") || hash.has("error"))
        throw new Error("This link is invalid or expired. Request a new link.");
      const recovery =
        params.get("flow") === "recovery" || hash.get("type") === "recovery";
      if (recovery) sessionStorage.setItem("civiscope_recovery", "active");
      // @supabase/ssr owns the PKCE exchange during SDK initialization.
      // Waiting here prevents exchanging the same one-use code twice.
      const initialized = await client.auth.initialize();
      let session;
      if (params.get("code")) {
        if (
          initialized.error ||
          new URL(window.location.href).searchParams.has("code")
        )
          throw new Error(
            "This link is invalid, expired, or was opened in a different browser. Request a new link.",
          );
        const restored = await client.auth.getSession();
        session = restored.data.session;
      } else if (hash.get("access_token") && hash.get("refresh_token")) {
        const restored = await client.auth.setSession({
          access_token: hash.get("access_token")!,
          refresh_token: hash.get("refresh_token")!,
        });
        if (restored.error)
          throw new Error(
            "This link is invalid or expired. Request a new link.",
          );
        session = restored.data.session;
      } else
        throw new Error(
          "This link has no authentication code. Open the complete link from your email in the same browser.",
        );
      if (!session)
        throw new Error("This link is invalid or expired. Request a new link.");
      window.history.replaceState({}, "", "/auth/callback");
      // A full navigation restores auth state only after the code exchange has completed.
      window.location.replace(recovery ? "/reset-password" : "/");
    })().catch((error) => setError(error.message));
  }, [router, auth.configurationReady, auth.demoEnabled, auth.supabase]);
  return (
    <div className="glass-panel mx-auto max-w-md space-y-4 rounded-xl border border-slate-200 p-6">
      {error ? (
        <>
          <p role="alert" className="text-red-700">
            {error}
          </p>
          <Link href="/forgot-password" className="block text-blue-700">
            Request a new reset link
          </Link>
          <Link href="/login" className="block text-blue-700">
            Back to sign in
          </Link>
        </>
      ) : (
        <p role="status">Completing sign in…</p>
      )}
    </div>
  );
}
