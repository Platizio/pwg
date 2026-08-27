import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

/** Collects a request body, so POST endpoints behave in dev as on Vercel. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
  })
}

/**
 * Serves the api/ folder during `npm run dev`.
 *
 * In production Vercel routes /api itself; Vite knows nothing about it, so
 * without this the local site has no data source — the market sections
 * silently unmount and newsletter signup fails, which looks deliberate and is
 * therefore easy to miss.
 *
 * Routing is generic: /api/<name> resolves to api/<name>.ts if that file
 * exists. A new endpoint works locally the moment it is written, with no edit
 * here — the previous version hardcoded /api/quotes and silently 404ed
 * everything else.
 *
 * ssrLoadModule keeps handlers hot-reloading like the rest of the app.
 */
function devApi(mode: string): Plugin {
  return {
    name: 'platizio-dev-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      // Handlers read process.env, but Vite only exposes VITE_-prefixed vars to
      // the client. Load .env.local into the process for parity with how Vercel
      // populates a function's environment.
      const env = loadEnv(mode, process.cwd(), '')
      for (const [key, value] of Object.entries(env)) {
        const isServerVar = key.startsWith('VIEWTRADE_') || key.startsWith('NEWSLETTER_')
        if (isServerVar && !process.env[key]) process.env[key] = value
      }

      // Quotes are the one endpoint with a local fallback: without ViewTrade
      // credentials the real handler 503s, which unmounts every market section,
      // so the terminal, the Products band and Home render only their
      // unavailable state and cannot be worked on at all. Every other handler
      // is served as written.
      const quotesConfigured =
        !!process.env.VIEWTRADE_BASE_URL &&
        !!process.env.VIEWTRADE_API_KEY &&
        !!process.env.VIEWTRADE_API_SECRET

      if (!quotesConfigured) {
        server.config.logger.warn(
          '[dev-api] VIEWTRADE_* not set — serving SYNTHETIC quotes so the market ' +
            'sections are developable. These numbers are invented. Never screenshot ' +
            'them as product evidence, and never reason about the data from them.',
        )
      }

      server.middlewares.use('/api', async (req, res, next) => {
        // req.url is relative to the mount point, so "/quotes?symbols=AAPL"
        // here. Split the two apart: the name selects the handler, the query
        // is forwarded verbatim — dropping it silently served every request
        // the homepage payload, which made ?symbols= and ?index= unreachable.
        const raw = req.url ?? ''
        const [pathname, ...rest] = raw.split('?')
        const query = rest.length ? `?${rest.join('?')}` : ''
        const name = pathname.replace(/^\/+/, '').replace(/\/+$/, '')

        // Anchored allowlist: no dots, no slashes, so the name cannot escape
        // the api/ directory.
        if (!/^[a-z0-9-]+$/.test(name)) return next()

        const file = path.join(process.cwd(), 'api', `${name}.ts`)
        if (!fs.existsSync(file)) return next()

        // This branch exists purely so the loaded layout is reachable on a
        // machine that has no access to the credential store. It is inside a
        // plugin with `apply: 'serve'`, so it cannot reach a build.
        if (name === 'quotes' && !quotesConfigured) {
          const url = new URL(raw || '/', 'http://localhost')
          const mod = await server.ssrLoadModule(
            '/Platizio_Global_Revamp/data/marketUniverse.ts',
          )
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('X-Platizio-Synthetic', '1')
          res.end(JSON.stringify(synthesise(url, mod)))
          return
        }

        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`)
          const method = req.method ?? 'GET'
          const hasBody = method !== 'GET' && method !== 'HEAD'

          const response: Response = await mod.default(
            new Request(`http://localhost/api/${name}${query}`, {
              method,
              headers: { 'Content-Type': String(req.headers['content-type'] ?? 'application/json') },
              body: hasBody ? await readBody(req) : undefined,
            }),
          )

          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(await response.text())
        } catch (err) {
          // Mirror the handlers' own failure contract, so local behaviour
          // matches production rather than returning an HTML error page.
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Handler failed' }))
          server.config.logger.error(`[dev-api] ${name}: ${(err as Error).message}`)
        }
      })
    },
  }
}


