"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { departmentDefinition } from "@/lib/departments";
import type { Department } from "@/types";

export type FormMode = "login" | "register" | "forgot" | "reset" | "demo";
const field =
  "auth-input w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600";
const titles: Record<FormMode, string> = {
  login: "Sign in",
  register: "Create an account",
  forgot: "Reset your password",
  reset: "Set a new password",
  demo: "Demo sign in",
};
export function AuthForm({ mode }: { mode: FormMode }) {
  const router = useRouter();
  const auth = useAuth();
  const client = auth.supabase;
  const demoLogin = mode === "demo" || (mode === "login" && auth.demoEnabled);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("citizen");
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentError, setDepartmentError] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [recoverySession, setRecoverySession] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  useEffect(() => {
    if (mode === "reset") {
      if (client)
        void client.auth
          .getUser()
          .then(({ data, error }) => {
            setRecoverySession(Boolean(data.user && !error));
            setRecoveryChecked(true);
          })
          .catch(() => {
            setRecoverySession(false);
            setRecoveryChecked(true);
          });
    } else if (auth.status === "ready" && mode !== "forgot")
      router.replace("/");
    if (auth.status === "recovery" && !["reset", "forgot"].includes(mode))
      router.replace("/reset-password");
  }, [auth.status, client, mode, router]);
  useEffect(() => {
    if (mode !== "register") return;
    const controller = new AbortController();
    void fetch("/api/departments", { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !Array.isArray(data.departments)) throw new Error();
        setDepartments(
          data.departments.filter((d: Department) =>
            departmentDefinition(d.code)?.selfRegistration,
          ),
        );
      })
      .catch((error) => {
        if (error.name !== "AbortError")
          setDepartmentError(
            "Department options could not be loaded. Refresh to retry; citizen registration is still available.",
          );
      });
    return () => controller.abort();
  }, [mode]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (demoLogin) {
        const res = await fetch("/api/demo/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok || !data.profile)
          throw new Error(data.error || "Demo sign-in failed.");
        await auth.refreshSession();
        router.replace("/");
        return;
      }
      if (auth.demoEnabled)
        throw new Error(
          "This server is running the isolated demo. Restart without CIVISCOPE_DEMO_MODE to use real accounts.",
        );
      if (!client)
        throw new Error(
          "Supabase is not configured. Set the public project URL and key, then restart the app.",
        );
      if (mode === "login") {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error)
          throw new Error(
            error.code === "invalid_credentials" ||
              error.message === "Invalid login credentials"
              ? "Incorrect email or password."
              : error.message,
          );
        await auth.refreshSession();
        router.replace("/");
      } else if (mode === "register") {
        if (name.trim().length < 2)
          throw new Error(
            "Enter a full name or department unit name with at least 2 characters.",
          );
        if (password.length < 6)
          throw new Error("Supabase accounts require at least 6 characters.");
        const department = departments.find((d) => d.id === departmentId);
        if (accountType === "rescue" && !department)
          throw new Error("Select an available department.");
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              display_name: name.trim(),
              account_type: accountType,
              department_code: department?.code ?? null,
              organization_name: accountType === "rescue" ? name.trim() : null,
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          await auth.refreshSession();
          router.replace("/");
        } else
          setMessage(
            "Check your email to confirm your account, then sign in. If you already have an account, use Sign in or reset your password.",
          );
      } else if (mode === "forgot") {
        const { error } = await client.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${window.location.origin}/auth/callback?flow=recovery`,
          },
        );
        if (
          error &&
          (error.status === 429 || error.status === 0 || error.status === 500)
        )
          throw new Error(
            "The request could not be completed. Wait a moment and retry.",
          );
        setMessage(
          "If an account matches that email address, a password reset link will be sent. Check your inbox and spam folder.",
        );
      } else {
        if (
          auth.recoveryError ||
          !recoverySession ||
          auth.status !== "recovery"
        )
          throw new Error(
            "This recovery session is invalid or expired. Request a new reset link.",
          );
        if (password.length < 6)
          throw new Error("Supabase accounts require at least 6 characters.");
        if (password !== confirm)
          throw new Error("The passwords do not match.");
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        auth.finishRecovery();
        setMessage("Password updated. You can now open your portal.");
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to complete the request. Please retry.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const hasPassword = ["login", "register", "reset", "demo"].includes(mode);
  return (
    <section className={`auth-screen auth-${mode}`}>
      <div className="auth-story">
        <div className="auth-story-brand">
          <span className="auth-logo">CS</span>
          <span className="auth-brand-copy">
            <strong>CIVISCOPE</strong>
            <small>Damage Mapper</small>
          </span>
        </div>
        <span className="auth-color-rule" aria-hidden="true" />
        <div className="auth-story-message">
          <p>Faster Information.<br />Safer Communities.</p>
          <span>Report · Map · Respond · Rebuild</span>
        </div>
      </div>
      <div className="auth-panel-column">
        <div className="auth-panel">
        {["login", "demo"].includes(mode) ? (
          <div className="auth-welcome">
            <p>Welcome to</p>
            <h1>CIVISCOPE</h1>
            <strong>Damage Mapper</strong>
            <span className="auth-color-rule" aria-hidden="true" />
            <p className="auth-welcome-copy">Sign in to report, monitor and respond<br />to disaster incidents.</p>
            <span className="sr-only">{titles[mode]}</span>
          </div>
        ) : (
          <div className="mb-6 flex items-center gap-3">
            <span className="auth-logo auth-logo-small">CS</span>
            <div>
              <p className="text-lg font-bold tracking-wide">CIVISCOPE</p>
              <p className="text-xs text-slate-500">Damage Mapper</p>
            </div>
          </div>
        )}
        {mode !== "login" && <h1 className="text-2xl font-semibold">{titles[mode]}</h1>}
        {mode === "demo" && (
          <p className="mt-2 text-sm text-amber-700">
            Fictional accounts and temporary data. This login cannot access the
            real Supabase project.
          </p>
        )}
        {mode === "register" && (
          <p className="mt-2 text-sm text-slate-500">
            Choose a citizen or department account. Email confirmation may be
            required. Department accounts are self-declared, not
            organizationally verified.
          </p>
        )}
        {mode === "reset" &&
          recoveryChecked &&
          (!recoverySession || auth.status !== "recovery") &&
          !message && (
            <p role="alert" className="mt-4 text-sm text-amber-700">
              No valid recovery session is available. Request a new reset link
              and open it in this browser.
            </p>
          )}
        {mode === "reset" && auth.recoveryError && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {auth.recoveryError}
          </p>
        )}
        {(error || (mode === "login" && auth.error)) && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error || auth.error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
          >
            {message}
          </p>
        )}
        <form onSubmit={submit} className="mt-6 space-y-4" aria-busy={busy}>
          <fieldset
            disabled={
              !auth.configurationReady ||
              busy ||
              (mode === "register" && !!message)
            }
            className="space-y-4 disabled:opacity-70"
          >
            {mode === "register" && (
              <>
                <div>
                  <label htmlFor="account-type" className="mb-1 block text-sm">
                    Account type
                  </label>
                  <select
                    id="account-type"
                    className={field}
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                  >
                    <option value="citizen">Citizen</option>
                    <option value="rescue">Response / Relief Team</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="name" className="mb-1 block text-sm">
                    {accountType === "citizen"
                      ? "Full name"
                      : "Department name / local unit name"}
                  </label>
                  <input
                    id="name"
                    required
                    maxLength={120}
                    autoComplete={
                      accountType === "citizen" ? "name" : "organization"
                    }
                    className={field}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                {accountType === "rescue" && (
                  <div>
                    <label htmlFor="department" className="mb-1 block text-sm">
                      Department selection
                    </label>
                    <select
                      id="department"
                      required
                      className={field}
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                    >
                      <option value="">Select response capability</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      Your unit name identifies your team; this selection
                      determines its response department.
                    </p>
                    {departmentError && (
                      <p role="alert" className="mt-1 text-xs text-red-700">
                        {departmentError}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            {mode !== "reset" && (
              <div>
                <label htmlFor="email" className="mb-1 block text-sm">
                  {mode === "register" && accountType === "rescue"
                    ? "Official email"
                    : "Email"}
                </label>
                <div className="auth-field-wrap">
                  <Mail className="auth-field-icon" size={18} aria-hidden="true" />
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="Email address"
                    className={`${field} pl-12`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
            )}
            {hasPassword && (
              <div>
                <label htmlFor="password" className="mb-1 block text-sm">
                  {mode === "reset" ? "New password" : "Password"}
                </label>
                <div className="relative">
                  <LockKeyhole className="auth-field-icon" size={18} aria-hidden="true" />
                  <input
                    id="password"
                    type={show ? "text" : "password"}
                    required
                    minLength={demoLogin ? 4 : ["register", "reset"].includes(mode) ? 6 : undefined}
                    inputMode={demoLogin ? "numeric" : undefined}
                    pattern={demoLogin ? "[0-9]{4}" : undefined}
                    autoComplete={
                      ["register", "reset"].includes(mode)
                        ? "new-password"
                        : "current-password"
                    }
                    placeholder="Password"
                    className={`${field} pl-12 pr-12`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={show ? "Hide password" : "Show password"}
                    aria-pressed={show}
                    onClick={() => setShow(!show)}
                    className="absolute right-0 top-0 flex h-full w-11 items-center justify-center rounded-lg text-slate-500 focus:ring-2 focus:ring-sky-600"
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}
            {mode === "reset" && (
              <div>
                <label htmlFor="confirm" className="mb-1 block text-sm">
                  Confirm new password
                </label>
                <input
                  id="confirm"
                  type={show ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={field}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            )}
            {mode === "login" && (
              <Link
                href="/forgot-password"
                className="block text-right text-sm text-blue-700 underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            )}
            <button
              disabled={
                busy ||
                (mode === "reset" && (!recoverySession || !!auth.recoveryError))
              }
              type="submit"
              className="auth-submit w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white hover:bg-primary-hover disabled:cursor-wait disabled:opacity-50"
            >
              <span>{busy
                ? "Please wait…"
                : mode === "register"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : mode === "reset"
                      ? "Update password"
                      : "Sign in"}</span>
              {!busy && ["login", "demo"].includes(mode) && <ArrowRight size={17} aria-hidden="true" />}
            </button>
          </fieldset>
        </form>
        {mode === "reset" && (
          <Link
            href="/forgot-password"
            className="mt-4 block text-sm text-blue-700"
          >
            Request a new reset link
          </Link>
        )}
        {mode === "login" && (
          <div className="auth-create-block">
            <div className="auth-divider"><span>OR</span></div>
            <Link href="/register" className="auth-create-link">
              <strong>Create a new account</strong>
              <span>Citizen or Rescue Department</span>
            </Link>
          </div>
        )}
        {mode !== "login" && (
          <Link
            href="/login"
            className="mt-5 block text-center text-sm text-blue-700"
          >
            Back to sign in
          </Link>
        )}
        {mode === "login" && auth.demoEnabled && (
          <Link
            href="/demo-login"
            className="mt-4 block text-center text-sm text-amber-700"
          >
            Use a fictional demo account
          </Link>
        )}
        {demoLogin && (
          <div className="mt-5 break-words rounded-xl border border-amber-200 p-3 text-xs text-slate-700">
            <p className="font-semibold text-amber-700">
              Demo accounts · shared fictional data
            </p>
            <p className="mt-1">
              Shared password: <code>1234</code>
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[["Citizen", "citizen"], ["Admin", "admin"], ["Fire", "fire"]].map(([label, account]) => (
                <button key={account} type="button" className="rounded-lg border border-amber-200 px-2 py-2 font-semibold hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-sky-600"
                  onClick={() => { setEmail(`${account}@civiscope.demo`); setPassword("1234"); setError(""); }}>
                  Fill {label}
                </button>
              ))}
            </div>
            <p className="mt-2">
              citizen@civiscope.demo · fire@civiscope.demo ·
              power@civiscope.demo · municipal@civiscope.demo ·
              medical@civiscope.demo · admin@civiscope.demo · ngo@civiscope.demo · volunteer@civiscope.demo · sdrf@civiscope.demo · ndrf@civiscope.demo · police@civiscope.demo · civil@civiscope.demo
            </p>
            {!auth.demoEnabled && (
              <p className="mt-2">
                Demo mode is disabled. Start with{" "}
                <code>CIVISCOPE_DEMO_MODE=true npm run dev</code>.
              </p>
            )}
          </div>
        )}
        </div>
        <div className="auth-footer">
          <span className="auth-color-rule" aria-hidden="true" />
          <p>Disaster response for safer communities</p>
        </div>
      </div>
    </section>
  );
}
