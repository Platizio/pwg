"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TRADING_PLATFORM_URL } from "@/src/constants";
import { useAppContext } from "@/src/context/AppContext";
import { COPY } from "@/lib/home/copy";
import { EASE } from "@/lib/tokens";
import { Rise } from "./motion/rise";

/*
 * The page after the ticker: why invest globally, how to invest, regulated,
 * the cost, questions, the account.
 *
 * Every block is built in the pricing page's material — a warm sheet lit by a
 * soft gold wash out of one corner, a hairline edge, a 16px radius and a low
 * shadow — but no two sections wear it the same way, so six sections do not
 * arrive as one shape repeated:
 *
 *   why        three stacked columns of cards, one of them a figure panel
 *   how        three cards across, one per step
 *   regulated  a ledger: one sheet, rows divided by hairlines
 *   the cost   three cards, each led by its figure at display size
 *   questions  a ledger whose rows open
 *
 * Nothing on this page sits off the sheet. The steps and the charges were
 * set bare for a while, on the reasoning that a box around a number competes
 * with the number; on the page it read as the material giving out under the
 * two sections a reader is actually deciding on.
 *
 * Every next step on this page is a real button. The 9.5px tracked-caps link
 * the products page uses for tertiary navigation was carrying "see the full
 * schedule" and "all articles" here, and at that size a call to action is
 * decoration; the products page's own `.ft-ghost` is the control this page
 * uses instead.
 */

/* No eyebrow above the heading. Each section opened on "01 — why global" and
   the like; the count was decoration and the words under it restated the
   heading below in fewer characters. */
function Head({ h2, body, id }: { h2: string; body: string; id: string }) {
  return (
    <header className="ft-head">
      <div className="ft-head-l">
        <h2 className="ft-h2" id={id}>
          {h2}
        </h2>
      </div>
      <p className="ft-body">{body}</p>
    </header>
  );
}