/**
 * Deterministic fake quotes for local development ONLY.
 *
 * Seeded from the symbol so a reload does not reshuffle the page, and shaped
 * exactly like buildPayload's output so nothing downstream can tell the
 * difference structurally — which is the point: the layout, the skeleton
 * swap, the ranking and the distribution plot all get exercised.
 *
 * Every figure here is invented. The response carries X-Platizio-Synthetic so
 * it is greppable, and the dev server warns once at startup.
 */
function synthesise(url: URL, universe: Record<string, any>) {
  const { ALL_SYMBOLS, POPULAR_8, DISPLAY_NAMES, NASDAQ_100_SET, TRENDING_COUNT } = universe

  const seeded = (symbol: string) => {
    let h = 2166136261
    for (let i = 0; i < symbol.length; i++) h = Math.imul(h ^ symbol.charCodeAt(i), 16777619)
    return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507)) >>> 0) / 4294967296
  }

  const quote = (symbol: string) => {
    const rnd = seeded(symbol)
    const price = Math.round((20 + rnd() * 480) * 100) / 100
    const changePercent = Math.round((rnd() * 8 - 4) * 100) / 100
    return {
      symbol,
      name: DISPLAY_NAMES.get(symbol) ?? symbol,
      price,
      change: Math.round(price * (changePercent / 100) * 100) / 100,
      changePercent,
      currency: 'USD',
    }
  }

  const asOf = new Date('2026-08-18T09:12:00Z').toISOString()
  const all = (ALL_SYMBOLS as string[]).map(quote)
  const bySymbol = new Map(all.map((q) => [q.symbol, q]))

  const requested = (url.searchParams.get('symbols') ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)

  if (requested.length) {
    const body: Record<string, unknown> = {
      quotes: requested.map((s) => bySymbol.get(s)).filter(Boolean),
      asOf,
      delayed: true,
    }
    if (url.searchParams.get('index') === '1') {
      const constituents = all.filter((q) => NASDAQ_100_SET.has(q.symbol))
      body.indexMoves = constituents.map((q) => q.changePercent).sort((a, b) => a - b)
      body.indexLeaders = [...constituents]
        .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        .slice(0, TRENDING_COUNT)
      body.indexQuotes = constituents
    }
    return body
  }

  return {
    trending: all
      .filter((q) => NASDAQ_100_SET.has(q.symbol))
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, TRENDING_COUNT),
    popular: (POPULAR_8 as { symbol: string }[]).map((p) => bySymbol.get(p.symbol)).filter(Boolean),
    asOf,
    delayed: true,
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi(mode)],
  publicDir: 'public',
  server: {
    proxy: {
      /*
       * The market terminal (screener/) runs its own Next dev server on 3000.
       * Proxying it here puts both apps on one origin, so a link from the site
       * into the terminal is a same-origin path rather than a jump to another
       * port.
       *
       * Next is configured with basePath "/screener" in development, so it
       * already emits its routes, /_next assets and HMR endpoint under this
       * prefix — no path rewriting is needed, and nothing at the site's own
       * root is shadowed.
       *
       * ws: true forwards the upgrade request, without which the terminal's
       * fast refresh socket fails and it stops hot-reloading.
       */
      '/screener': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
    watch: {
      /**
       * screener/ is a separate Next.js app that happens to live inside this
       * repo root. Vite ignores only .git, node_modules, test-results and its
       * own cacheDir by default (see resolveChokidarOptions) — so without this
       * it also watches screener/.next, which Turbopack rewrites continuously
       * while the screener's dev server runs: 4k+ files under .next/dev and
       * 10k+ under .next/cache.
       *
       * That produced a change-event storm which invalidated the module graph
       * and pushed repeated full-reloads to the browser. Running both dev
       * servers at once then exhausted RAM on a 16GB machine, because each
       * forced reload re-created the page's WebGL globe and its animation
       * loops faster than they were torn down.
       *
       * Nothing here imports from screener/ — the two apps are linked only by
       * URL (src/constants.ts, screenerInstrument) — so ignoring it wholesale
       * costs nothing.
       */
      ignored: [
        '**/screener/**',
        '**/.ssr/**',
        '**/.claude-flow/**',
        '**/.playwright-mcp/**',
        '**/supabase/.temp/**',
      ],
    },
  },
  define: {
    // Baked in at build time so the prerendered HTML and the hydrating client
    // agree on the copyright year. Reading `new Date()` during render would
    // mismatch across a New Year boundary and log a hydration error.
    __BUILD_YEAR__: JSON.stringify(new Date().getFullYear()),
  },
}))
