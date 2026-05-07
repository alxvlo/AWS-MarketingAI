"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthed, hydrated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !isAuthed) router.replace("/login/");
  }, [hydrated, isAuthed, router]);

  if (!hydrated) return null;
  if (!isAuthed) return null;
  return <>{children}</>;
}
