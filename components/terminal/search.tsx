"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { IconSearch } from "@/components/icons";
import { Delta } from "@/components/ui/surface";
import { money } from "@/lib/market/format";
import type { Quote } from "@/lib/market/session";
import { cn } from "@/lib/ui";
import { instrumentPath } from "@/lib/market/paths";

/** Matches shown for a typed query. */
const LIMIT = 6;

/** Rows kept from each board in the panel's resting state. */
const BOARD_LIMIT = 5;

/* Fixed `en-US`, for the same reason the money formatter fixes it: the
   placeholder is rendered on the server as well, and a visitor-locale
   separator would disagree with the client and break hydration. */
const COUNT_FMT = new Intl.NumberFormat("en-US");

/**
 * Everything the box reads.
 *
 * All four lists come from the one request-cached snapshot the rest of the
 * terminal is drawn from, handed down through the shell, so the search costs
 * no fetch of its own and states no figure the dashboard would contradict.
 */
export type SearchData = {
  /** The corpus matched against — the most liquid names in the sweep. */
  universe: Quote[];
  mostActive: Quote[];
  gainers: Quote[];
  losers: Quote[];
};

/* Keys are section-scoped: a name can be both most active and a big mover,
   and two options sharing a DOM id would break aria-activedescendant. */
type Row = { quote: Quote; key: string };
type Group = { label: string | null; rows: Row[] };

/**
 * The terminal's front door.
 *
 * It lives in the frame rather than on the dashboard because a reader on
 * /instrument/AAPL who wants another name should not have to go home to type
 * it. Matching is deliberately forgiving — ticker prefix first, then name
 * anywhere — because a visitor is as likely to type "micro" as "AMD".
 *
 * Before anything is typed the panel carries the session's own boards rather
 * than sitting empty. They are live figures from the sweep. There is
 * deliberately no "most searched" beside them: nothing records a query here,
 * and a popularity ranking that cannot be measured would be an invented one.
 */
