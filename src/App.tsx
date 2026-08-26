import { Routes, Route, useLocation, Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { AppProvider } from './context/AppContext'
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
function ScrollHandler() {
  const location = useLocation()

  useEffect(() => {
    if (location.hash) {
      setTimeout(() => {
        const el = document.querySelector(location.hash)
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }, 120)
    } else {
      window.scrollTo({ top: 0 })
    }
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

export default function App() {
  return (
    <AppProvider>
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