/** The pricing page's tick. Green carries it, the word beside it repeats it. */
function Tick() {
  return (
    <svg
      className="hm-tick"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/* ------------------------------------------------------------- 01 why */

export function Why() {
  const w = COPY.why;
  const p = w.panel;
  const r = w.reasons;

  /* Three stacked columns rather than one grid: the panel is taller than a
     reason card, and stacking lets the column below it start where it ends,
     which is the offset the v4 draft has. A grid would force a shared row. */
  const columns = [
    [<Card key="a" {...r[0]} />, <Card key="b" {...r[1]} />],
    [
      <Rise className="hm-card hm-pf" key="panel" as="section" aria-label={p.label}>
        <span className="hm-pf-l">{p.label}</span>
        <span className="hm-pf-v">{p.value}</span>
        <span className="hm-pf-u">{p.unit}</span>
        <span className="hm-pf-note">{p.note}</span>
      </Rise>,
      <Card key="c" {...r[2]} />,
    ],
    [<Card key="d" {...r[3]} />, <Card key="e" {...r[4]} />],
  ];

  return (
    <section className="ft-step" id="why" aria-labelledby="why-heading">
      <div className="container">
        <Head h2={w.h2} body={w.body} id="why-heading" />
        <p className="ft-label hm-kicker">{w.kicker}</p>
        <div className="hm-bento">
          {columns.map((col, i) => (
            <div className="hm-bento-col" key={i}>
              {col}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <Rise as="article" className="hm-card">
      <h3 className="hm-card-t">{title}</h3>
      <p className="hm-card-b">{body}</p>
    </Rise>
  );
}

/* ------------------------------------------------------------- 02 how */

export function How() {
  const h = COPY.how;
  const r = h.reads;
  return (
    <section className="ft-step" id="how" aria-labelledby="how-heading">
      <div className="container">
        <Head h2={h.h2} body={h.body} id="how-heading" />

        {/* One card per step, across the full measure. As rows on the page's
            left edge the three steps read as a narrow column of text with an
            empty half beside it; the anatomy inside — the step mark, the
            title, the sentence — is the part that worked, and is unchanged. */}
        <ol className="hm-steps">
          {h.steps.map((s, i) => (
            <Rise as="li" className="hm-card hm-step" key={s.title} delay={i * 0.06}>
              <span className="hm-step-l">{`Step 0${i + 1}`}</span>
              <h3 className="hm-step-t">{s.title}</h3>
              <p className="hm-step-b">{s.body}</p>
            </Rise>
          ))}
        </ol>

        {/* The page's only route into the article library. A reader who has
            just read the three steps is exactly the one who wants the detail. */}
        <div className="hm-reads">
          <span className="ft-label hm-reads-l">{r.label}</span>
          <ul className="hm-reads-list">
            {r.links.map((l) => (
              <li key={l.href}>
                <Link className="hm-read" href={l.href}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link className="ft-ghost hm-reads-all" href={r.all.href}>
            {r.all.label}
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- 03 regulated */

export function Regulated() {
  const r = COPY.regulated;
  return (
    <section className="ft-step" id="regulated" aria-labelledby="regulated-heading">
      <div className="container">
        <Head h2={r.h2} body={r.body} id="regulated-heading" />
        {/* A ledger rather than five cards: these are five answers to one
            question, and a reader ticks them off in order. */}
        <Rise>
          <dl className="hm-ledger">
            {r.cells.map((c) => (
              <div className="hm-ledger-row" key={c.title}>
                <dt className="hm-ledger-h">
                  <Tick />
                  <span>{c.title}</span>
                </dt>
                <dd className="hm-ledger-v">{c.gloss}</dd>
              </div>
            ))}
          </dl>
        </Rise>
        <p className="hm-note">
          {r.disclosure}{" "}
          <Link className="hm-inline" href={r.disclosureLink.href}>
            {r.disclosureLink.label}
          </Link>
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ 04 fees */

export function Fees() {
  const f = COPY.fees;
  return (
    <section className="ft-step" id="fees" aria-labelledby="fees-heading">
      <div className="container">
        <Head h2={f.h2} body={f.body} id="fees-heading" />

        {/* Three cards, each led by its figure. The term comes first in the
            markup because that is the order a definition list takes and the
            order a screen reader wants; CSS lifts the figure to the top of
            the card, where the eye wants it. */}
        <dl className="hm-figures">
          {f.figures.map((fig, i) => (
            <Rise as="div" className="hm-card hm-figure" key={fig.label} delay={i * 0.06}>
              <dt className="hm-figure-l">{fig.label}</dt>
              <dd className="hm-figure-v">{fig.value}</dd>
              <dd className="hm-figure-n">{fig.note}</dd>
            </Rise>
          ))}
        </dl>

        <div className="hm-cost-foot">
          <p className="hm-note hm-note--flush">{f.passthrough}</p>
          <Link className="ft-ghost" href="/pricing">
            {f.link}
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- 05 faq */

export function Faq() {
  const f = COPY.faq;
  const [open, setOpen] = useState(0);
  const reduce = useReducedMotion();
  return (
    <section className="ft-step" id="questions" aria-labelledby="faq-heading">
      <div className="container">
        <Head h2={f.h2} body={f.body} id="faq-heading" />
        <ul className="hm-ledger hm-qs">
          {f.items.map((item, i) => {
            const on = open === i;
            const id = `hm-faq-${i}`;
            return (
              <li key={item.q} className={`hm-q${on ? " is-open" : ""}`}>
                <h3>
                  <button
                    type="button"
                    className="hm-q-head"
                    aria-expanded={on}
                    aria-controls={id}
                    onClick={() => setOpen(on ? -1 : i)}
                  >
                    <span className="hm-q-n" aria-hidden="true">{`0${i + 1}`}</span>
                    <span className="hm-q-t">{item.q}</span>
                    <span className="hm-q-sign" aria-hidden="true">
                      <span />
                      <span />
                    </span>
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {on && (
                    <motion.div
                      id={id}
                      className="hm-q-panel"
                      initial={reduce ? false : { height: 0, opacity: 0 }}
                      animate={reduce ? undefined : { height: "auto", opacity: 1 }}
                      exit={reduce ? undefined : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.42, ease: EASE }}
                    >
                      <p className="hm-q-a">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
        <div className="hm-qs-foot">
          <Link className="ft-ghost" href="/faqs">
            Every question we get asked
          </Link>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- 06 the end */

export function Closing() {
  const { openContact } = useAppContext();
  const c = COPY.closing;
  return (
    <section className="ft-close" id="open" aria-labelledby="close-heading">
      <div className="container">
        <div className="ft-close-inner">
          <h2 className="ft-h2" id="close-heading">
            {c.h2}
          </h2>
          <p className="ft-body">{c.body}</p>
          <div className="ft-actions">
            <a className="ft-cta" href={TRADING_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
              {c.primary}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <button type="button" className="ft-ghost" onClick={() => openContact()}>
              {c.secondary}
            </button>
          </div>
          <div className="ft-close-rule" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