export function InstrumentSearch({ data }: { data: SearchData }) {
  const router = useRouter();
  const uid = useId();
  const listId = `${uid}-list`;
  const inputId = `${uid}-input`;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  /* The highlight is stored against the list it was chosen from, not as a bare
     index. A remote answer arriving can replace six local matches with two,
     and an index left where the typing put it would then point past the end of
     what is on screen. Deriving it back to 0 when the list changes identity
     costs nothing; resetting it from an effect cost a second render pass. */
  const [cursor, setCursor] = useState({ list: "", index: 0 });

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /* The tail of the market, fetched only when the local index comes up empty.
     The index holds the most liquid nine hundred names, which answers almost
     everything without a round trip; a reader looking for a small listing
     would otherwise be told it does not exist. */
  /* Tagged with the term it answers, so a result arriving after the reader
     has typed on is simply not used. Clearing it eagerly instead would mean a
     setState on every keystroke, and a cascading render with it. */
  /* `failed` is per term, so a lookup that errored reads as "unavailable"
     rather than "nothing matches" — the second is a claim about the market,
     the first about our plumbing, and a reader acts on them differently. */
  const [remote, setRemote] = useState<{ term: string; rows: Quote[]; failed: boolean }>({
    term: "",
    rows: [],
    failed: false,
  });

  const term = query.trim().toLowerCase();
  const universe = data.universe;

  /* Memoised because this is nine hundred rows scored, sorted and cut, and it
     was running again for every keystroke, every hover and every arrow key —
     the great majority of renders here do not change the term at all. */
  const local = useMemo<Quote[]>(() => {
    if (!term) return [];
    return universe
      .map((q) => {
        const id = q.id.toLowerCase();
        const name = q.name.toLowerCase();
        /* Lower score sorts first: an exact ticker beats a ticker prefix,
           which beats a name that merely contains the term. */
        const score =
          id === term
            ? 0
            : id.startsWith(term)
              ? 1
              : name.startsWith(term)
                ? 2
                : name.includes(term)
                  ? 3
                  : -1;
        return { q, score };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score || a.q.name.localeCompare(b.q.name))
      .slice(0, LIMIT)
      .map((r) => r.q);
  }, [universe, term]);

  /* Still waiting on the remote lookup for this exact term. "Nothing matches"
     used to show during the wait, and a reader who believed it went away. */
  const searching = local.length === 0 && term.length >= 2 && remote.term !== term;

  const results = useMemo<Quote[]>(
    () => (local.length > 0 ? local : remote.term === term ? remote.rows : []),
    [local, remote, term],
  );

  const groups = useMemo<Group[]>(() => {
    if (term) {
      return [
        {
          label: null,
          rows: results.map((q) => ({ quote: q, key: `hit-${q.id}` })),
        },
      ];
    }

    /* The two direction boards read as one list, largest move first, which is
       what the label claims and what a reader scanning for the day's extremes
       is actually after. */
    const movers = [...data.gainers, ...data.losers]
      .sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))
      .slice(0, BOARD_LIMIT);

    return [
      {
        label: "Most active today",
        rows: data.mostActive
          .slice(0, BOARD_LIMIT)
          .map((q) => ({ quote: q, key: `active-${q.id}` })),
      },
      {
        label: "Biggest movers",
        rows: movers.map((q) => ({ quote: q, key: `mover-${q.id}` })),
      },
    ].filter((group) => group.rows.length > 0);
  }, [data.gainers, data.losers, data.mostActive, results, term]);

  /* One flat list, because the highlight and the keys move across the boards
     rather than within either of them. */
  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);

  const listKey = useMemo(() => rows.map((row) => row.key).join("|"), [rows]);
  const active = cursor.list === listKey ? cursor.index : 0;
  const setActive = (index: number) => setCursor({ list: listKey, index });

  useEffect(() => {
    if (local.length > 0 || term.length < 2) return;
    /* Debounced, and abandoned if the reader keeps typing — a request per
       keystroke against a shared gateway is a rate-limit incident waiting to
       happen. */
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, {
        signal: controller.signal,
      })
        .then((r) => {
          if (!r.ok) throw new Error(`search ${r.status}`);
          return r.json();
        })
        .then((body: { results?: Array<{ id: string; name: string }> }) => {
          setRemote({
            term,
            failed: false,
            rows: (body.results ?? []).map((hit) => ({
              id: hit.id,
              name: hit.name,
              mark: hit.id.slice(0, 1),
              color: "#B0BFCB",
              price: 0,
              chg: 0,
              seed: 0,
              sector: "",
              covered: false,
            })),
          });
        })
        .catch((error: unknown) => {
          /* An abort is the reader typing on; say nothing. A real failure is
             recorded against this term so the panel stops claiming there is no
             such company when the truth is that we could not ask. */
          if (error instanceof DOMException && error.name === "AbortError") return;
          setRemote({ term, rows: [], failed: true });
        });
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term, local.length]);

  /* The panel scrolls once both boards are in it, so the highlight has to be
     carried along; otherwise End moves a selection the reader cannot see. */
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  /* Warming the row the reader is pointing at.
     Nothing in this panel is a <Link>, so nothing is prefetched by entering
     the viewport: the combobox pattern requires each result to be a
     `<button role="option">` that hands off to router.push, and that leaves
     the route cold until the click — on an instrument that can take eight
     seconds to assemble. So the warming is done by hand, against the one row
     the reader has actually singled out.

     The guard is a single ref rather than a set, because what it is there to
     stop is the same row being announced twice in a row — the pointer that
     highlights it and the mouse that enters it are two events on one target —
     not to keep a history. Next's own prefetch queue already de-duplicates,
     drops links scrolled out of view, and lets newer requests displace older
     ones; a second cache in front of it would only go stale. */
  const lastPrefetched = useRef<string | null>(null);

  /* Both sources hand their path to the same state rather than calling the
     router themselves, because the guard has to read a ref and a function that
     closes over a ref cannot be handed to a JSX callback — the same constraint
     `go` below is written around. An effect is where a ref may be read, so the
     asking happens there and the handlers only say which row is wanted. */
  const [wanted, setWanted] = useState<string | null>(null);

  useEffect(() => {
    if (wanted === null || lastPrefetched.current === wanted) return;
    lastPrefetched.current = wanted;
    router.prefetch(wanted);
  }, [wanted, router]);

  /* The keyboard's highlight reaches it through a hundred milliseconds of
     delay, because that highlight moves on every arrow key: held ArrowDown
     walks the whole list, and warming each row on the way past would spend ten
     requests to arrive at the one the reader wanted. Long enough to mean
     "stopped here", short enough that stopping and pressing Enter still finds
     the route already fetched. */
  const activeId = open ? rows[active]?.quote.id : undefined;
  useEffect(() => {
    if (activeId === undefined) return;
    const timer = setTimeout(() => setWanted(instrumentPath(activeId)), 100);
    return () => clearTimeout(timer);
  }, [activeId]);

  /* Clicking anywhere else closes the list. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  /* The box is the only way into a name from most of the terminal, so it is
     reachable without the mouse from anywhere in it. Anyone already typing
     keeps their keystroke — including in this input, where "/" is a character
     like any other. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");
      if (typing) return;

      const wanted =
        e.key === "/" ||
        ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K"));
      if (!wanted) return;

      e.preventDefault();
      inputRef.current?.focus();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function go(quote: Quote) {
    setOpen(false);
    setQuery("");
    /* Whatever is focused — the input on Enter, the option on a tap — gives it
       up, which is what dismisses the keyboard on a phone. Read from the
       document rather than from `inputRef`, because a function that closes
       over a ref cannot be handed to a callback the compiler is unable to
       prove runs after render. */
    (document.activeElement as HTMLElement | null)?.blur();
    router.push(instrumentPath(quote.id));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (rows.length === 0) return;

    const move = (next: number) => {
      e.preventDefault();
      setOpen(true);
      setActive(next);
    };

    if (e.key === "ArrowDown") return move((active + 1) % rows.length);
    if (e.key === "ArrowUp")
      return move((active - 1 + rows.length) % rows.length);

    /* Home and End belong to the caret while the panel is shut. They only
       take the list over once there is a list on screen to move within. */
    if (!open) return;
    if (e.key === "Home") return move(0);
    if (e.key === "End") return move(rows.length - 1);
    if (e.key === "Enter") {
      e.preventDefault();
      go((rows[active] ?? rows[0]).quote);
    }
  }

  const activeRow = rows[active];

  return (
    <div
      ref={rootRef}
      /* Static on a phone, so the panel below hangs from the chrome bar rather
         than from the box — see the panel's anchor. */
      className="relative w-full max-sm:static"
      /* Close when focus leaves the whole widget — Tab out of the input used to
         leave the panel open over the page, and Escape stopped working once
         focus had gone, since it is only heard by the input. The options are
         tabIndex -1 and chosen by pointer, so this never fires mid-selection. */
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Search stocks by name or ticker
      </label>

      {/*
        Unfilled, and built to the same anatomy as the session readout at the
        other end of this bar: mark, label, divider, mono tail, one pill around
        all of it. It used to carry a gradient ground of its own, which made it
        the only filled surface in a terminal whose chrome is hairlines and
        space — a foreign object sat on a shelf rather than a control belonging
        to the frame.

        The one place it departs from that family is the stroke. At a hairline
        in the rule colour (1.4:1 against the shell in either theme) the box
        all but vanished into the bar, and the one control every reader needs
        was the hardest thing in the chrome to find. It is drawn at 2px in
        the tertiary ink at 65%, which measures 3.1:1 against the shell in both
        themes — the non-text contrast a control's boundary is owed — and is
        still a neutral, so Invest stays the only warm thing on the bar at
        rest. Focus is where this one warms: a gold stroke and a soft gold
        ring, on keyboard and pointer focus alike, because a search box that
        has the caret is always "in use".

        h-12 is the height, not a minimum: the icon, the text and the shortcut
        are centred on it geometrically rather than floated by padding, which
        is what keeps the three on one line.
      */}
      <div
        className={cn(
          "group/search flex h-12 items-center gap-3 rounded-full px-4 transition-[border-color,box-shadow,background-color] duration-300 sm:px-5",
          /* 2px, not 1.5. Chrome snaps a fractional border down to a whole
             pixel — measured at 1px on both a 1x and a 2x screen — so 1.5
             would have drawn the very hairline this replaces. */
          "border-2",
          "border-ink-3/65 hover:border-ink-3/90",
          "focus-within:border-gold focus-within:shadow-[0_0_0_3px_rgba(var(--c-gold-rgb),0.2)] hover:focus-within:border-gold",
          open && "bg-[rgba(var(--c-gold-rgb),0.04)]",
        )}
      >
        <IconSearch
          className={cn(
            "h-[18px] w-[18px] flex-none transition-colors duration-300",
            "text-ink-3 group-focus-within/search:text-gold",
          )}
        />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && activeRow ? `${uid}-${activeRow.key}` : undefined
          }
          /* A dead feed leaves the corpus empty, and "Search 0 stocks" is
             a figure stating something untrue about the market rather than
             about the box. */
          placeholder={
            universe.length > 0
              ? `Search ${COUNT_FMT.format(universe.length)} stocks`
              : "Search stocks"
          }
          /* 16px below `sm`: iOS zooms the page into any field set smaller the
             moment it takes focus, and a terminal that lurches sideways on the
             first tap reads as broken. */
          className="h-full w-full min-w-0 bg-transparent text-[16px] leading-none text-ink placeholder:text-ink-3 focus:outline-none sm:text-[14.5px]"
        />
        {/* The shortcut, stated where the control is, behind the same hairline
            divider the clock sits behind opposite. It had a bordered cap of
            its own, which put a box inside a box; the divider says the same
            thing with a single pixel. It goes while the box is in use, where
            it would sit under the reader's own text, and it is kept off touch
            widths, where there is no key to press.

            Both sit in 18px boxes, the icon's own size, and are centred in
            them rather than left on the text's line box, so the glass at one
            end and the slash at the other share a centre line exactly. */}
        {!open && (
          <>
            <span
              aria-hidden="true"
              className="hidden h-[18px] w-px flex-none bg-rule-mono sm:block"
            />
            <kbd
              aria-hidden="true"
              className="font-mono hidden h-[18px] min-w-[18px] flex-none place-items-center text-[13px] leading-none text-ink-3 sm:grid"
            >
              /
            </kbd>
          </>
        )}
      </div>

      {open && (
        /*
          The anchor and the surface are two elements on purpose. `.edge-lit`
          declares `position: relative` for its own top hairline, and it sits
          in the same cascade layer as Tailwind's `absolute` but later in the
          file — so a panel carrying both classes resolved to `relative` and
          quietly took the page with it, adding five hundred pixels to the
          chrome row and pushing the whole terminal down every time the box was
          opened. The float belongs to a wrapper that has no other opinions.

          It is exactly as wide as the box from `sm` up. On a phone the box
          shares its row with Invest and is barely 240px, which wrapped every
          fund name onto two lines beside its price, so there the root drops
          its positioning and the panel spans the chrome bar instead, inset by
          the bar's own 16px gutter.
        */
        <div className="absolute top-[calc(100%+9px)] right-0 left-0 z-40 max-sm:right-4 max-sm:left-4">
          <div
            ref={listRef}
            /* The one place a shadow is earned here: the panel is displaced over
             the page, and the vocabulary's tooltip lift is what marks that. */
            className="card edge-lit max-h-[min(70vh,560px)] overflow-y-auto p-2 shadow-[0_16px_34px_rgba(0,0,0,0.7)]"
            role="listbox"
            id={listId}
            aria-label={term ? "Stock results" : "Watch list"}
          >
            {rows.length === 0 ? (
              <p className="px-4 py-5 text-[13.5px] leading-[1.7] text-ink-3">
                {term
                  ? searching
                    ? `Searching for “${query.trim()}”…`
                    : remote.term === term && remote.failed
                      ? "Search is unavailable just now. If you know the ticker, type it in full."
                      : `Nothing here matches “${query.trim()}”.`
                  : "The boards are not quoting just now, so there is nothing to show here."}
              </p>
            ) : (
              groups.map((group, gi) => {
                const offset = groups
                  .slice(0, gi)
                  .reduce((n, earlier) => n + earlier.rows.length, 0);
                const labelId = `${uid}-board-${gi}`;

                return (
                  <div
                    key={group.label ?? "matches"}
                    role="group"
                    aria-labelledby={group.label === null ? undefined : labelId}
                    /* A rule between the boards, not a filled box — the panel is
                     one surface and the label does the naming. */
                    className={cn(
                      gi > 0 && "mt-2 border-t border-rule-list pt-2",
                    )}
                  >
                    {group.label !== null && (
                      <p id={labelId} className="eyebrow px-3 pt-1.5 pb-2">
                        {group.label}
                      </p>
                    )}

                    {group.rows.map((row, i) => {
                      const index = offset + i;
                      const on = index === active;
                      return (
                        <button
                          key={row.key}
                          type="button"
                          id={`${uid}-${row.key}`}
                          role="option"
                          aria-selected={on}
                          data-active={on}
                          /* Out of the tab order on purpose. A combobox keeps DOM
                             focus on the input and points at the active row with
                             aria-activedescendant; letting each option take focus
                             instead meant Tab walked through up to ten results,
                             and while focus sat in the list the widget's own keys
                             went dead — Escape stopped closing it and the arrows
                             scrolled the panel rather than moving the selection.
                             Pointer selection is unaffected: onClick does not
                             require the element to be tabbable. */
                          tabIndex={-1}
                          onPointerEnter={() => setActive(index)}
                          /* A mouse arriving on a row is the clearest
                             statement of intent this widget gets, so it does
                             not wait out the keyboard's debounce — the
                             highlight it also sets will name the same path a
                             moment later and find it already asked for. */
                          onMouseEnter={() => setWanted(instrumentPath(row.quote.id))}
                          onClick={() => go(row.quote)}
                          className={cn(
                            "flex w-full min-h-12 items-center gap-3 rounded-[10px] px-3 text-left transition-colors",
                            /* A hard-coded champagne at 9% vanished on the light
                               theme's cream, so keyboard users could not see which
                               row Enter would open. The themed gold tint plus an
                               inset left rule reads on both themes and does not
                               depend on a faint fill alone. */
                            on &&
                              "bg-[rgba(var(--c-gold-rgb),0.12)] shadow-[inset_2px_0_0_rgba(var(--c-gold-rgb),0.7)]",
                          )}
                        >
                          <Hit quote={row.quote} />
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** One name: its monogram, what it is called, and where it stands today. */
function Hit({ quote }: { quote: Quote }) {
  return (
    <>
      <span
        aria-hidden="true"
        /* Sized from its tile, per the monogram rule. */
        /* Decorative, so it gives its width back on a phone, where the panel
           is at its narrowest and every pixel goes to the name. */
        className="font-serif hidden h-9 w-9 flex-none place-items-center rounded-[10px] border border-[rgba(217,189,139,0.14)] sm:grid"
        style={{ color: quote.color, fontSize: 17 }}
      >
        {quote.mark}
      </span>
      <span className="min-w-0 flex-1">
        {/* Two lines, not an ellipsis: on a phone a single truncated line cut
            names to a few characters, and the name is what the reader is
            choosing between. */}
        <span className="line-clamp-2 block text-[13.5px] font-medium break-words text-ink">
          {quote.name}
        </span>
        <span className="font-mono mt-0.5 block text-[12px] tracking-[0.05em] text-ink-3">
          {quote.id}
        </span>
      </span>
      <span className="flex-none text-right">
        {/* A remote match carries a name and a ticker but no quote yet. A dash
            says so; $0.00 would not. */}
        {quote.price > 0 ? (
          <>
            <span className="font-mono block text-[13px] text-ink-2">
              {money(quote.price)}
            </span>
            <span className="mt-1 flex justify-end">
              <Delta value={quote.chg} size="text-[11.5px]" />
            </span>
          </>
        ) : (
          <span className="font-mono block text-[13px] text-ink-3">—</span>
        )}
      </span>
    </>
  );
}
