import { Routes, Route, useLocation, Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { AppProvider } from './context/AppContext'
import { startSmoothScroll, getLenis, scrollToTarget } from './lib/smoothScroll'
import Header from './components/Header'
import Footer from './components/Footer'
import ContactModal from './components/ContactModal'
import WhatsAppFloat from './components/WhatsAppFloat'
import Home from './pages/Home'
import Products from './pages/Products'
import Terminal from './pages/Terminal'
import Pricing from './pages/Pricing'
import Media from './pages/Media'
import About from './pages/About'
import FAQs from './pages/FAQs'
import UserGuide from './pages/UserGuide'
import Articles from './pages/Articles'
import TopicHub from './pages/TopicHub'
import ArticlePage from './components/ArticlePage'
import TermsAndConditions from './pages/TermsAndConditions'
import PrivacyPolicy from './pages/PrivacyPolicy'
import Disclaimer from './pages/Disclaimer'
import NotFound from './pages/NotFound'

// Handles scroll-to-top / hash-scroll on route changes,
// and re-wires the IntersectionObserver reveal animation
// after each navigation (same logic as the original main.js).
/* The floating bar overlays the page, so an anchored section has to stop below
   it rather than under it. */
const HEADER_OFFSET = 96

function ScrollHandler() {
  const location = useLocation()

  useEffect(() => {
    if (location.hash) {
      const t = setTimeout(() => {
        /* Through Lenis when it is running: scrollIntoView moves the native
           scroll position out from under the smoothing, which then animates
           back and fights it. */
        const el = document.querySelector<HTMLElement>(location.hash)
        if (el) scrollToTarget(el, -HEADER_OFFSET)
      }, 120)
      return () => clearTimeout(t)
    }
    /* A route change is a new page, not a journey across the old one: this
       jumps rather than eases, which is why it does not go through Lenis. */
    getLenis()?.scrollTo(0, { immediate: true })
    window.scrollTo({ top: 0 })
  }, [location.pathname, location.hash])

  useEffect(() => {
    const timer = setTimeout(() => {
      const els = document.querySelectorAll<HTMLElement>('.reveal:not(.in-view)')
      if (!('IntersectionObserver' in window)) {
        els.forEach((el) => el.classList.add('in-view'))
        return
      }
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('in-view')
              io.unobserve(entry.target)
            }
          })
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
      )
      els.forEach((el) => io.observe(el))
      return () => io.disconnect()
    }, 60)
    return () => clearTimeout(timer)
  }, [location.pathname])

  return null
}

function Layout() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main-content">
        <Outlet />
      </main>
      <Footer />
      <ContactModal />
      <WhatsAppFloat />
    </>
  )
}

function SmoothScroll() {
  useEffect(() => startSmoothScroll(), [])

  /*
   * In-page anchors, once. Lenis leaves the browser's own jump in place, so a
   * `#section` link would teleport while everything else eases. Delegated from
   * the document rather than wired per link, so any anchor added later is
   * covered without being remembered.
   */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#"]')
      if (!(a instanceof HTMLAnchorElement)) return
      const hash = a.getAttribute('href')
      if (!hash || hash === '#') return
      const el = document.querySelector<HTMLElement>(hash)
      if (!el) return
      e.preventDefault()
      scrollToTarget(el, -HEADER_OFFSET)
      /* The hash still belongs in the URL: it is the address of the section,
         and back should return to where the reader was. */
      history.pushState(null, '', hash)
      /* Keyboard focus has to follow the eye, or a skip link scrolls the page
         and leaves the caret at the top of the document. */
      el.setAttribute('tabindex', '-1')
      el.focus({ preventScroll: true })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return null
}

export default function App() {
  return (
    <AppProvider>
      <SmoothScroll />
      <ScrollHandler />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          {/* One instrument per page. Only symbols in TERMINAL_UNIVERSE
              resolve; anything else falls through to <NotFound/>. */}
          <Route path="/terminal/:symbol" element={<Terminal />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/media" element={<Media />} />
          <Route path="/about" element={<About />} />
          <Route path="/faqs" element={<FAQs />} />
          <Route path="/user-guide" element={<UserGuide />} />
          <Route path="/articles" element={<Articles />} />
          {/* Three segments, so this never collides with /articles/:slug */}
          <Route path="/articles/topic/:topic" element={<TopicHub />} />
          <Route path="/articles/:slug" element={<ArticlePage />} />
          <Route path="/terms" element={<TermsAndConditions />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/disclaimer" element={<Disclaimer />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AppProvider>
  )
}
