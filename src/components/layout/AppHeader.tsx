"use client";
import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { ROLE_LABELS } from "@/lib/auth/roles";
export function AppHeader() {
  const { currentProfile, signOut, isDemo } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      await signOut();
      router.replace("/login");
    } catch {
      setError("Sign-out failed. Please retry.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <header className="app-header sticky top-0 z-40 flex w-full flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md sm:px-6">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-400/40 bg-sky-500/20 font-mono font-bold text-blue-600">
          CS
        </span>
        <span>
          <strong className="block text-sm tracking-wide">CIVISCOPE</strong>
          <span className="block text-[11px] text-slate-500">
            Damage Mapper
          </span>
        </span>
      </Link>
      <nav
        aria-label="Main navigation"
        className="flex flex-wrap items-center gap-3 text-xs"
      >
        {currentProfile ? (
          <>
            <Link
              href="/"
              aria-current={pathname === "/" ? "page" : undefined}
              className="text-blue-700"
            >
              {currentProfile.department?.name ?? ROLE_LABELS[currentProfile.role]} portal
            </Link>
            <span className="max-w-44 truncate text-slate-500">
              {currentProfile.display_name}
            </span>
            {isDemo && (
              <span className="rounded border border-amber-200 px-2 py-1 text-amber-700">
                Demo · temporary data
              </span>
            )}
            <button
              onClick={logout}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-50"
            >
              <LogOut size={14} />
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </>
        ) : (
          <Link
            href="/login"
            aria-current={pathname === "/login" ? "page" : undefined}
            className="text-blue-700"
          >
            Sign in
          </Link>
        )}
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </nav>
    </header>
  );
}
