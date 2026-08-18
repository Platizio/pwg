import React from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async'
import App from './App'

// Re-exported so the build scripts read the route list through the compiled
// bundle rather than needing a TypeScript parser of their own.
export { ROUTES, STATIC_ROUTES, TERMINAL_ROUTES, TOPIC_ROUTES, ARTICLE_ROUTES } from './routes'
export type { RouteEntry } from './routes'

// Exposed for scripts/generate-article-images.mjs, which needs title/category/
// logo per article and would otherwise have to parse TypeScript.
export { ARTICLES as ARTICLES_FOR_TOOLING } from './articles/registry'

// Already false under Node (react-helmet-async derives it from `typeof window`).
// Set explicitly so it cannot flip if this ever runs under jsdom.
HelmetProvider.canUseDOM = false

export interface RenderResult {
  html: string
  head: string
}

export function render(url: string): RenderResult {
  const helmetContext: { helmet?: HelmetServerState } = {}

  const html = renderToString(
    <React.StrictMode>
      <HelmetProvider context={helmetContext}>
        <StaticRouter location={url}>
          <App />
        </StaticRouter>
      </HelmetProvider>
    </React.StrictMode>
  )

  // Helmet collects state during render (not in an effect), which is exactly
  // why renderToString captures it. Each call gets a fresh HelmetData, so no
  // state leaks between routes.
  const h = helmetContext.helmet
  const head = h
    ? [
        h.title.toString(),
        h.meta.toString(),
        h.link.toString(),
        h.script.toString(), // JSON-LD blocks
        h.style.toString(),
        h.noscript.toString(),
      ]
        .filter(Boolean)
        .join('\n    ')
    : ''

  return { html, head }
}
