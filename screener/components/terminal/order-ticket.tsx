"use client";

import { motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { IconClose, IconSwap } from "@/components/icons";
import { Card } from "@/components/ui/surface";
import { money, pct, usd } from "@/lib/market/format";
import { formatShares, resolveOrder, type OrderType } from "@/lib/market/order";
import { usePortfolio, type TicketQuote } from "@/lib/portfolio";
import { C, EASE } from "@/lib/tokens";
import { usePresence } from "@/lib/use-presence";
import { Monogram, cn } from "./ui";

const EXIT_MS = 380;

const ORDER_TYPES: OrderType[] = ["Market", "Limit", "Stop"];

/** What a reader is most likely to spend, rather than what they must. */
const AMOUNT_PRESETS = [100, 500, 1000, 5000];

/**
 * The desk.
 *
 * Two things shape it. Fractional shares make "spend $500" as legitimate an
 * instruction as "buy two shares", so the ticket takes either and derives the
 * other — one field is always the reader's and the other always follows, and
 * the swap trades which is which. And a limit or a stop is not an order until
 * it carries the price it triggers at, so choosing one opens a field for it
 * and the derived quantity is computed against that price rather than the last
 * trade.
 *
 * Every figure here comes from `lib/market/order.ts`, which the fill also
 * uses. The button and the confirmation cannot disagree because neither does
 * its own arithmetic.
 */
export function OrderTicket({
  open,
  stock,
  onClose,
}: {
  open: boolean;
  /** Null once the ticket has been dismissed; see `shown` below. */
  stock: TicketQuote | null;
  onClose: () => void;
}) {
  const {
    side,
    orderType,
    mode,
    amount,
    shares,
    trigger,
    notice,
    cash,
    sharesOf,
    setSide,
    setOrderType,
    setMode,
    setAmount,
    setShares,
    setTrigger,
    place,
  } = usePortfolio();

  const uid = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  /* The instrument clears the moment the ticket is dismissed, but the panel
     stays mounted for its exit. Holding the last one keeps the drawer's
     contents intact on the way out instead of blanking mid-slide.
     Adjusted during render rather than in an effect, so the swap lands in the
     same commit as the new instrument and never paints a stale one. */
  const [shown, setShown] = useState<TicketQuote | null>(stock);
  if (stock && stock.id !== shown?.id) setShown(stock);

  /* Held in a ref so the key handler never has to depend on the caller keeping
     `onClose` referentially stable. */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const mounted = usePresence(open, EXIT_MS);
  const instrument = shown;

  /* Modal plumbing: remember the opener, move focus in, trap Tab inside the
     panel, close on Escape, and hand focus back.

     Deliberately two effects keyed on `open` alone. Folding the key handler in
     here would tie focus and scroll-lock to `onClose`'s identity, and a parent
     that passes an inline arrow then re-runs the whole thing on every render —
     stealing focus back to the opener mid-interaction. */
  useEffect(() => {
    if (!open) return;

    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!mounted || !instrument) return null;

  const buy = side === "buy";
  const up = instrument.chg >= 0;
  const held = sharesOf(instrument.id);
  const priced = instrument.price > 0;

  const draft = {
    side,
    type: orderType,
    mode,
    amount,
    shares,
    trigger,
    price: instrument.price,
  };
  const resolved = resolveOrder(draft);
  const typing = mode === "amount" ? amount : shares;

  const amountId = `${uid}-amount`;
  const sharesId = `${uid}-shares`;
  const triggerId = `${uid}-trigger`;
  const triggerLabel = orderType === "Limit" ? "Limit price" : "Stop price";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: open ? 1 : 0 }}
      transition={{ duration: 0.28 }}
      className="fixed inset-0 z-50 lg:absolute"
      /* Once closing, stop swallowing clicks meant for the page behind. */
      style={{ pointerEvents: open ? "auto" : "none" }}
    >
      <button
        type="button"
        aria-label="Close order ticket"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(6,5,4,0.78)] backdrop-blur-[7px]"
      />

      {/* Bottom sheet on phones, right-hand drawer from `sm` up. */}
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Order ticket for ${instrument.name}`}
        initial={{ x: "100%" }}
        animate={{ x: open ? 0 : "100%" }}
        transition={{ duration: EXIT_MS / 1000, ease: EASE }}
        className={cn(
          /* `[&>*]:shrink-0` is load-bearing, not tidiness. A column flex
             container shrinks its children by default, so on a phone — where
             the ticket is taller than the sheet — every block was squeezed
             instead of the sheet scrolling, and the amount card's preset row
             was sliced in half by its own bottom edge. */
          "absolute inset-x-0 top-14 bottom-0 flex flex-col overflow-y-auto [&>*]:shrink-0",
          "border-t border-rule-raised bg-shell p-5",
          "sm:inset-y-0 sm:right-0 sm:left-auto sm:top-0 sm:w-[430px] sm:max-w-full",
          "sm:border-t-0 sm:border-l sm:p-6",
          "shadow-[-40px_0_100px_rgba(0,0,0,0.7)]",
        )}
      >
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="font-serif text-[26px] leading-none">Order ticket</h2>
            <p className="eyebrow eyebrow-gold mt-2">Private execution desk</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close order ticket"
            className="grid h-11 w-11 flex-none place-items-center rounded-[10px] border border-rule-dot text-ink-3 transition-colors hover:border-gold hover:text-ink sm:h-[30px] sm:w-[30px]"
          >
            <IconClose className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* The name and what it last traded at. The price is the page's own —
            the desk states no figure the instrument behind it would contradict. */}
        <Card className="mt-5 flex items-center gap-3.5 px-4 py-4">
          <Monogram
            mark={instrument.mark}
            color={instrument.color}
            size={38}
            className="border-rule-mono"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-medium text-ink">{instrument.name}</p>
            <p className="font-mono mt-1 text-[11px] tracking-[0.1em] text-ink-3">
              {instrument.exchange ? `${instrument.exchange} · ` : ""}
              {instrument.id}
            </p>
          </div>
          <div className="text-right">
            {priced ? (
              <>
                <p className="font-mono text-[17px] text-ink">{money(instrument.price)}</p>
                <p
                  className="font-mono mt-1 text-[12px]"
                  style={{ color: up ? C.up : C.down }}
                >
                  {pct(instrument.chg)}
                </p>
              </>
            ) : (
              <p className="font-mono text-[13px] text-ink-3">No quote</p>
            )}
          </div>
        </Card>

        <div
          role="group"
          aria-label="Order side"
          className="mt-4 flex overflow-hidden rounded-[10px] border border-rule"
        >
          {(["buy", "sell"] as const).map((s) => {
            const active = side === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                aria-pressed={active}
                className={cn(
                  "flex-1 py-3.5 text-[11px] font-extrabold tracking-[0.16em] uppercase transition-colors",
                  s === "sell" && "border-l border-rule",
                  active
                    ? s === "buy"
                      ? "bg-[var(--tint-up)] text-up"
                      : "bg-[var(--tint-down)] text-down"
                    : "text-ink-3 hover:text-ink",
                )}
              >
                {s}
              </button>
            );
          })}
        </div>

        {/*
          The ticket's one hero. Both halves of `shares × price = amount` are on
          screen at once; the reader owns one and the desk fills in the other,
          and the swap decides which. Fractional shares are the reason it works
          in both directions — "spend five hundred dollars" is a whole order,
          and rounding it to a share count would refuse the instruction.
        */}
        <Card lit className="mt-4 px-5 py-5">
          <div className="flex items-start gap-4">
            <Leg
              id={mode === "amount" ? amountId : sharesId}
              label={mode === "amount" ? "In dollars" : "Quantity"}
              prefix={mode === "amount" ? "$" : null}
              value={typing}
              onChange={mode === "amount" ? setAmount : setShares}
              disabled={!priced}
            />

            <button
              type="button"
              onClick={() => setMode(mode === "amount" ? "shares" : "amount")}
              aria-label={
                mode === "amount" ? "Enter a quantity instead" : "Enter an amount instead"
              }
              className="mt-6 grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-rule-control text-ink-3 transition-colors hover:border-gold hover:text-gold"
            >
              <IconSwap className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1 text-right">
              <p className="card-label">
                {mode === "amount" ? "Approx. quantity" : "Approx. cost"}
              </p>
              <p className="font-mono mt-3 truncate text-[17px] text-ink-2">
                {mode === "amount"
                  ? formatShares(resolved.shares)
                  : usd(resolved.amount)}
              </p>
            </div>
          </div>

          {/* Amounts a reader reaches for, and only in the mode they belong to
              — a quantity of "500" is a different order entirely. */}
          {mode === "amount" && (
            <div className="mt-4 flex gap-2">
              {AMOUNT_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAmount(String(n))}
                  className="font-mono min-h-11 flex-1 rounded-[9px] border border-rule text-[11.5px] text-ink-3 transition-colors hover:border-gold hover:text-ink sm:min-h-0 sm:py-2.5"
                >
                  ${n >= 1000 ? `${n / 1000}k` : n}
                </button>
              ))}
            </div>
          )}

          {/* Selling has an obvious ceiling, and it is the only preset that
              matters — nobody sells a round dollar amount of a holding. */}
          {mode === "shares" && !buy && held > 0 && (
            <button
              type="button"
              onClick={() => setShares(String(held))}
              className="font-mono mt-4 min-h-11 w-full rounded-[9px] border border-rule text-[11.5px] text-ink-3 transition-colors hover:border-gold hover:text-ink sm:min-h-0 sm:py-2.5"
            >
              Sell all · {formatShares(held)}
            </button>
          )}
        </Card>

        <div className="mt-4">
          <p className="eyebrow eyebrow-wide mb-3">Order type</p>
          <div role="group" aria-label="Order type" className="flex gap-2">
            {ORDER_TYPES.map((o) => {
              const active = orderType === o;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOrderType(o)}
                  aria-pressed={active}
                  className={cn(
                    "min-h-11 flex-1 rounded-[9px] border text-[11px] font-bold tracking-[0.14em] uppercase transition-colors sm:min-h-0 sm:py-3",
                    active
                      ? "border-gold-deep bg-[var(--tint-gold)] text-gold"
                      : "border-rule text-ink-3 hover:text-ink",
                  )}
                >
                  {o === "Stop" ? "Stop loss" : o}
                </button>
              );
            })}
          </div>

          {/* A limit or a stop is not an order until it names its price, and
              the quantity above is derived against this rather than the last
              trade — otherwise the ticket states a fill the order cannot make. */}
          {orderType !== "Market" && (
            <label
              htmlFor={triggerId}
              className="mt-3 flex min-h-12 items-center gap-3 rounded-[10px] border border-rule px-4 focus-within:border-[rgba(217,189,139,0.4)]"
            >
              <span className="card-label flex-none">{triggerLabel}</span>
              <span aria-hidden="true" className="font-mono ml-auto text-[17px] text-ink-3">
                $
              </span>
              <input
                id={triggerId}
                inputMode="decimal"
                autoComplete="off"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                placeholder={money(instrument.price)}
                className="font-mono w-[110px] bg-transparent py-3 text-right text-[17px] text-ink placeholder:text-ink-4 focus:outline-none"
              />
            </label>
          )}
        </div>

        <dl className="mt-5 border-t border-rule pt-1.5">
          <Row label="Order type" value={orderType === "Stop" ? "STOP LOSS" : orderType.toUpperCase()} />
          <Row
            label={orderType === "Market" ? "Estimated price" : triggerLabel}
            value={resolved.price === null ? "—" : usd(resolved.price)}
          />
          <Row label="Commission" value="$0.00" />
          <Row
            label={buy ? "Order value" : "Estimated proceeds"}
            value={resolved.amount > 0 ? usd(resolved.amount) : "—"}
            color={C.gold}
          />
          <Row
            label={buy ? "Buying power" : "Shares held"}
            value={buy ? usd(cash) : formatShares(held)}
          />
        </dl>

        {/* `grow`, not `flex-1`: the basis-0 in `flex-1` collapses the spacer
            to nothing on a short viewport, and it is the only child here that
            should give up its height. */}
        <div className="grow" />

        {/*
          Fills and rejections are announced, not just shown — and they never
          share a colour, so a refused order can't be mistaken for a filled
          one. Rejections are assertive so they interrupt.

          The announcement and its appearance are two elements on purpose. A
          single node with `empty:hidden` is `display: none` at the exact moment
          its text arrives, and a live region that is not in the accessibility
          tree when it changes announces nothing. This one is always mounted and
          only ever visually clipped.
        */}
        <p
          role="status"
          aria-live={notice?.ok === false ? "assertive" : "polite"}
          className="sr-only"
        >
          {notice?.text ?? ""}
        </p>

        {/* No nested AnimatePresence here. One inside a drawer that is itself
            exiting leaves the outer exit waiting on a child that never
            resolves, and the whole panel stays mounted off-screen. The notice
            only needs an entrance, so `key` replays it. */}
        {notice && (
          <motion.p
            key={notice.text}
            aria-hidden="true"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.32 }}
            className={cn(
              "mt-5 rounded-[10px] border p-3.5 text-center text-[12px] font-bold tracking-[0.1em] uppercase",
              notice.ok
                ? "border-rule-raised bg-[var(--tint-gold-soft)] text-gold"
                : "border-[rgba(224,121,107,.4)] bg-[var(--tint-down)] text-down",
            )}
          >
            {notice.text}
          </motion.p>
        )}

        <motion.button
          type="button"
          onClick={place}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.99 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "mt-5 rounded-[10px] px-4 py-4 text-[11px] font-extrabold tracking-[0.14em] uppercase",
            "shadow-[0_10px_34px_rgba(0,0,0,0.4)] transition-shadow hover:shadow-[0_14px_40px_rgba(217,189,139,0.28)]",
            buy ? "cta-buy" : "cta-sell",
          )}
        >
          {/* The button states the order, not the verb. Before anything is
              entered it says so, rather than offering to trade nothing. */}
          {resolved.shares > 0
            ? `${buy ? "Buy" : "Sell"} ${formatShares(resolved.shares)} ${instrument.id} · ${usd(resolved.amount)}`
            : `${buy ? "Buy" : "Sell"} ${instrument.id}`}
        </motion.button>

        <p className="eyebrow mt-4 text-center">Simulated order · no funds are moved</p>
      </motion.div>
    </motion.div>
  );
}

/** The half of the order the reader is typing into. */
function Leg({
  id,
  label,
  prefix,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  prefix: string | null;
  value: string;
  onChange: (raw: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="card-label block">
        {label}
      </label>
      <div className="mt-2 flex items-baseline gap-1.5">
        {prefix && (
          <span aria-hidden="true" className="font-mono flex-none text-[17px] text-ink-3">
            {prefix}
          </span>
        )}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="font-mono w-full min-w-0 bg-transparent text-[26px] text-ink placeholder:text-ink-4 focus:outline-none disabled:text-ink-4"
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  color = C.ink,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="text-[11.5px] font-semibold tracking-[0.13em] text-ink-3 uppercase">
        {label}
      </dt>
      <dd className="font-mono m-0 text-[12.5px]" style={{ color }}>
        {value}
      </dd>
    </div>
  );
}
