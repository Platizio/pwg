"use client"

import Link from 'next/link'
import {
  YOUTUBE_CHANNEL_URL,
  WHATSAPP_URL,
  APP_STORE_URL,
  PLAY_STORE_URL,
  TRADING_PLATFORM_URL,
} from '@/src/constants'

/* The footer, built from nothing.
 *
 * Not a revision of the one before it. That was a four-column link dump with a
 * brand block on the left — the shape almost every site uses, and the shape
 * that makes a footer read as the place links go to be forgotten.
 *
 * THREE MOVEMENTS, top to bottom:
 *
 *   1. THE PANEL. One liquid-glass sheet carrying the two things a reader who
 *      has scrolled this far might actually want to do: get the app, or find
 *      us somewhere else. It is the footer's first block and its only glass.
 *   2. THE DIRECTORY. Four tight columns of tracked-caps headings and small
 *      links, deliberately quiet — a reader down here is looking for something
 *      specific, not browsing.
 *   3. THE RECORD. A hairline, then the regulatory line, the legal links and
 *      the copyright. Small, honest, and never dressed up.
 *
 * The closing statement that used to open it is gone at Aayush's request. So
 * is the row of text labels along the bottom: the social links and the two
 * store links used to sit down there among the legal apparatus, at 13px, in
 * the least-looked-at inch of the page. They are the panel now.
 *
 * WHY THE GLASS IS A PANEL AND NOT THE WHOLE FOOTER
 * Two reasons, and they agree. glass.css prices backdrop-filter per painted
 * area and keeps it off full-bleed regions; and a blur needs something behind
 * it to blur, which the last element on a page does not have. A bounded panel
 * sitting on the footer's own gold wash and grain has both — it frosts real
 * material, and it costs a panel's worth of compositing rather than a
 * viewport's.
 *
 * WHY EVERY CLASS IS `pgf-` PREFIXED
 * Three sheets still paint `.site-footer` for a dark ground it no longer has:
 * `chrome.css` sets `background: var(--ink-900)` with white text, `styles.css`
 * inverts the wordmark to a white silhouette with `filter: brightness(0)
 * invert(1)`, and a reduced-transparency branch restores the black slab under
 * ink-coloured text. Overriding those one by one is how this footer shipped
 * invisible once already — white type on cream. So this component simply does
 * not match them. It carries its own ground and its own colours, declared once,
 * in tokens, with no inherited white left anywhere to hunt down.
 */

