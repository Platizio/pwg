import { useCallback, useEffect, useState } from 'react'

export type Ground = 'light' | 'dark'

/** Shared with the boot script in index.html. Changing one changes both. */
const KEY = 'pg-terminal-ground'

/**
 * The terminal's ground, and the one control that changes it.
 *
 * Light is the default: the reader arrives here from a white marketing site,
 * in daylight, usually before they have bought anything. Dark is opt-in and
 * remembered, for the live US session — 7pm to 1.30am IST.
 *
 * The attribute lives on <html>, not on the terminal's own shell, for one
 * reason: the shell does not exist until React has run, and a reader who
 * chose dark must not get a white flash first. index.html restores the stored
 * choice in a blocking inline script before anything paints; this hook only
 * reads what is already there and writes it back on a change.
 *
 * Which is why the initial state is the literal 'light' rather than a read of
 * the DOM. These pages are prerendered, so the first client render has to
 * produce exactly what renderToString produced or hydration fails. The effect
 * below adopts the real ground one tick later — and because the CSS keys off
 * the <html> attribute rather than off this state, that tick moves a button's
 * pressed label, never the page.
 */
export function useTerminalTheme(): [Ground, (next: Ground) => void] {
  const [ground, setGround] = useState<Ground>('light')

  useEffect(() => {
    setGround(document.documentElement.dataset.pgTheme === 'dark' ? 'dark' : 'light')
  }, [])

  /*
   * The phone's own browser chrome is part of the design too — an address bar
   * still painted brand navy above a warm-black terminal is the seam that
   * gives away a theme that only went halfway. The previous value is captured
   * and restored, so leaving the terminal hands the tag back to the site.
   *
   * Safe to mutate directly: react-helmet-async only reconciles tags carrying
   * data-rh, and this one is static in index.html.
   */
  useEffect(() => {
    const tag = document.querySelector('meta[name="theme-color"]')
    if (!tag) return
    const previous = tag.getAttribute('content')
    tag.setAttribute('content', ground === 'dark' ? '#080706' : '#f7f5f2')
    return () => {
      if (previous) tag.setAttribute('content', previous)
    }
  }, [ground])

  const choose = useCallback((next: Ground) => {
    document.documentElement.dataset.pgTheme = next
    setGround(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* Private browsing refuses the write. The choice still holds for this
         page; it simply will not survive a reload. */
    }
  }, [])

  return [ground, choose]
}
