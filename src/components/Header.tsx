import { useState, useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { TRADING_PLATFORM_URL } from '../constants'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { openContact } = useAppContext()
  const location = useLocation()

  // Sticky shadow on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close mobile menu and dropdowns on navigation
  useEffect(() => {
    setMenuOpen(false)
    setResourcesOpen(false)
  }, [location.pathname])

  const isMediaActive = location.pathname === '/media' || location.pathname.startsWith('/articles')
  const isResourcesActive = location.pathname === '/faqs' || location.pathname === '/user-guide'

  return (
    <header className="site-header" style={{ boxShadow: scrolled ? 'var(--shadow-sm)' : 'none' }}>
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

        <ul className={`nav-links${menuOpen ? ' is-open' : ''}`}>
          <li>
            <NavLink to="/" className={({ isActive }) => (isActive ? 'active' : undefined)} end>
              Home
            </NavLink>
          </li>
          <li>
            <NavLink to="/products" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              Products
            </NavLink>
          </li>
          <li>
            <NavLink to="/pricing" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              Pricing
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/media"
              className={() => (isMediaActive ? 'active' : undefined)}
            >
              Media
            </NavLink>
          </li>
          <li>
            <NavLink to="/about" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              About Us
            </NavLink>
          </li>
          <li className={`has-dropdown${resourcesOpen ? ' products-open' : ''}`}>
            <button
              type="button"
              className={`nav-trigger${isResourcesActive ? ' active' : ''}`}
              onClick={() => setResourcesOpen((v) => !v)}
              aria-expanded={resourcesOpen}
              aria-haspopup="true"
            >
              Help <span className="dropdown-chevron" aria-hidden="true" />
            </button>
            <ul className="dropdown">
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
