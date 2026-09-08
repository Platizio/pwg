"use client"

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { useAppContext } from '@/src/context/AppContext'
import { getLenis } from '@/src/lib/smoothScroll'
import { usePresence } from '@/lib/use-presence'
import { EASE, EASE_CSS } from '@/lib/tokens'
import { TRADING_PLATFORM_URL } from '@/src/constants'
import { Arrow } from '@/components/marketing/ui/buttons'

/* Two numbers, not one.

   A single threshold flips on every sub-pixel wobble when the reader parks the
   page right on it, and each flip resizes the pill — so a bar that is meant to
   settle reads as a shudder instead. Condensing takes 80px of travel; coming
   back out takes returning to 56. You have to mean it in both directions. */
const CONDENSE_AT = 80
const RELEASE_AT = 56

/* chrome.css collapses the horizontal nav into a slide-out panel at 1080, and
   the same number decides both of the things that change with it here.

   Above it: there is a bar to condense. Below it: there is not — the pill is a
   wordmark and a burger, and chrome.css's own note at that breakpoint says
   tightening it further "only jitters it". Below it the list is also a drawer
   rather than a row, which is the other half of what this file has to know. */
const WIDE = '(min-width: 1081px)'

/* The pill's resting vertical padding, from chrome.css. Condensing halves it;
   the rail hands the difference straight back. See the header's style below
   for why that giveback is the whole trick. */
const PILL_PAD = '8px'
const PILL_PAD_TIGHT = '4px'
const RAIL_GIVEBACK = '8px' // (8 - 4) * 2, the height the pill stops using

/* --t in tokens.css: the transition chrome.css slides the drawer with. The
   panel is on screen for exactly this long after it is told to close. */
const DRAWER_EXIT_MS = 240

const MENU_ID = 'primary-nav-menu'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/* Everything inside `root` that a Tab can actually reach.

   `[inert]` is filtered out rather than left to the selector: querySelectorAll
   still returns nodes inside an inert subtree, and focus() on one of them is a
   silent no-op. Without this the ring would dead-end at whichever end the
   collapsed Help submenu's three links happened to sit — the trap would look
   correct in the DOM and do nothing on the keyboard. */
function tabbable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest('[inert]'),
  )
}

/* matchMedia read through useSyncExternalStore rather than through an effect.

   This is a genuine external store — the browser owns the value and pushes
   changes — and reading it the React 19 way means the first client render
   already has the right answer instead of painting a wrong one and correcting
   it a frame later. That matters here because the wrong answer is visible: it
   is either a nav that condenses at a width where there is nothing to condense,
   or a drawer that spends a frame not being a drawer.

   `serverValue` is passed in rather than assumed, because there is no safe
   universal default — see the call site for which way this one has to fail. */
function useMediaQuery(query: string, serverValue: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  )
}

/* React Router's NavLink, reimplemented over next/link.

   The nav calls it with a className *function* and an `end` flag, and relies on
   the aria-current it set for free. Reproducing that API here keeps all eight
   call sites — and the travelling marker's onPointerEnter — exactly as they
   were, rather than rewriting each one around usePathname. */
