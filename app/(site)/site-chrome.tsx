"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { startSmoothScroll, getLenis, scrollToTarget } from "@/src/lib/smoothScroll";

/* The chrome that used to live in src/App.tsx around <Outlet/>.

   React Router gave it a single place to run per navigation; the App Router
   has no such component, so the two effects that were keyed off `location`
   are keyed off usePathname() here and mounted once by the site layout. */

const HEADER_OFFSET = 96;

function ScrollHandler() {
  const pathname = usePathname();

  useEffect(() => {
    getLenis()?.scrollTo(0, { immediate: true });
    window.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    let observer: IntersectionObserver | null = null;
    const timer = setTimeout(() => {
      const els = document.querySelectorAll<HTMLElement>(".reveal:not(.in-view)");
      if (!("IntersectionObserver" in window)) {
        els.forEach((el) => el.classList.add("in-view"));
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("in-view");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
      );
      els.forEach((el) => io.observe(el));
      observer = io;
    }, 60);
    /* Held outside the timeout so a navigation that lands after it has fired
       still tears the observer down, instead of leaving one per route change. */
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
    };
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

export default function SiteChrome() {
  return (
    <>
      <SmoothScroll />
      <ScrollHandler />
    </>
  );
}