const DIRECTORY: Array<{ heading: string; links: Array<{ label: string; href: string; external?: boolean }> }> = [
  {
    heading: 'Platizio',
    links: [
      { label: 'About us', href: '/about' },
      { label: 'Why global investing', href: '/#why' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    heading: 'Invest',
    links: [
      { label: 'Products', href: '/products' },
      { label: 'Live terminal', href: '/terminal' },
      { label: 'Open an account', href: TRADING_PLATFORM_URL, external: true },
    ],
  },
  {
    heading: 'Learn',
    links: [
      { label: 'Articles', href: '/media#articles' },
      { label: 'Videos', href: '/media#videos' },
      { label: 'User guide', href: '/user-guide' },
    ],
  },
  {
    heading: 'Support',
    links: [
      { label: 'Help centre', href: '/help' },
      { label: 'FAQs', href: '/faqs' },
      { label: 'Grievance', href: 'mailto:grievances@platizio.com', external: true },
    ],
  },
]

/* Marks, not logos. Each is a single filled path at 24×24 so the row reads as
   one set rather than four brands pasted together, and each is `currentColor`
   so it inverts with its button on hover. The WhatsApp path is the one already
   in whatsapp-float.tsx — the same glyph twice on one page should be the same
   glyph. */
const SOCIAL: Array<{ label: string; href: string; path: string }> = [
  {
    label: 'YouTube',
    href: YOUTUBE_CHANNEL_URL,
    path: 'M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8zM9.5 15.6V8.4l6.3 3.6z',
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/platizioglobal/',
    path: 'M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c0 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2 0-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c0-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.3 2.2-.4 1.3-.1 1.7-.1 4.9-.1zm0 2.2c-3.1 0-3.5 0-4.7.1-.9 0-1.4.2-1.7.3-.4.2-.7.4-1 .7-.3.3-.5.6-.7 1-.1.3-.3.8-.3 1.7-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c0 .9.2 1.4.3 1.7.2.4.4.7.7 1 .3.3.6.5 1 .7.3.1.8.3 1.7.3 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c.9 0 1.4-.2 1.7-.3.4-.2.7-.4 1-.7.3-.3.5-.6.7-1 .1-.3.3-.8.3-1.7.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c0-.9-.2-1.4-.3-1.7-.2-.4-.4-.7-.7-1-.3-.3-.6-.5-1-.7-.3-.1-.8-.3-1.7-.3-1.2-.1-1.6-.1-4.7-.1zm0 3.7a5.9 5.9 0 1 1 0 11.8 5.9 5.9 0 0 1 0-11.8zm0 9.7a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6zm7.5-9.9a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0z',
  },
  {
    label: 'X',
    href: 'https://x.com/platizioglobal',
    path: 'M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.96 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.11z',
  },
  {
    label: 'WhatsApp',
    href: WHATSAPP_URL,
    path: 'M20.5 3.5A10.4 10.4 0 0 0 12 .5 10.5 10.5 0 0 0 2.9 16.2L1.5 22l5.9-1.5a10.5 10.5 0 0 0 4.6 1.1A10.5 10.5 0 0 0 22.5 11 10.4 10.4 0 0 0 20.5 3.5zM12 19.8a8.7 8.7 0 0 1-4.4-1.2l-.3-.2-3.5.9.9-3.4-.2-.4A8.7 8.7 0 1 1 12 19.8zm4.9-6.5c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1c-.2.3-.7.9-.8 1-.2.2-.3.2-.5.1a7.2 7.2 0 0 1-3.6-3.2c-.3-.5.3-.4.8-1.4.1-.2 0-.3 0-.5l-.9-2c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.6 1.1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.7 3.1.6.5 0 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1 0-.2-.1-.5-.2z',
  },
]

/* The two stores, in the wording the stores themselves use. The mark is drawn
   rather than served as an official badge image: a badge is a fixed-height
   raster that cannot take this footer's type, colour or hover, and at two
   different aspect ratios the pair never sits level. */
const STORES: Array<{ label: string; sub: string; href: string; path: string }> = [
  {
    sub: 'Download on the',
    label: 'App Store',
    href: APP_STORE_URL,
    path: 'M17.05 12.54c-.02-2.4 1.96-3.55 2.05-3.61-1.12-1.63-2.86-1.86-3.48-1.88-1.48-.15-2.89.87-3.64.87-.75 0-1.91-.85-3.14-.83-1.61.02-3.1.94-3.93 2.38-1.68 2.91-.43 7.21 1.2 9.57.8 1.15 1.75 2.45 3 2.4 1.2-.05 1.66-.78 3.11-.78 1.45 0 1.86.78 3.13.75 1.29-.02 2.11-1.18 2.9-2.34.91-1.34 1.29-2.63 1.31-2.7-.03-.01-2.51-.96-2.53-3.83zM14.66 5.6c.66-.8 1.1-1.91.98-3.02-.95.04-2.1.63-2.78 1.43-.61.71-1.14 1.84-1 2.93 1.06.08 2.14-.54 2.8-1.34z',
  },
  {
    sub: 'Get it on',
    label: 'Google Play',
    href: PLAY_STORE_URL,
    path: 'M3.6 1.84a1.5 1.5 0 0 0-.35.98v18.36c0 .38.13.72.35.98l.06.06L13.9 12v-.24zm10.3 10.28-3.4-3.4v-.24l3.4-3.4.08.05 4.03 2.29c1.15.65 1.15 1.72 0 2.38l-4.03 2.29zm-.08.04L3.6 22.16c.38.4 1 .45 1.71.05l12.07-6.86zm0-.24L5.31 1.8c-.71-.4-1.33-.35-1.71.05L13.9 12.12z',
  },
]

function Glyph({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  )
}

export default function Footer() {
  return (
    <footer className="pgf night" aria-label="Platizio Global">
      <div className="pgf-wash" aria-hidden="true" />
      <div className="pgf-inner">

        {/* 1 — THE PANEL, on liquid glass */}
        <section className="pgf-panel glass glass--dark" aria-labelledby="pgf-panel-heading">
          <div>
            <h2 className="pgf-panel-h" id="pgf-panel-heading">
              Platizio Global, on your phone.
            </h2>
            <p className="pgf-panel-b">
              The same account and the same live prices, on iOS and Android.
            </p>

            <ul className="pgf-stores" aria-label="Download the app">
              {STORES.map(({ label, sub, href, path }) => (
                <li key={label}>
                  <a className="pgf-store" href={href} target="_blank" rel="noopener noreferrer">
                    <Glyph path={path} />
                    <span className="pgf-store-t">
                      <small>{sub}</small>
                      <strong>{label}</strong>
                    </span>
                    <span className="pgf-sr"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="pgf-panel-r">
            <h3 className="pgf-col-h">Follow us</h3>
            <ul className="pgf-social">
              {SOCIAL.map(({ label, href, path }) => (
                <li key={label}>
                  <a
                    className="pgf-social-link"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${label} (opens in a new tab)`}
                  >
                    <Glyph path={path} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 2 — THE DIRECTORY */}
        <nav className="pgf-directory" aria-label="Footer">
          {DIRECTORY.map(({ heading, links }) => (
            <div className="pgf-col" key={heading}>
              <h3 className="pgf-col-h">{heading}</h3>
              <ul className="pgf-list">
                {links.map(({ label, href, external }) => (
                  <li key={label}>
                    {external ? (
                      <a
                        className="pgf-link"
                        href={href}
                        {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      >
                        {label}
                        {href.startsWith('http') && <span className="pgf-sr"> (opens in a new tab)</span>}
                      </a>
                    ) : (
                      <Link className="pgf-link" href={href}>{label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="pgf-col pgf-col-reach">
            <h3 className="pgf-col-h">Reach us</h3>
            <ul className="pgf-list">
              <li><a className="pgf-link" href="tel:+919289837100">+91 92898 37100</a></li>
              <li><a className="pgf-link" href="mailto:supportglobal@platizio.com">supportglobal@platizio.com</a></li>
            </ul>
            <address className="pgf-address">
              Unit No. 415, Tower&nbsp;B, KLJ Noida One,<br />
              Plot #B-8, Sector-62, Noida,<br />
              Uttar Pradesh 201309, India
            </address>
          </div>
        </nav>

        {/* 3 — THE RECORD */}
        <div className="pgf-record">
          <p className="pgf-reg">
            Investments in US stocks and ETFs carry market, currency and tax risk. Past
            performance does not indicate future results. Platizio Global does not
            guarantee returns. Read all scheme and offer documents carefully before
            investing.
          </p>

          {/* The copyright leads this row rather than closing it. Pinned right it
              sat in the bottom-right corner of the viewport, which is where the
              fixed WhatsApp button lives — the button covered it on every page,
              at the one scroll position where a reader is looking at it. */}
          <div className="pgf-record-foot">
            <p className="pgf-copy">
              &copy; {Number(process.env.NEXT_PUBLIC_BUILD_YEAR)} Platizio Global
            </p>

            <ul className="pgf-legal" aria-label="Legal">
              <li><Link className="pgf-link" href="/terms">Terms</Link></li>
              <li><Link className="pgf-link" href="/privacy">Privacy</Link></li>
              <li><Link className="pgf-link" href="/disclaimer">Risk disclosure</Link></li>
            </ul>
          </div>
        </div>

        {/* The watermark, in a band that crops it.
            It is the last thing on the page and it owns a strip of its own, so
            it cannot sit under the legal text the way it did when it was a
            free-floating layer. The strip is a third of the mark's height: the
            letters are full size and the page's bottom edge cuts them. */}
        <div className="pgf-mark" aria-hidden="true">
          <p className="pgf-wordmark">Platizio&nbsp;Global</p>
        </div>
      </div>
    </footer>
  )
}
