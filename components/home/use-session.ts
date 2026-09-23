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

/**
 * The session the SERVER rendered with, until the client's own clock takes
 * over — then the live one, refreshed every half minute.
 *
 * WHY THE TERMINAL NEEDS THIS. Its pill, its price header and its top bar were
 * all handed a `session` computed once, when the page was rendered. These are
 * ISR pages that live for up to fifteen minutes and are often regenerated long
 * before a reader arrives, so a page rendered at 08:00 ET kept announcing
 * "Pre-market" straight through the opening bell and on into the session. The
 * home page's pill never had the problem because it already used
 * `useSession`; the terminal's did not.
 *
 * The server's value is kept for the FIRST render rather than null, so the
 * markup matches what the server sent and hydration has nothing to repair —
 * then the live clock replaces it within a frame.
 */
export function useLiveSession(initial: Session): Session {
  return useSession() ?? initial;
}
