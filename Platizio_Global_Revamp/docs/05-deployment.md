# Deployment — Vercel environment variables

Three serverless functions back the revamped site. **Only the ViewTrade group is
required**; the other two degrade gracefully and do not block launch.

| Function | Powers | Without its variables |
|----------|--------|-----------------------|
| `/api/quotes` | Home trending band + popular grid | Both sections silently remove themselves |
| `/api/news` | Media news rail | Rail serves its curated fallback |
| `/api/subscribe` | Media newsletter signup | Form returns 503 and says it is not live |

---

## 1. ViewTrade — required for live market data

| Variable | Purpose | Example shape |
|----------|---------|---------------|
| `VIEWTRADE_BASE_URL` | `uma` service host. Auth *and* quotes both live here, so one URL covers everything. | `https://user-auth-gateway-staging.viewtrade.in` |
| `VIEWTRADE_API_KEY` | `api_key` in the B2B login body | 19-character string |
| `VIEWTRADE_API_SECRET` | `api_secret` in the B2B login body | 15-character string |

Three, not two — the login body requires both key and secret. Read by
[`api/_lib/viewtrade.ts`](../../api/_lib/viewtrade.ts).

### Where the values come from

`Global_API/credentials/client-url-config.json` → `urls.uma.value`, `apiKey`,
`apiSecret`.

That folder is **outside the repository and must stay there.** `.gitignore`
carries defensive patterns so an accidental copy cannot be committed.

---

## 2. News — optional

| Variable | Purpose |
|----------|---------|
| `NEWSAPI_AI_KEY` | NewsAPI.ai (Event Registry) search key for the `/media` news rail |

⚠️ **This key has a finite quota: 2000 searches in total, not per month.**

`/api/news` caches for **12 hours** precisely to protect it — worst case two
upstream calls a day, roughly 730 a year, so the pool lasts years.
**Shortening that cache is the fastest way to burn the quota.** Do not change
`s-maxage=43200` without recounting the budget.

Unset, or once the quota is spent, the endpoint serves the curated list from
[`data/mediaNews.ts`](../data/mediaNews.ts) and still answers 200. The rail is
never empty.

---

## 3. Newsletter — optional

| Variable | Purpose |
|----------|---------|
| `NEWSLETTER_WEBHOOK_URL` | Any endpoint accepting a JSON `{ email }` POST |

Provider-agnostic on purpose: Buttondown, Mailchimp via Zapier, a Google Apps
Script, an internal CRM. Nothing in the code is tied to one vendor.

Unset, `/api/subscribe` returns 503 and the form tells the visitor signups are
not live yet, offering an email address instead. That is deliberate — the
alternative is accepting an address, discarding it, and telling someone they
are subscribed. **A signup form that lies is worse than one honestly not live.**

---

## ⚠️ Never prefix any of these with `VITE_`

Vite inlines any `VITE_`-prefixed variable into the **client bundle**, where it
is readable by anyone who opens devtools. A `VITE_VIEWTRADE_API_SECRET` would
publish the broker credential to every visitor.

All five are read through `process.env` inside serverless functions only.
Verified: no `VITE_`-prefixed credential exists anywhere, and the built client
JS contains none of these names.

## Setting them

Vercel Dashboard → **Project → Settings → Environment Variables**. Add each as a
**Secret / Sensitive** value, not Plain Text.

| Environment | Set? | Notes |
|-------------|------|-------|
| **Production** | Yes | Needs **production** ViewTrade credentials — see below |
| **Preview** | Yes | UAT credentials are appropriate here |
| **Development** | Optional | Only for `vercel dev`; `npm run dev` reads `.env.local` |

**Variables are read at build and at cold start, so changing one requires a
redeploy.** Editing a value in the dashboard does not affect the running
deployment until you redeploy.

## 🚩 Production ViewTrade credentials do not exist yet

Everything in `Global_API` is **UAT/staging**. There are no production
credentials, so the production deployment cannot serve live market data until
they are issued.

UAT prices are also synthetic (MU at $1001 in testing) — fine for proving the
plumbing, useless for judging whether numbers look right.

Two options until production keys arrive:

1. **Leave Production unset.** The market sections remove themselves cleanly and
   the rest of the homepage is unaffected. Nothing looks broken.
2. **Point Production at UAT.** Live-looking but wrong prices on a regulated
   broker's homepage. **Not recommended** — the delayed-price notice does not
   cover "these figures are from a test environment".

Option 1 is the safe default.

## Failure mode

This is the one that catches people, because **nothing looks wrong**.

With the ViewTrade variables missing, `/api/quotes` returns 503, `useMarketData`
flags failure, and the trending band and popular grid unmount. Home renders
hero → why → how → fees → regulations → footer and reads as a deliberate design.
No error, no empty state, nothing beyond a network 503 in devtools.

That behaviour is intentional — a market data outage must never produce a
visibly broken homepage — but it means **a misconfigured deploy looks identical
to a working one** unless you check for the sections.

The same is true of the news rail: curated items look entirely normal, so a
missing news key is invisible without checking `source` in the response.

## Verifying a deployment

```bash
curl -s https://<deployment-url>/api/quotes | head -c 400
```

- **200** with `trending` and `popular` arrays of 8 → working.
- **503** `{"error":"Market data unavailable"}` → variables missing, wrong, or
  ViewTrade unreachable. Check the function logs; the handler logs the reason
  without ever logging the credential itself.

```bash
curl -s https://<deployment-url>/api/news | head -c 200
```

- `"source":"live"` → the news key is working.
- `"source":"curated"` → key missing, quota spent, or upstream down.

In the browser: the trending band appears under the hero on Home, the popular
grid shows eight priced cards, and `/media` opens with a scrollable news rail.

## Local development

`npm run dev` serves everything in `api/` through a Vite middleware
([`vite.config.ts`](../../vite.config.ts)), which reads `.env.local` — gitignored.
Routing is generic, so a new `api/<name>.ts` works locally with no config edit.

```
VIEWTRADE_BASE_URL=<uma host>
VIEWTRADE_API_KEY=<api key>
VIEWTRADE_API_SECRET=<api secret>
NEWSAPI_AI_KEY=<news key>
NEWSLETTER_WEBHOOK_URL=<webhook, optional>
```

`npm run preview` serves the prerendered `dist/` **without** any functions, so
`/api/*` 404s there by design — a convenient way to exercise the failure paths.

## Security checklist

- [ ] Values entered as Sensitive, not Plain Text
- [ ] No `VITE_` prefix on any of the five
- [ ] `Global_API/` never copied into the repo
- [ ] `.env.local` untracked (`git check-ignore .env.local`)
- [ ] The three exposed UAT ViewTrade credentials rotated
- [ ] **The NewsAPI.ai key was pasted into a chat transcript — rotate if that transcript is shared or synced**
- [ ] Production ViewTrade credentials requested
