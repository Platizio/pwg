"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { startSmoothScroll, getLenis, scrollToTarget } from "@/src/lib/smoothScroll";
import { useRipple } from "@/components/marketing/motion/ripple";

/* The chrome that used to live in src/App.tsx around <Outlet/>.

   React Router gave it a single place to run per navigation; the App Router
   has no such component, so the two effects that were keyed off `location`
   are keyed off usePathname() here and mounted once by the site layout. */

const HEADER_OFFSET = 96;

/* The `.reveal` IntersectionObserver used to live here. It added `.in-view`
   to elements whose hidden state was itself overridden by an
   `html:not(.js) .reveal` rule left behind by the retired Vite index.html —
   nothing in the App Router ever set that `.js` class, so the rule always
   matched and the whole system was inert. Entrance motion is now owned by
   <Reveal> in components/marketing/motion/. */
function ScrollHandler() {
  const pathname = usePathname();

  useEffect(() => {
    getLenis()?.scrollTo(0, { immediate: true });
    window.scrollTo({ top: 0 });
  }, [pathname]);


  return null;
}

function SmoothScroll() {
  useEffect(() => startSmoothScroll(), []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#"]');
      if (!(a instanceof HTMLAnchorElement)) return;
      const hash = a.getAttribute("href");
      if (!hash || hash === "#") return;
      const el = document.querySelector<HTMLElement>(hash);
      if (!el) return;
      e.preventDefault();
      scrollToTarget(el, -HEADER_OFFSET);
      history.pushState(null, "", hash);
      el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}

/* The press ripple, attached once for the whole document.
 *
 * The pointer-tracked specular that used to sit beside it is gone: a white
 * highlight sliding across the nav and every gold button as the cursor moved
 * read as a glow chasing the pointer rather than as light on a material. The
 * glass keeps its fixed sheen, which is the part that makes it look like
 * glass. */
function GlassEffects() {
  useRipple();
  return null;
}

export default function SiteChrome() {
  return (
    <>
      <SmoothScroll />
      <ScrollHandler />
      <GlassEffects />
    </>
  );
}
