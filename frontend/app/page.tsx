"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Root() {
  const router = useRouter();
  const { isAuthed, hydrated } = useAuth();

  useEffect(() => {
    if (!hydrated) return;
    router.replace(isAuthed ? "/home/" : "/login/");
  }, [hydrated, isAuthed, router]);

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center">
      <p className="eyebrow">Loading…</p>
    </main>
  );
}
