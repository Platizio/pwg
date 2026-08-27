import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { TRADING_PLATFORM_URL } from '../constants'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const { openContact } = useAppContext()
  const location = useLocation()

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
  const listRef = useRef<HTMLUListElement>(null)
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

  useEffect(() => {
    placeMarker()
    const onResize = () => placeMarker()
    window.addEventListener('resize', onResize)
    /* Web fonts land after first paint and change every label's width. */
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    fonts?.ready.then(() => placeMarker())
    return () => window.removeEventListener('resize', onResize)
  }, [location.pathname, placeMarker])

  // Close mobile menu and dropdowns on navigation
  useEffect(() => {
    setMenuOpen(false)
    setResourcesOpen(false)
  }, [location.pathname])

  const isMediaActive = location.pathname === '/media' || location.pathname.startsWith('/articles')
  /* Every route the Help dropdown offers. /help was added to the menu without
     being added here, so the one page the dropdown leads with showed no current
     section at all: the trigger never took `.active`, and the travelling marker
     has nothing to measure against, so it stayed at opacity 0. */
  const isResourcesActive =
    location.pathname === '/help' ||
    location.pathname === '/faqs' ||
    location.pathname === '/user-guide'

  return (
    <header className="site-header">
      <nav className="nav" aria-label="Primary">
        <Link to="/" className="logo" aria-label="Platizio Global home">
          <picture>
            <source srcSet="/logo-wordmark.webp" type="image/webp" />
            <img
              src="/logo-wordmark.png"
              alt="Platizio Global"
              className="logo-img"
              width={451}
              height={80}
            />
          </picture>
        </Link>

        <ul
          ref={listRef}
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
              to="/"
              className={({ isActive }) => (isActive ? 'active' : undefined)} end
              onPointerEnter={(e) => placeMarker(e.currentTarget)}
            >
              Home
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/products"
              className={({ isActive }) => (isActive ? 'active' : undefined)}
              onPointerEnter={(e) => placeMarker(e.currentTarget)}
            >
              Products
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/pricing"
              className={({ isActive }) => (isActive ? 'active' : undefined)}
              onPointerEnter={(e) => placeMarker(e.currentTarget)}
            >
              Pricing
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/media"
              className={() => (isMediaActive ? 'active' : undefined)}
              onPointerEnter={(e) => placeMarker(e.currentTarget)}
            >
              Media
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/about"
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
            <div className="dropdown-wrap">
              <ul className="dropdown">
                <li>
                  <Link to="/help" onClick={() => { setMenuOpen(false); setResourcesOpen(false) }}>
                    <strong>Help &amp; Support</strong>
                    <span>Get an answer, or reach our team</span>
                  </Link>
                </li>
                <li>
                  <Link to="/faqs" onClick={() => { setMenuOpen(false); setResourcesOpen(false) }}>
                    <strong>FAQ</strong>
                    <span>Common questions on investing, funding &amp; taxes</span>
                  </Link>
                </li>
                <li>
                  <Link to="/user-guide" onClick={() => { setMenuOpen(false); setResourcesOpen(false) }}>
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
              className="btn btn-quiet"
              onClick={() => { openContact(); setMenuOpen(false) }}
            >
              Contact Us
            </button>
            <a
              className="btn btn-gold"
              href={TRADING_PLATFORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              Start Investing
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
          </li>
        </ul>

        <div className="nav-actions">
          <button
            className="btn btn-quiet"
            onClick={() => { openContact(); setMenuOpen(false) }}
          >
            Contact Us
          </button>
          <a
            className="btn btn-gold"
            href={TRADING_PLATFORM_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Start Investing
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
          <button
            className="menu-toggle"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
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
