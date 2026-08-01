import { useEffect, useState } from "react";
import type { Role } from "@finserve/shared-types";

export interface UserSession {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
  };
}

const key = "finserve.session";

export function readSession(): UserSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as UserSession;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function writeSession(session: UserSession) {
  window.localStorage.setItem(key, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(key);
}

export function useSessionState() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(readSession());
    setReady(true);
  }, []);

  return { session, ready };
}
