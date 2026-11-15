"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { adminFetch, browserSupabase } from "@/lib/supabase-browser";
import { AdminMap } from "./AdminMap";

type Access = { state: "checking" } | { state: "admin"; email?: string } | { state: "denied"; message: string; userId?: string };

/** Login, then the admin map, for users listed in the `admins` table. */
export function AdminApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [access, setAccess] = useState<Access>({ state: "checking" });

  useEffect(() => {
    const sb = browserSupabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    adminFetch("/api/admin/me").then(async (r) => {
      const data = await r.json().catch(() => ({}));
      setAccess(r.ok ? { state: "admin", email: data.email } : { state: "denied", message: data.error ?? `HTTP ${r.status}`, userId: data.userId });
    });
  }, [session]);

  if (session === undefined) return <p className="p-8 text-muted">লোড হচ্ছে…</p>;
  if (!session) return <LoginForm />;
  if (access.state === "checking") return <p className="p-8 text-muted">অনুমতি যাচাই হচ্ছে…</p>;
  if (access.state === "denied") {
    return (
      <div className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold">অনুমতি নেই</h1>
        <p className="mt-2">{access.message}</p>
        <p className="mt-4 text-sm text-muted">
          নিজেকে অ্যাডমিন করতে প্রজেক্ট ফোল্ডারে চালান: <code className="rounded bg-card px-1.5">pnpm make-admin {session.user.email}</code>
        </p>
        <button type="button" onClick={() => browserSupabase().auth.signOut()} className="mt-6 text-sm text-accent underline">
          লগআউট
        </button>
      </div>
    );
  }
  return <AdminMap email={access.email} />;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await browserSupabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "ইমেইল বা পাসওয়ার্ড ঠিক নেই" : error.message);
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-16 grid max-w-sm gap-3 rounded-2xl border border-line bg-card p-6 shadow-sm">
      <h1 className="text-2xl font-bold">অ্যাডমিন লগইন</h1>
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="ইমেইল"
        className="rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-accent"
      />
      <input
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="পাসওয়ার্ড"
        className="rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-accent"
      />
      <button type="submit" disabled={busy} className="rounded-full bg-accent px-4 py-2 font-semibold text-white disabled:opacity-60">
        {busy ? "লগইন হচ্ছে…" : "লগইন"}
      </button>
      {error && <p className="text-sm text-red-800">{error}</p>}
    </form>
  );
}
