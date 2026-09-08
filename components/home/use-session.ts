"use client";

import { useEffect, useState } from "react";
import { sessionAt, type Session } from "@/lib/market/session";

/**
 * The US session as of now, in the reader's clock. Null on the server and on
 * the first client render — `sessionAt` reads the wall clock, and a clock read
 * during render would make the server and the client disagree about the
 * phase — then refreshed every half minute, which is finer than any boundary
 * the pill announces.
 */
export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    const tick = () => setSession(sessionAt(Date.now() / 1000));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  return session;
}
