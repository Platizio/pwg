"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { phaseWord, pricesMove, type Session } from "@/lib/market/session";
import { EASE } from "@/lib/tokens";

/*
 * The market's state and its next opening, in one pill that rolls between
 * them the way a departure board does. Ten seconds on the status, four on the
 * opening. The visible halves are hidden from assistive tech; the pill's
 * label states both once.
 */
const STATUS_MS = 10_000;
const OPENS_MS = 4_000;
const ROLL_S = 0.42;

const longer = (a: string, b: string) => (b.length > a.length ? b : a);

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
  const opens = session?.opens ?? null;
  const [showOpens, setShowOpens] = useState(false);

  useEffect(() => {
    if (!opens) return;
    const t = setTimeout(() => setShowOpens((v) => !v), showOpens ? OPENS_MS : STATUS_MS);
    return () => clearTimeout(t);
  }, [showOpens, opens]);

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
  const showing = showOpens && opens ? opens : null;

  return (
    <span
      className={["hm-pill", moving && "is-moving", className].filter(Boolean).join(" ")}
      aria-label={opens ? `${label}. ${opens.label} at ${opens.time} IST.` : label}
    >
      <span className="hm-pill-dot" aria-hidden="true" />
      <Rolling value={showing ? showing.label : label} widest={opens ? longer(label, opens.label) : label} className="hm-pill-l" />
      <span className="hm-pill-sep" aria-hidden="true" />
      <Rolling
        value={`${showing ? showing.time : session.clock} IST`}
        widest={`${opens ? longer(session.clock, opens.time) : session.clock} IST`}
        className="hm-pill-t"
      />
    </span>
  );
}
