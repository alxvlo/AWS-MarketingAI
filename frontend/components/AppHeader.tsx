"use client";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth";

export default function AppHeader() {
  const router = useRouter();

  function handleLogout() {
    clearToken();
    router.replace("/login/");
  }

  return (
    <header className="bg-[var(--bg-surface)] border-b border-[var(--rule)] px-8 py-6">
      <div className="max-w-6xl mx-auto flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="display text-[32px] leading-none">Satisfaction Meter</h1>
          <p className="eyebrow">Admin Dashboard</p>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-[14px] font-semibold text-[var(--ink-primary)] border border-[var(--rule)] hover:bg-[var(--bg-inset)] transition-colors"
          style={{ borderRadius: 2 }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
