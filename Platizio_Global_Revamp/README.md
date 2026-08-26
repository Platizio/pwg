# Platizio Global — Home Page Revamp

Working directory for the Home/index page revamp on branch `Platizio_Global_Revamp`.

Everything for this revamp — documentation and code — lives in this folder. The
existing site under `src/` is left almost entirely alone: the only change outside
this directory is one line in `tsconfig.json` and one import swap in
`src/pages/Home.tsx`.

## Read in this order

| Doc | What it covers |
|-----|----------------|
| [`docs/01-spec.md`](docs/01-spec.md) | **What** we are building — page structure, every section, acceptance criteria |
| [`docs/02-implementation-plan.md`](docs/02-implementation-plan.md) | **How** we are building it — phased, with a verification gate per phase |
| [`docs/03-viewtrade-api.md`](docs/03-viewtrade-api.md) | ViewTrade API reference — auth flow, endpoints, what does *not* exist |
| [`docs/04-decisions.md`](docs/04-decisions.md) | Decision log — every choice made during design and why |
| [`docs/05-deployment.md`](docs/05-deployment.md) | **Vercel environment variables** — required before this branch serves live data |
| [`docs/06-pricing-spec.md`](docs/06-pricing-spec.md) | Pricing page revamp — spec for the cost calculator and gains comparator |
| [`docs/07-about-spec.md`](docs/07-about-spec.md) | About page revamp — spec for the team grid and sourced structure section |
| [`docs/08-media-spec.md`](docs/08-media-spec.md) | Media page revamp — news rail, video showcase, newsletter |
| [`docs/09-audit-report.md`](docs/09-audit-report.md) | **Multi-agent audit** — design, HNI positioning, competitors, dark theme, multi-market readiness |

## Layout

```
Platizio_Global_Revamp/
├── README.md
├── docs/                    # specs, plan, API reference, decision log
├── components/              # the four new Home sections
├── data/                    # curated ticker universe + popular list
├── hooks/                   # useMarketData
├── styles/                  # CSS for the new sections only
├── types/                   # shared Quote / QuotesResponse types
└── Home.tsx                 # the revamped page, assembled
```

The serverless function lives at the repo root in `api/`, not here — Vercel only
routes files it finds in `/api`, so that location is not optional.

## How this folder is wired in

Verified by build spike on 2026-08-17, not assumed:

1. `tsconfig.json` — `"include": ["src", "Platizio_Global_Revamp"]`
2. `src/pages/Home.tsx` — re-exports `Platizio_Global_Revamp/Home.tsx`

No Vite alias and no `vite.config.ts` change is required. Both the client build
and the SSR prerender use `root: ROOT`, so a plain relative import from `src/`
into this folder resolves in both passes. The spike confirmed the rendered
output reached `dist/index.html` (SSR) *and* `dist/assets/index-*.js` (client).

## Status

Design approved. Implementation not started — Phase 0 (the API spike) is the
next step and gates everything after it.

## Non-negotiable

`C:\Users\pc\Desktop\Global_API` holds live UAT API keys and a C2C signing key.
It must never be copied into this repo, and no key may ever appear in a source
file. The proxy reads credentials from Vercel environment variables only.
