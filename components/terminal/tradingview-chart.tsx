"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * TradingView's hosted advanced chart, mounted by hand into a div React does
 * not own.
 *
 * WHY THE HOST DIV IS DELIBERATELY EMPTY IN JSX
 *
 * The embed script is not a component; it is a self-replacing <script> that
 * rewrites its own parent. Reading their bundle: it takes `document.currentScript`,
 * walks to `parentNode`, and then — inside that parent — removes any
 * `#tradingview-copyright` node it finds, replaces the
 * `.tradingview-widget-container__widget` child with its iframe, and removes
 * the script element itself. Every one of those is a mutation of DOM that
 * React would believe it still owns if React had rendered it. The first
 * subsequent re-render or unmount would then fail on a node that is no longer
 * where React left it — the classic "NotFoundError: failed to execute
 * removeChild" that makes third-party embeds feel haunted.
 *
 * So the contract here is strict: `hostRef` points at a div with no JSX
 * children, ever. Everything inside it is created imperatively and destroyed
 * imperatively. The attribution link lives outside that div, as a React
 * sibling, which is also why the script cannot find it and start rewriting its
 * hrefs.
 *
 * WHY THE CLEANUP MATTERS MORE THAN IT LOOKS
 *
 * TradingView's own React snippet appends the script and returns nothing. In
 * development React 19 mounts every effect, tears it down, and mounts it again
 * to surface exactly this class of bug — so that snippet ships two scripts and
 * stacks two charts on top of each other, and the second one silently swallows
 * the first one's clicks. Emptying the container on cleanup is what makes the
 * double mount a no-op, and it is genuinely sufficient rather than merely
 * tidy: a script that is already in flight when we empty the container will
 * execute with `parentNode === null`, so it can only throw inside their own
 * code and cannot find its way into the container we built afterwards. Their
 * lookup is scoped to the script's parent, never to the document.
 *
 * WHY A THEME CHANGE REBUILDS THE WHOLE THING
 *
 * The chart is a cross-origin iframe. Its colours are baked into the query
 * string the loader builds at construction time, and nothing on this side of
 * the boundary can reach in and restyle it afterwards. Following the page's
 * lighting therefore means tearing the widget down and building a new one,
 * which is what putting `lighting` in the dependency array does.
 */

const EMBED_SRC =
  "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

type Lighting = "light" | "dark";

/**
 * The chart's ground and grid in each lighting, as literals.
 *
 * These cannot be `C.page` or `var(--color-page)` like everything else in the
 * app: the values are serialised into JSON and handed across an origin
 * boundary to a document that has never seen this stylesheet, so a `var()`
 * reference would arrive as a meaningless string. This is the same exception
 * `chartPalette()` in lib/tokens.ts carves out for <canvas>, for the same
 * reason, and these literals are the ones app/globals.css declares.
 *
 * The grid is ink at a tenth rather than the flat white the vendor snippet
 * ships. White at 20% is a heavy cage on paper — the light theme's ground is
 * cream, not black — and the two grids are derived from each lighting's own
 * ink so the chart's structure sits at the same weight as every rule on the
 * page around it.
 */
const CANVAS: Record<Lighting, { background: string; grid: string }> = {
  dark: { background: "#080706", grid: "rgba(242, 237, 229, 0.10)" },
  light: { background: "#f5f1e8", grid: "rgba(26, 18, 7, 0.10)" },
};

/* The page's lighting lives in two places this component does not own, and the
   subscription has to cover both. `data-theme` on <html> is the reader's
   explicit pin, written before first paint by the script in app/layout.tsx;
   the media query is what decides for everyone who has never touched the
   toggle, which is most people. The precedent is the palette hook in
   components/terminal/price-chart.tsx. */
function subscribeToLighting(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", onChange);

  return () => {
    observer.disconnect();
    mq.removeEventListener("change", onChange);
  };
}

/* A pinned choice wins in both directions; without one the page is still
   following the system, so the system is what gets read. Reading only
   `dataset.theme` would report "not pinned" for the majority case and default
   every one of those readers to dark — including the ones sitting in a bright
   room with a light desktop. This is the same read the lighting control in
   components/terminal/theme-toggle.tsx performs; it is private to that file,
   so it is restated here rather than exported out of a component. */
