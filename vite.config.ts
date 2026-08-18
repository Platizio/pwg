import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Serves api/quotes.ts during `npm run dev`.
 *
 * In production Vercel routes /api itself; Vite knows nothing about it, so
 * without this the homepage would have no data source locally and the market
 * sections would silently unmount — the one failure mode we'd never notice
 * because it looks deliberate.
 *
 * ssrLoadModule keeps the handler hot-reloading like the rest of the app.
 */
function devApi(mode: string): Plugin {
  return {
    name: 'platizio-dev-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      // The handler reads process.env, but Vite only exposes VITE_-prefixed
      // vars to the client. Load .env.local into the process for parity with
      // how Vercel populates the function's environment.
      const env = loadEnv(mode, process.cwd(), '')
      for (const [k, v] of Object.entries(env)) {
        if (k.startsWith('VIEWTRADE_') && !process.env[k]) process.env[k] = v
      }

      const configured =
        !!process.env.VIEWTRADE_BASE_URL &&
        !!process.env.VIEWTRADE_API_KEY &&
        !!process.env.VIEWTRADE_API_SECRET

      if (!configured) {
        server.config.logger.warn(
          '[dev-api] VIEWTRADE_* not set — serving SYNTHETIC quotes so the market ' +
            'sections are developable. These numbers are invented. Never screenshot ' +
            'them as product evidence, and never reason about the data from them.',
        )
      }

      server.middlewares.use('/api/quotes', async (req, res) => {
        // Without credentials the real handler 503s, which unmounts every
        // market section — so the terminal, the Products band and Home all
        // render only their unavailable state and cannot be worked on at all.
        // This branch exists purely so the loaded layout is reachable on a
        // machine that has no access to the credential store. It is inside a
        // plugin with `apply: 'serve'`, so it cannot reach a build.
        if (!configured) {
          const url = new URL(req.url ?? '/', 'http://localhost')
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
          const mod = await server.ssrLoadModule('/api/quotes.ts')
          // req.url is the path AFTER the mount point, so it is '/' or
          // '/?symbols=AAPL'. Forwarding it verbatim is what makes the
          // terminal's ?symbols= and ?index= modes reachable in dev; dropping
          // it silently served every request the homepage payload.
          const suffix = (req.url ?? '/').replace(/^\//, '')
          const response: Response = await mod.default(
            new Request(`http://localhost/api/quotes${suffix}`, { method: req.method ?? 'GET' }),
          )
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(await response.text())
        } catch (err) {
          // Mirror the function's own failure contract so local behaviour
          // matches production instead of throwing an HTML error page.
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Market data unavailable' }))
          server.config.logger.error(`[dev-api] ${(err as Error).message}`)
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
  define: {
    // Baked in at build time so the prerendered HTML and the hydrating client
    // agree on the copyright year. Reading `new Date()` during render would
    // mismatch across a New Year boundary and log a hydration error.
    __BUILD_YEAR__: JSON.stringify(new Date().getFullYear()),
  },
}))
