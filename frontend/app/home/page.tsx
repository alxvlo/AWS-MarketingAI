"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();
  const { isAuthed, hydrated } = useAuth();

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthed) {
      router.replace("/login/");
    }
  }, [hydrated, isAuthed, router]);

  if (!hydrated || !isAuthed) {
    return (
      <main className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center">
        <p className="eyebrow">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] flex flex-col">
      {/* AppHeader will be imported here once F1 is complete */}
      <div className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="display text-[36px] leading-tight mb-8">Admin Dashboard</h1>
          {/* Analytics cards will be rendered here in H1–H5 */}
          <div className="space-y-6">
            <p className="text-[var(--ink-secondary)]">Loading dashboard…</p>
          </div>
        </div>
      </div>
    </main>
  );
}
