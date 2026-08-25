import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import '../css/styles.css'
// Order matters: the revamp layer redefines tokens declared in styles.css, so
// it must load after it. tokens -> base -> components.
import '../Platizio_Global_Revamp/styles/tokens.css'
import '../Platizio_Global_Revamp/styles/base.css'
import '../Platizio_Global_Revamp/styles/chrome.css'
import '../Platizio_Global_Revamp/styles/home-market.css'
import '../Platizio_Global_Revamp/styles/pricing.css'
import '../Platizio_Global_Revamp/styles/about.css'
// meridian.css declares every token on .meridian and nothing on :root, so it
// can load beside the others without reaching the rest of the site.
import '../Platizio_Global_Revamp/styles/meridian.css'
import '../Platizio_Global_Revamp/styles/products.css'
// Scoped to .meridian, so it moves both product surfaces into the source
// design's world and leaves the rest of the site in the light brand.
import '../Platizio_Global_Revamp/styles/meridian-dark.css'

const container = document.getElementById('root')!

const tree = (
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
)

// Prerendered pages ship server markup inside #root, so hydrate those. Under
// `npm run dev` and the `build:spa` escape hatch, #root holds only the
// <!--app-html--> placeholder comment — hydrating against that fails, so test
// for an element child rather than any node and mount from scratch instead.
if (container.firstElementChild) {
  hydrateRoot(container, tree)
} else {
  container.replaceChildren()
  createRoot(container).render(tree)
}
