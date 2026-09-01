"use client"

import Link from 'next/link'
import { useAppContext } from '../context/AppContext'
import { YOUTUBE_CHANNEL_URL, WHATSAPP_URL, APP_STORE_URL, PLAY_STORE_URL } from '../constants'

export default function Footer() {
  const { openContact } = useAppContext()

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="logo">
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
            </div>
            <p>
              Platizio Global makes international investing simple — explore US Stocks and ETFs
              with education and support built in.
            </p>
            <div className="social" aria-label="Social media">
              <a href={YOUTUBE_CHANNEL_URL} aria-label="YouTube" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23 12s0-3.6-.5-5.3a2.8 2.8 0 0 0-2-2C18.8 4.2 12 4.2 12 4.2s-6.8 0-8.5.5a2.8 2.8 0 0 0-2 2C1 8.4 1 12 1 12s0 3.6.5 5.3a2.8 2.8 0 0 0 2 2c1.7.5 8.5.5 8.5.5s6.8 0 8.5-.5a2.8 2.8 0 0 0 2-2C23 15.6 23 12 23 12zM9.7 15.3V8.7l5.7 3.3-5.7 3.3z" />
                </svg>
              </a>
              <a href="https://www.instagram.com/platizioglobal/" aria-label="Instagram" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
                </svg>
              </a>
              <a href="https://x.com/platizioglobal" aria-label="X" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.9 3H22l-7.4 8.4L23 21h-6.8l-5.3-6.9L4.7 21H1.6l7.9-9L1 3h6.9l4.8 6.4L18.9 3zm-1.2 16.2h1.7L6.4 4.7H4.6l13.1 14.5z" />
                </svg>
              </a>
              <a href={WHATSAPP_URL} aria-label="WhatsApp" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.5 3.5A10.4 10.4 0 0 0 12 .5 10.5 10.5 0 0 0 2.9 16.2L1.5 22l5.9-1.5a10.5 10.5 0 0 0 4.6 1.1A10.5 10.5 0 0 0 22.5 11 10.4 10.4 0 0 0 20.5 3.5zM12 19.8a8.7 8.7 0 0 1-4.4-1.2l-.3-.2-3.5.9.9-3.4-.2-.4A8.7 8.7 0 1 1 12 19.8zm4.9-6.5c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1c-.2.3-.7.9-.8 1-.2.2-.3.2-.5.1a7.2 7.2 0 0 1-3.6-3.2c-.3-.5.3-.4.8-1.4.1-.2 0-.3 0-.5l-.9-2c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.6 1.1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.7 3.1.6.5 0 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1 0-.2-.1-.5-.2z" />
                </svg>
              </a>
            </div>

            <div className="footer-app">
              <h3>Download Our App</h3>
              <div className="footer-app-badges">
                <a
                  className="badge-ios"
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Download Platizio Global on the App Store"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a store badge is a local SVG, and next/image cannot optimise a vector source. */}
                  <img
                    src="/badge-app-store.svg"
                    alt="Download Platizio Global on the App Store"
                    width={120}
                    height={40}
                    loading="lazy"
                  />
                </a>
                <a
                  className="badge-android"
                  href={PLAY_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Get Platizio Global on Google Play"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a store badge is a local SVG, and next/image cannot optimise a vector source. */}
                  <img
                    src="/badge-google-play.svg"
                    alt="Get Platizio Global on Google Play"
                    width={135}
                    height={40}
                    loading="lazy"
                  />
                </a>
              </div>
            </div>
          </div>

          <div className="footer-col">
            <h3>Platizio Global</h3>
            <ul>
              <li><Link href="/about">About Us</Link></li>
              <li><Link href="/#why">Why Global Investing</Link></li>
              <li><a href="#" onClick={(e) => { e.preventDefault(); openContact() }}>Contact Us</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h3>Products</h3>
            <ul>
              <li><Link href="/products">US Stocks &amp; ETFs</Link></li>
              <li><Link href="/terminal/aapl">Live terminal</Link></li>
              <li><Link href="/pricing">Pricing &amp; Charges</Link></li>
            </ul>
          </div>
          <div className="footer-col">
            <h3>Learn</h3>
            <ul>
              <li><Link href="/media#articles">Articles</Link></li>
              <li><Link href="/media#videos">Videos</Link></li>
              <li><Link href="/faqs">FAQs</Link></li>
            </ul>
          </div>
          <div className="footer-col">
            <h3>Support</h3>
            <ul>
              <li><a href="#" onClick={(e) => { e.preventDefault(); openContact() }}>Contact Us</a></li>
              <li><Link href="/faqs">Help</Link></li>
              <li><a href="mailto:grievances@platizio.com">Grievance</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h3>Contact Us On</h3>
            <ul className="footer-contact-list">
              <li>
                <span className="footer-contact-label">Call / WhatsApp</span>
                <a href="tel:+919289837100">+91 92898 37100</a>
              </li>
              <li>
                <span className="footer-contact-label">Email</span>
                <a href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a>
              </li>
              <li>
                <span className="footer-contact-label">Address</span>
                <address>
                  Noida (Delhi NCR)<br />
                  Unit No. 415, Tower-B,<br />
                  KLJ Noida One,<br />
                  Plot #B-8, Sector-62, Noida<br />
                  UP 201309, India
                </address>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="disclaimer">
            <strong style={{ color: 'rgba(255,255,255,0.85)' }}>Disclaimer:</strong>{' '}
            Investments in US Stocks and ETFs are subject to market risk, currency risk, and
            tax implications. Past performance is not indicative of future results. Platizio
            Global does not guarantee returns. Please read all relevant documents and consult
            a qualified financial or tax advisor before investing.
          </p>
          <div>
            <p className="copyright">&copy; {Number(process.env.NEXT_PUBLIC_BUILD_YEAR)} Platizio Global. All rights reserved.</p>
            <p className="copyright" style={{ marginTop: '0.5rem' }}>
              <Link href="/terms" className="footer-legal-link">Terms &amp; Conditions</Link>
              <Link href="/privacy" className="footer-legal-link">Privacy Policy</Link>
              <Link href="/disclaimer" className="footer-legal-link">Risk Disclosure &amp; Disclaimer</Link>
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
