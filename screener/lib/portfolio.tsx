"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usd } from "@/lib/market/format";
import {
  formatShares,
  resolveOrder,
  validateOrder,
  type EntryMode,
  type OrderDraft,
  type OrderSide,
  type OrderType,
} from "@/lib/market/order";

/**
 * The book, and the desk that acts on it.
 *
 * This is a context rather than a prop chain because the order ticket is
 * mounted once in the shell, while the thing that opens it sits in whichever
 * route is current.
 *
 * The book is simulated and says so. **The prices are not.** The desk used to
 * look its instrument up in the six hand-authored mock names, and
 * `getInstrument` fell back to the first of them for anything else — which is
 * how a ticket opened on a $310 Apple read 147.04, and how a ticket opened on
 * any of the other thirteen thousand names read "Apple" outright. The quote
 * now arrives from the page's own snapshot, and nothing here looks a price up.
 */

export type { OrderSide, OrderType, EntryMode };
/** A refused order must not read like a filled one, so the notice carries tone. */
export type OrderNotice = { text: string; ok: boolean } | null;

/** Everything the desk needs to price and name an order. Real figures. */
export type TicketQuote = {
  id: string;
  name: string;
  /** Where it trades, for the ticket's identity line. */
  exchange: string;
  mark: string;
  color: string;
  /** Last traded price. */
  price: number;
  /** Day change, percent. */
  chg: number;
};

const STARTING_CASH = 56320;
const STARTING_POSITIONS: Record<string, number> = { AAPL: 12, NVDA: 30, MSFT: 8 };

/* The seeded book has to be worth something for a portfolio weight to mean
   anything, and its names are not on screen to be marked. These are the marks
   it opens at; every one is replaced the moment that name is actually quoted.
   Synthetic, like the positions they price — and nothing outside the weight
   calculation reads them. */
const STARTING_MARKS: Record<string, number> = { AAPL: 310, NVDA: 213, MSFT: 483 };

type PortfolioValue = {
  cash: number;
  positions: Record<string, number>;
  /** Cash plus the marked value of every open position. */
  portfolio: number;
  openPositions: number;
  sharesOf: (id: string) => number;

  following: Record<string, boolean>;
  toggleFollow: (id: string) => void;

  /** The instrument the ticket is trading, or null when it is closed. */
  ticket: TicketQuote | null;
  side: OrderSide;
  orderType: OrderType;
  mode: EntryMode;
  amount: string;
  shares: string;
  trigger: string;
  notice: OrderNotice;

  openTrade: (quote: TicketQuote) => void;
  closeTrade: () => void;
  setSide: (side: OrderSide) => void;
  setOrderType: (type: OrderType) => void;
  setMode: (mode: EntryMode) => void;
  setAmount: (raw: string) => void;
  setShares: (raw: string) => void;
  setTrigger: (raw: string) => void;
  place: () => void;
};

