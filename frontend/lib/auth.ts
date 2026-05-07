"use client";

import { useEffect, useState } from "react";

const KEY = "sm_admin_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(KEY);
}

export function setToken(token: string) {
  sessionStorage.setItem(KEY, token);
  window.dispatchEvent(new Event("sm-auth-change"));
}

export function clearToken() {
  sessionStorage.removeItem(KEY);
  window.dispatchEvent(new Event("sm-auth-change"));
}

export function useAuth() {
  const [token, setT] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setT(getToken());
    setHydrated(true);
    const onChange = () => setT(getToken());
    window.addEventListener("sm-auth-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("sm-auth-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return { token, isAuthed: hydrated && !!token, hydrated };
}