function NavLink({
  href,
  className,
  end,
  children,
  ...rest
}: {
  href: string;
  className?: (state: { isActive: boolean }) => string | undefined;
  end?: boolean;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<typeof Link>, "href" | "className">) {
  const pathname = usePathname() ?? "";
  const isActive = end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={className?.({ isActive })}
      aria-current={isActive ? "page" : undefined}
      {...rest}
    >
      {children}
    </Link>
  );
}

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const { openContact } = useAppContext()
  const pathname = usePathname()

  /* Fails open, deliberately.
   *
   * The server cannot know the viewport, so one of the two layouts is rendered
   * wrong for the few hundred milliseconds before hydration. Guessing "wide"
   * makes that window a drawer whose off-screen links are briefly tabbable —
   * which is exactly the status quo this file is fixing, and it corrects
   * itself the moment React attaches. Guessing "narrow" would instead ship
   * HTML with `inert` on the primary nav, so a desktop reader who clicked
   * before hydration would find the whole menu dead. A stale nav beats a dead
   * one. */
  const isWide = useMediaQuery(WIDE, true)
  const isDrawer = !isWide

  const listRef = useRef<HTMLUListElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  /*
   * One indicator that travels between the links rather than eight that each
   * fade in place. It is an enhancement layered over a working base: every
   * link keeps its own CSS underline, and the list only switches to the
   * travelling marker once this has measured where it belongs — so a reader
   * without JavaScript still sees which page they are on.
   *
   * It moves on transform alone. The bar is laid out at 100px and scaled to
   * the width it needs, because animating `width` would relayout the nav on
   * every frame of the glide.
   */
  const [marker, setMarker] = useState<{ x: number; w: number } | null>(null)
  /*
   * The glide is right between two pages and wrong on the way to the first
   * one. Until the marker has been measured it sits untranslated at the left
   * edge of the list, so animating that first placement swept it across every
   * label — for the length of the transition the underline sat under the
   * wrong item. The first placement snaps; every one after it travels.
   */
  const [settled, setSettled] = useState(false)

  const placeMarker = useCallback((target?: HTMLElement | null) => {
    const list = listRef.current
    if (!list) return
    const el = target ?? list.querySelector<HTMLElement>('.active')
    if (!el) return setMarker(null)
    const lr = list.getBoundingClientRect()
    const er = el.getBoundingClientRect()
    // the marker underlines the label, not the padding around it
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0
    setMarker({ x: er.left - lr.left + pad, w: Math.max(er.width - pad * 2, 0) })
  }, [])

  useEffect(() => {
    if (!marker || settled) return
    const id = requestAnimationFrame(() => setSettled(true))
    return () => cancelAnimationFrame(id)
  }, [marker, settled])

  /*
   * The condense state.
   *
   * A boolean off window.scrollY, and nothing else. No rAF loop and no
   * IntersectionObserver sentinel: the listener does one property read and one
   * comparison, and React bails out of the render entirely when the boolean
   * has not changed — which is every scroll event but two.
   *
   * Lenis writes real window scroll rather than transforming a wrapper, so an
   * ordinary passive listener sees its frames like any other. Passive because
   * this will never call preventDefault, and saying so up front keeps it off
   * the wheel's blocking path.
   */
  const [condensed, setCondensed] = useState(false)

  useEffect(() => {
    const read = () =>
      setCondensed((was) =>
        was ? window.scrollY > RELEASE_AT : window.scrollY >= CONDENSE_AT,
      )

    /* Read once on mount rather than waiting for the first scroll event. A
       reload part-way down a page, or a link straight into an anchor, restores
       the scroll offset without ever firing one — and the bar would sit at full
       height over a page that is visibly not at its top. */
    read()
    window.addEventListener('scroll', read, { passive: true })
    return () => window.removeEventListener('scroll', read)
  }, [])

  /* The geometry half of the condense only applies where there is a bar to
     condense. The ground (glass.css, keyed on data-condensed) applies at every
     width, because type passing under the pill is hardest to read on the
     narrowest screen, not the widest. */
  const tighten = condensed && isWide

  useEffect(() => {
    placeMarker()
    const onResize = () => placeMarker()
    window.addEventListener('resize', onResize)
    /* Web fonts land after first paint and change every label's width. */
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    fonts?.ready.then(() => placeMarker())
    return () => window.removeEventListener('resize', onResize)
    /* `tighten` is in here for the same reason `pathname` is: it is a layout
       change under a marker whose position was measured off the DOM. It does
       not move the labels horizontally today — the pill's padding is vertical
       — but the marker's only source of truth is a measurement, and leaving a
       geometry flip out of the deps is how that measurement goes stale the
       first time the condensed state changes anything else about the row. */
  }, [pathname, placeMarker, tighten])

  /* Close the mobile menu and dropdowns on navigation.

     Adjusted during render against the last path rather than set from an
     effect: an effect runs after the new page has already painted with the
     menu still open, and setting state there cascades a second render to
     close it. Comparing here means the new route never paints open. */
  const [navPath, setNavPath] = useState(pathname)
  if (navPath !== pathname) {
    setNavPath(pathname)
    setMenuOpen(false)
    setResourcesOpen(false)
  }

  /* True while the drawer is on screen — open, or still sliding away.
   *
   * The panel is never unmounted: it is the same <ul> as the desktop row, slid
   * out of view by a transform. So the failure usePresence exists to prevent is
   * here in its CSS form, and worse, because there is no exit callback to hang
   * anything off — closed, the panel sits off the top of the viewport with
   * eleven links and buttons still in the tab order. `pointer-events: none`
   * stops the mouse and does nothing at all to Tab.
   *
   * `inert` is what removes them, and this is what says when: the panel is
   * inert exactly when it is off screen. Flipping inert on the frame the close
   * begins would instead kill a control the reader can still plainly see and
   * is still sliding past their thumb, for the 240ms it takes to leave. */
  const drawerOnScreen = usePresence(menuOpen, DRAWER_EXIT_MS)

  /*
   * The drawer behaves like a drawer.
   *
   * It covers the page and locks it, so it owes the reader the four things
   * every panel of that kind owes: focus moves in, Tab cannot leave, Escape
   * closes it, and focus goes back to the control that opened it. None of that
   * was here — the menu opened, and a keyboard reader's next Tab went to the
   * page behind it while the panel sat over the top.
   *
   * Modelled on components/ui/reader.tsx, minus role="dialog": this is the
   * primary <nav>'s own list, and relabelling a <ul> inside a landmark as a
   * dialog costs the list and navigation semantics it already has. It is a
   * disclosure — aria-expanded and aria-controls on the burger — that happens
   * to warrant a trap because of what it covers.
   */
  useEffect(() => {
    if (!menuOpen || !isDrawer) return
    const panel = listRef.current
    if (!panel) return
    const toggle = toggleRef.current

    tabbable(panel)[0]?.focus({ preventScroll: true })

    /* Two locks, because two separate things scroll this page. `overflow:
       hidden` stops the document; Lenis runs its own raf loop writing scroll
       offsets and never consults the body's overflow, so it has to be told
       as well or the page slides behind the open panel. It is null under
       prefers-reduced-motion, where it was never started. */
    const lenis = getLenis()
    lenis?.stop()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenuOpen(false)
        return
      }
      if (e.key !== 'Tab') return

      /* Re-read on every Tab rather than captured once on open: the Help
         submenu expands inside the panel, and a ring captured on open would
         not contain the three links it adds. */
      const ring = tabbable(panel)
      /* The burger sits outside the panel but is the drawer's close button, so
         it belongs in the ring as its last stop — not as a way out of it. It
         is already last in DOM order, so the ring stays in reading order. */
      if (toggle) ring.push(toggle)
      if (!ring.length) return

      const first = ring[0]
      const last = ring[ring.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      lenis?.start()
      /* preventScroll because this also runs on the close that follows a link
         click, by which point the router is already moving the page and a
         focus-driven scroll would fight it. */
      toggle?.focus({ preventScroll: true })
    }
  }, [menuOpen, isDrawer])

  const isMediaActive = pathname === '/media' || pathname.startsWith('/articles')
  /* Every route the Help dropdown offers. /help was added to the menu without
     being added here, so the one page the dropdown leads with showed no current
     section at all: the trigger never took `.active`, and the travelling marker
     has nothing to measure against, so it stayed at opacity 0. */
  const isResourcesActive =
    pathname === '/help' ||
    pathname === '/faqs' ||
    pathname === '/user-guide'

  return (
    <header
      className="site-header"
      /* glass.css already keys the stronger ground off this. Written as an
         attribute rather than a class so the state is legible in devtools and
         so nothing has to keep a className list in sync to read it. */
      data-condensed={condensed ? 'true' : undefined}
      /*
       * The reason the page does not move when the bar tightens.
       *
       * This header is position:sticky, so its height is part of the document's
       * flow: shorten it and every pixel of content below shifts up by the
       * difference. That is true whether the change is animated or snapped —
       * animating it just does it sixty times a second instead of once. And it
       * is not only the reader's place on the page that moves: chrome.css pulls
       * the first section up behind the rail, and library.css, legal.css and
       * help.css all size scroll-margin and a sticky sidebar off --bar-inset +
       * --bar-h, none of which know the rail has changed size.
       *
       * So the rail's height does not change. The *pill* loses 8px of padding
       * and the rail takes exactly that 8px back as padding-bottom, which is
       * air under a floating object and is visible to nobody. The bar tightens,
       * the flow is untouched, and the five stylesheets that measured this rail
       * stay right.
       */
      style={tighten ? { paddingBottom: RAIL_GIVEBACK } : undefined}
    >
      <nav
        className="nav glass"
        aria-label="Primary"
        style={{
          paddingBlock: tighten ? PILL_PAD_TIGHT : PILL_PAD,
          /*
           * An allowlist, not a decoration.
           *
           * Two properties may transition on this pill and no others. Padding
           * must not, for the reason above. `backdrop-filter` must not, because
           * re-running a 20px blur plus a saturate over the whole backdrop on
           * every frame is the most expensive thing on this page by a wide
           * margin. Naming the two that may leaves `transition: all` — the
           * default, and one careless line away in any sheet that touches
           * `.nav` — unable to pick either of them up.
           *
           * What is left is the ground and the lift fading between states,
           * which is the part of the condense that is safe to make smooth.
           */
          transitionProperty: 'background-color, box-shadow',
          transitionDuration: '260ms',
          transitionTimingFunction: EASE_CSS,
        }}
      >
        <Link href="/" className="logo" aria-label="Platizio Global home">
          <picture>
            <source srcSet="/logo-wordmark.webp" type="image/webp" />
            {/*
              The wordmark carries the smoothness the height is not allowed to.
              It scales rather than changing its `height`, so it animates on the
              compositor and its layout box never moves — which is also why the
              pill's height is decided by its 44px buttons and not by this.

              Origin left, because the wordmark is set against the pill's left
              padding: scaling from the centre would walk it inward and read as
              the logo drifting rather than tightening.

              MotionProvider's reducedMotion="user" turns this into a straight
              cut for anyone who asked for less motion — the condensed size is
              still applied, it simply arrives without the tween.
            */}
            <motion.img
              src="/logo-wordmark.png"
              alt="Platizio Global"
              className="logo-img"
              width={451}
              height={80}
              animate={{ scale: tighten ? 0.84 : 1 }}
              transition={{ duration: 0.34, ease: EASE }}
              style={{ transformOrigin: 'left center' }}
            />
          </picture>
        </Link>

        <ul
          ref={listRef}
          id={MENU_ID}
          /* Off screen means out of the tab order. See drawerOnScreen. */
          inert={isDrawer && !drawerOnScreen}
          className={`nav-links${menuOpen ? ' is-open' : ''}${marker ? ' has-marker' : ''}${settled ? ' is-settled' : ''}`}
          onPointerLeave={() => placeMarker()}
        >
          {/* Travels between the links. aria-hidden: the current page is already
              announced by NavLink's aria-current. */}
          <span
            className="nav-marker"
            aria-hidden="true"
            style={
              marker
                ? { transform: `translateX(${marker.x}px) scaleX(${marker.w / 100})`, opacity: 1 }
                : { opacity: 0 }
            }
          />
          <li>
            <NavLink
              href="/"
              className={({ isActive }) => (isActive ? 'active' : undefined)} end
              onPointerEnter={(e) => placeMarker(e.currentTarget)}
            >
              Home
            </NavLink>
          </li>
          <li>
            <NavLink
              href="/products"
              className={({ isActive }) => (isActive ? 'active' : undefined)}
              onPointerEnter={(e) => placeMarker(e.currentTarget)}
            >
              Products
            </NavLink>
          </li>
          <li>
            <NavLink
              href="/pricing"
              className={({ isActive }) => (isActive ? 'active' : undefined)}
              onPointerEnter={(e) => placeMarker(e.currentTarget)}
            >
              Pricing
            </NavLink>
          </li>
          <li>
            <NavLink
              href="/media"
              className={() => (isMediaActive ? 'active' : undefined)}
              onPointerEnter={(e) => placeMarker(e.currentTarget)}
            >
              Media
            </NavLink>
          </li>
          <li>
            <NavLink
              href="/about"
              className={({ isActive }) => (isActive ? 'active' : undefined)}
              onPointerEnter={(e) => placeMarker(e.currentTarget)}
            >
              About Us
            </NavLink>
          </li>
          <li className={`has-dropdown${resourcesOpen ? ' products-open' : ''}`}>
            <button
              type="button"
              className={`nav-trigger${isResourcesActive ? ' active' : ''}`}
              onClick={() => setResourcesOpen((v) => !v)}
              onPointerEnter={(e) => placeMarker(e.currentTarget)}
              aria-expanded={resourcesOpen}
              aria-haspopup="true"
            >
              Help <span className="dropdown-chevron" aria-hidden="true" />
            </button>
            {/*
              In the drawer this wrapper is collapsed to zero height with
              `overflow: hidden`, which hides these three links from the eye and
              from nobody else — they stayed in the tab order, so Tab walked
              into a submenu that was not on screen. Clipped is not closed;
              inert is.

              Gated on isDrawer because on the desktop row the same panel opens
              on hover and focus-within, where it must stay reachable.
            */}
            <div className="dropdown-wrap" inert={isDrawer && !resourcesOpen}>
              <ul className="dropdown">
                <li>
                  <Link href="/help" onClick={() => { setMenuOpen(false); setResourcesOpen(false) }}>
                    <strong>Help &amp; Support</strong>
                    <span>Get an answer, or reach our team</span>
                  </Link>
                </li>
                <li>
                  <Link href="/faqs" onClick={() => { setMenuOpen(false); setResourcesOpen(false) }}>
                    <strong>FAQ</strong>
                    <span>Common questions on investing, funding &amp; taxes</span>
                  </Link>
                </li>
                <li>
                  <Link href="/user-guide" onClick={() => { setMenuOpen(false); setResourcesOpen(false) }}>
                    <strong>User Guide</strong>
                    <span>Step-by-step guide to start investing</span>
                  </Link>
                </li>
              </ul>
            </div>
          </li>

          {/* Mobile-only CTAs inside the slide-out menu */}
          <li className="nav-cta-mobile">
            <button
              className="btn-quiet"
              onClick={() => { openContact(); setMenuOpen(false) }}
            >
              Contact Us
            </button>
            <a
              className="btn-gold"
              href={TRADING_PLATFORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              Start Investing
              <Arrow />
            </a>
          </li>
        </ul>

        <div className="nav-actions">
          <button
            className="btn-quiet btn--sm"
            onClick={() => { openContact(); setMenuOpen(false) }}
          >
            Contact Us
          </button>
          <a
            className="btn-gold btn--sm"
            href={TRADING_PLATFORM_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Start Investing
            <Arrow />
          </a>
          <button
            ref={toggleRef}
            className="menu-toggle"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls={MENU_ID}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {/* The label already says "Close menu"; the glyph should agree with
                it, or the control looks like it will open a second menu. */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </nav>
    </header>
  )
}
