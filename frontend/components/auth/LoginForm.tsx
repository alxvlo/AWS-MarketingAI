"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/adminApi";
import { setToken } from "@/lib/auth";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const token = await login(username, password);
      setToken(token);
      router.push("/home/");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label htmlFor="u" className="eyebrow block mb-1.5">Username</label>
        <input id="u" autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)}
          className="w-full bg-[var(--bg-canvas)] border border-[var(--rule)] px-3.5 py-2.5 text-[15px] focus:outline-none focus:border-[var(--accent)] transition-colors"
          style={{ borderRadius: 2 }} />
      </div>
      <div>
        <label htmlFor="p" className="eyebrow block mb-1.5">Password</label>
        <input id="p" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}
          className="w-full bg-[var(--bg-canvas)] border border-[var(--rule)] px-3.5 py-2.5 text-[15px] focus:outline-none focus:border-[var(--accent)] transition-colors"
          style={{ borderRadius: 2 }} />
      </div>
      {err && <p className="text-[13px]" style={{ color: "var(--status-error)" }}>{err}</p>}
      <button type="submit" disabled={busy}
        className="w-full bg-[var(--ink-primary)] text-[var(--bg-canvas)] py-3 text-[14px] font-semibold hover:bg-[var(--accent)] disabled:opacity-50 transition-colors"
        style={{ borderRadius: 2, letterSpacing: "0.08em" }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