const PortfolioContext = createContext<PortfolioValue | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [cash, setCash] = useState(STARTING_CASH);
  const [positions, setPositions] = useState(STARTING_POSITIONS);
  const [marks, setMarks] = useState(STARTING_MARKS);
  const [following, setFollowing] = useState<Record<string, boolean>>({});

  const [ticket, setTicket] = useState<TicketQuote | null>(null);
  const [side, setSideState] = useState<OrderSide>("buy");
  const [orderType, setOrderTypeState] = useState<OrderType>("Market");
  const [mode, setModeState] = useState<EntryMode>("amount");
  const [amount, setAmountState] = useState("");
  const [shares, setSharesState] = useState("");
  const [trigger, setTriggerState] = useState("");
  const [notice, setNotice] = useState<OrderNotice>(null);

  /* Marked at the last price this session actually saw for each name. A book
     of thirteen thousand possible holdings has no price table behind it, and
     inventing one is what the desk was doing before. */
  const marked = useMemo(
    () =>
      Object.entries(positions).reduce(
        (total, [id, held]) => total + held * (marks[id] ?? 0),
        0,
      ),
    [positions, marks],
  );

  const sharesOf = useCallback((id: string) => positions[id] ?? 0, [positions]);

  const toggleFollow = useCallback((id: string) => {
    setFollowing((f) => ({ ...f, [id]: !f[id] }));
  }, []);

  /* Stable identities throughout: the ticket keys its focus trap and scroll
     lock off these, and an inline arrow would re-run those effects on every
     render of the shell. */
  const openTrade = useCallback((quote: TicketQuote) => {
    setNotice(null);
    setAmountState("");
    setSharesState("");
    setTriggerState("");
    setTicket(quote);
    /* Every real price the desk is handed marks the book. */
    if (quote.price > 0) setMarks((m) => ({ ...m, [quote.id]: quote.price }));
  }, []);

  const closeTrade = useCallback(() => {
    setTicket(null);
    setNotice(null);
  }, []);

  /* Any edit invalidates the last verdict — a notice left standing beside
     changed figures is a statement about an order that no longer exists.
     Written out one by one rather than through a factory: `useCallback` wants
     an inline function expression, and a returned closure is exactly what it
     cannot see through. */
  const setSide = useCallback((next: OrderSide) => {
    setSideState(next);
    setNotice(null);
  }, []);

  const setOrderType = useCallback((next: OrderType) => {
    setOrderTypeState(next);
    setNotice(null);
  }, []);

  const setMode = useCallback((next: EntryMode) => {
    setModeState(next);
    setNotice(null);
  }, []);

  const setAmount = useCallback((raw: string) => {
    setAmountState(raw);
    setNotice(null);
  }, []);

  const setShares = useCallback((raw: string) => {
    setSharesState(raw);
    setNotice(null);
  }, []);

  const setTrigger = useCallback((raw: string) => {
    setTriggerState(raw);
    setNotice(null);
  }, []);

  const place = useCallback(() => {
    if (!ticket) return;

    const draft: OrderDraft = {
      side,
      type: orderType,
      mode,
      amount,
      shares,
      trigger,
      price: ticket.price,
    };
    const held = positions[ticket.id] ?? 0;
    const verdict = validateOrder(draft, { cash, held });
    if (!verdict.ok) {
      setNotice({ text: verdict.reason, ok: false });
      return;
    }

    const filled = resolveOrder(draft);
    const at = filled.price ?? ticket.price;
    const qty = filled.shares;
    const sign = side === "buy" ? -1 : 1;

    setCash((c) => c + sign * filled.amount);
    setPositions((p) => ({ ...p, [ticket.id]: held - sign * qty }));
    setMarks((m) => ({ ...m, [ticket.id]: at }));
    setNotice({
      text: `Filled · ${side === "buy" ? "bought" : "sold"} ${formatShares(qty)} ${ticket.id} at ${usd(at)}`,
      ok: true,
    });
  }, [amount, cash, mode, orderType, positions, shares, side, ticket, trigger]);

  const value = useMemo<PortfolioValue>(
    () => ({
      cash,
      positions,
      portfolio: cash + marked,
      openPositions: Object.values(positions).filter((n) => n > 0).length,
      sharesOf,
      following,
      toggleFollow,
      ticket,
      side,
      orderType,
      mode,
      amount,
      shares,
      trigger,
      notice,
      openTrade,
      closeTrade,
      setSide,
      setOrderType,
      setMode,
      setAmount,
      setShares,
      setTrigger,
      place,
    }),
    [
      cash,
      positions,
      marked,
      sharesOf,
      following,
      toggleFollow,
      ticket,
      side,
      orderType,
      mode,
      amount,
      shares,
      trigger,
      notice,
      openTrade,
      closeTrade,
      setSide,
      setOrderType,
      setMode,
      setAmount,
      setShares,
      setTrigger,
      place,
    ],
  );

  return (
    <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>
  );
}

export function usePortfolio(): PortfolioValue {
  const value = useContext(PortfolioContext);
  if (!value) {
    throw new Error("usePortfolio must be used inside <PortfolioProvider>");
  }
  return value;
}