function readLighting(): Lighting {
  const pinned = document.documentElement.dataset.theme;
  if (pinned === "light" || pinned === "dark") return pinned;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/* The server knows neither the stored choice nor the system setting. Saying so
   — rather than guessing dark — is what lets the effect below hold the widget
   back until the answer is real, so the reader gets one chart in the right
   lighting instead of a dark one that flips a frame later. */
const readLightingOnServer = (): Lighting | null => null;

/** The settings blob the loader reads out of its own script element. */
function widgetSettings(symbol: string, lighting: Lighting) {
  const { background, grid } = CANVAS[lighting];
  return {
    allow_symbol_change: true,
    autosize: true,
    backgroundColor: background,
    calendar: false,
    compareSymbols: [],
    details: false,
    gridColor: grid,
    hide_legend: false,
    hide_side_toolbar: true,
    hide_top_toolbar: false,
    hide_volume: false,
    hotlist: false,
    interval: "30",
    locale: "en",
    save_image: true,
    studies: [],
    style: "1",
    support_host: "https://www.tradingview.com",
    symbol,
    theme: lighting,
    /* The audience is in India. A US chart labelled in New York time is a
       chart every reader has to translate before they can use it. */
    timezone: "Asia/Kolkata",
    watchlist: [],
    withdateranges: false,
  };
}

/* TradingView's public symbol page writes the venue with a dash where the
   widget writes it with a colon: NASDAQ:AAPL is /symbols/NASDAQ-AAPL/. A bare
   symbol carries no colon and needs no rewrite. Encoded because the symbol
   reaches us from the URL and share classes carry a dot. */
function symbolPageHref(symbol: string): string {
  return `https://www.tradingview.com/symbols/${encodeURIComponent(symbol.replace(":", "-"))}/`;
}

export function TradingViewChart({ symbol }: { symbol: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const lighting = useSyncExternalStore(
    subscribeToLighting,
    readLighting,
    readLightingOnServer,
  );

  useEffect(() => {
    const host = hostRef.current;

    /* Two reasons to do nothing yet, both real. The ref is null on the render
       that precedes the first commit, and the vendor snippet dereferences it
       anyway — `container.current.appendChild(...)` is a crash waiting for the
       first slow mount. And the lighting is null until hydration finishes, at
       which point this effect re-runs with the answer. */
    if (!host || lighting === null) return;

    /* The node their loader looks for and replaces with its iframe. Created
       here rather than in JSX because the loader destroys it. */
    const slot = document.createElement("div");
    slot.className = "tradingview-widget-container__widget";
    slot.style.height = "100%";
    slot.style.width = "100%";
    host.appendChild(slot);

    const script = document.createElement("script");
    script.src = EMBED_SRC;
    script.type = "text/javascript";
    script.async = true;
    /* textContent rather than innerHTML. The loader reads either one the same
       way, but the symbol in this blob came out of a URL a stranger can write,
       and assigning innerHTML asks the HTML parser to look at it first. JSON
       inside a text node is just text. */
    script.textContent = JSON.stringify(widgetSettings(symbol, lighting));
    host.appendChild(script);

    return () => {
      /* The whole point. Everything the loader built lives under `host`,
         including the iframe it swapped in for `slot` and any node it moved
         around in the process, so emptying `host` is a complete teardown and
         needs no bookkeeping of what the third party did in between. */
      host.replaceChildren();
    };
  }, [symbol, lighting]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* No children, now or ever — see the header. The vendor class is what
          the loader tests for with classList.contains before it will treat
          this node as its container. */}
      <div
        ref={hostRef}
        role="region"
        aria-label={`${symbol} interactive chart`}
        className="tradingview-widget-container min-h-0 flex-1"
      />

      {/* TradingView's terms require the attribution. It sits outside the host
          and deliberately does not carry their `tradingview-widget-copyright`
          class, for two reasons: inside the host their loader would adopt it,
          move it and rewrite its href while React still believed it owned the
          node; and the loader injects a stylesheet that paints anything with
          that class in their brand blue with !important, which would take the
          one link on this page out of the Lux palette. */}
      <div className="border-t border-rule-section px-4 py-2 sm:px-5">
        <a
          href={symbolPageHref(symbol)}
          target="_blank"
          rel="noopener nofollow"
          className="eyebrow eyebrow-gold transition-colors hover:text-gold"
        >
          {symbol} chart by TradingView
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}
