"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { phaseWord, pricesMove, sessionNotices, type Session } from "@/lib/market/session";
import { EASE } from "@/lib/tokens";

/*
 * The market's state and what happens next, in one pill that rolls between
 * them the way a departure board does. Ten seconds on the status, four on each
 * notice — the next opening, and on a half-day the early close too. The
 * visible halves are hidden from assistive tech; the pill's label states them
 * all once.
 */
const STATUS_MS = 10_000;
const OPENS_MS = 4_000;
const ROLL_S = 0.42;

const longest = (values: string[]) =>
  values.reduce((a, b) => (b.length > a.length ? b : a), "");

function Rolling({ value, widest, className }: { value: string; widest: string; className?: string }) {
  return (
    <span aria-hidden="true" className={["hm-roll", className].filter(Boolean).join(" ")}>
      <span className="hm-roll-sizer">{widest}</span>
      <AnimatePresence initial={false}>
        <motion.span
          key={value}
          className="hm-roll-v"
          initial={{ y: "110%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "-110%", opacity: 0 }}
          transition={{ duration: ROLL_S, ease: EASE }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function SessionPill({ session, className }: { session: Session | null; className?: string }) {
  /* sessionNotices, not `opens` alone, so this pill and the terminal's
     (components/terminal/market-status.tsx) announce the same things. The
     effect keys on the notices' content: a fresh array every render would
     restart the timer on each parent render and the pill would never roll. */
  const notices = session ? sessionNotices(session) : [];
  const noticesKey = notices.map((n) => `${n.label}@${n.at}`).join("|");
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (noticesKey === "") return;
    const t = setTimeout(() => setStep((n) => n + 1), step % 2 === 1 ? OPENS_MS : STATUS_MS);
    return () => clearTimeout(t);
  }, [step, noticesKey]);

  if (!session) {
    return (
      <span className={["hm-pill", className].filter(Boolean).join(" ")} aria-label="US market status loading">
        <span className="hm-pill-dot" aria-hidden="true" />
        <span className="hm-pill-l">US markets</span>
      </span>
    );
  }

  const moving = pricesMove(session.phase);
  const label = `US ${phaseWord(session.phase)}`;
  const showing =
    step % 2 === 1 && notices.length > 0 ? notices[((step - 1) / 2) % notices.length] : null;

  return (
    <span
      className={["hm-pill", moving && "is-moving", className].filter(Boolean).join(" ")}
      aria-label={[label, ...notices.map((n) => `${n.label} at ${n.time} IST`)].join(". ") + "."}
    >
      <span className="hm-pill-dot" aria-hidden="true" />
      <Rolling
        value={showing ? showing.label : label}
        widest={longest([label, ...notices.map((n) => n.label)])}
        className="hm-pill-l"
      />
      <span className="hm-pill-sep" aria-hidden="true" />
      <Rolling
        value={`${showing ? showing.time : session.clock} IST`}
        widest={`${longest([session.clock, ...notices.map((n) => n.time)])} IST`}
        className="hm-pill-t"
      />
    </span>
  );
}
