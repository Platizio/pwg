# Spec — Media Page Revamp

**Branch:** `Platizio_Global_Revamp`
**Date:** 2026-08-17
**Status:** Implemented and verified

Layout agreed from an interactive wireframe before any code was written; the
50/50 video split was set there.

## Page structure

| # | Section | Notes |
|---|---------|-------|
| 1 | News marquee | Live US-market headlines, auto-scrolling, full-bleed, directly under the header |
| 2 | Video | Feature left, three-item list right, **Watch more** under the list. **50/50** |
| 3 | Blog + Articles | Blog coming-soon left; five articles + View all right |
| 4 | Newsletter | Email capture |
| 5 | Footer | Existing |

**No page hero.** One was added during the first build and removed on review as
not useful — it restated the page title above content that already explains
itself. The original layout never had one. Consequences handled: the video
section heading became the page `<h1>`, and the news rail label was demoted from
`<h2>` to a `<p>` with `aria-label` on the section, because as a heading it sat
above the `<h1>` and inverted the outline.

---

## News rail

### Source

NewsAPI.ai (Event Registry). **Finite quota: 2000 searches in total, not per
month.** ViewTrade has no news endpoint — all 14 catalogue files were searched.

`/api/news` caches **12 hours** (`s-maxage=43200`), so the worst case is two
upstream calls a day and the pool lasts years. **Shortening that cache is the
fastest way to burn the quota.**

### Query, and why it looks like this

Two spikes were spent tuning it, because each test costs a search:

**Spike 1** used broad keywords and `sourceLocationUri: United_States`. That
filters by where the *publisher* is, not what the story is about, so it returned
"FTSE 100 Live: UK blue-chips" and a retirement survey from The Good Men
Project. It also returned obvious duplicates.

**Spike 2** added `keywordLoc: 'title'`, `dataType: ['news']` and
`isDuplicateFilter`. Precision improved sharply and the payload fell from
40.9 KB to 3.2 KB once `body` was dropped.

**Verification of the built endpoint** exposed the last problem: Sensex and
Nifty stories were still arriving, because the API tokenises multi-word keywords
and `"US markets"` was matching a bare *markets*. Fixed by removing the loose
terms and adding `keywordSearchMode: 'phrase'`.

Final keyword set — unambiguous US proper nouns only:

```
S&P 500 · Nasdaq · Dow Jones · Wall Street · Federal Reserve · NYSE
```

### Server-side filtering

The query alone is not enough. `/api/news` over-fetches 30 and filters to 8:

| Filter | Why |
|--------|-----|
| `isDuplicate` + normalised-title dedupe | Syndicated copies escape the API's own flag |
| `OTHER_MARKET` regex | Sensex, Nifty, FTSE, Nikkei, Hang Seng, DAX and friends — not US news however they matched |
| `LOW_VALUE_TITLE` regex | Wire roundups ("Dow Jones Top Company Headlines at 1 AM ET") and earnings-call filler |
| `SOURCE_CAP = 2` | One spike returned three consecutive Morningstar roundups; without a cap one publisher takes 3 of 8 slots |
| `cleanSource()` | Some feeds set `source.title` to a bare URL, rendering "https://www.outloo" as the card label |

### Fallback

On any failure — upstream error, timeout, quota exhausted, key missing — the
endpoint returns **200 with the curated list** from
[`data/mediaNews.ts`](../data/mediaNews.ts). The rail is never empty and never
shows an error.

⚠️ Curated entries must be **real, checkable items with real dates and working
links**. The seeds are Platizio's own published explainers for exactly that
reason. On a regulated intermediary's site, an invented market headline with a
plausible source is not a placeholder — it is a false statement of fact.

### Presentation

An editorial marquee, not a card rail: headlines set large in the display face,
scrolling continuously right to left, source in small caps beneath. Full-bleed,
so it reads as a band rather than a boxed widget, with the `Markets` label
pinned left on the band ground and the headlines passing behind it.

**Seamless loop.** The list renders twice and the keyframe travels -50%, so one
pass lands exactly on the duplicate. Inter-item spacing is `padding-right` on
each item, **never a flex `gap`** — gap puts N-1 gaps between N items, so a -50%
loop lands half a gap short and jumps once per cycle. Measured seam error: 0px.

**The duplicate pass is `aria-hidden` with `tabIndex -1`.** Without that a screen
reader reads every headline twice and the tab order carries sixteen stops for
eight stories. Verified: 6 tabbable headlines for 6 stories.

**Pauses on hover and on keyboard focus** — a reader has to be able to stop it,
and a link must not slide away from someone tabbing to it.

### Rendering

The curated list is the **initial render on both server and client**, so the
markup is identical and there is no skeleton and nothing to mismatch. Live items
swap in after the effect resolves. Headlines are clamped to two lines, so the
rail's height is the same either way — **measured 153px before and after the
swap**.

---

## Video

Chosen editorially in [`data/mediaVideos.ts`](../data/mediaVideos.ts), not by
date — the newest upload is often a 30-second short, and a first-time visitor
should meet the introduction to Platizio Global instead.

| Slot | Video |
|------|-------|
| Feature | Introducing Platizio Global — Your Gateway to International Investing |
| List 1 | Why Indian Investors Need Global Investing |
| List 2 | Global ETFs: Markets, Sectors and Themes in One Investment |
| List 3 | How Tax Works in Global Investing |

A configured id missing from `src/videos.ts` is skipped and the slot refilled
from the newest remaining videos, so a deleted upload thins the list rather than
blanking the section.

Cards **link out to YouTube rather than embedding an iframe.** An embed loads
Google's player and its cookies for every visitor on page load, whether or not
they press play. A linked thumbnail avoids that and keeps the page light.

### Thumbnail source matters

**Do not use `hqdefault.jpg`.** It is 480x360 — 4:3 with black letterbox bars
top and bottom for a 16:9 video. The first build hid those bars by scaling the
image 1.34x, but `scale()` grows from the centre, so it cropped the sides too
and cut the first and last word off every title card ("INVEST BEYOND BORDERS"
rendered as "IVEST EYOND ORDERS").

| Source | Size | Aspect |
|--------|------|--------|
| `hqdefault` | 480x360 | 4:3, letterboxed — **avoid** |
| `mqdefault` | 320x180 | 16:9, always available |
| `maxresdefault` | 1280x720 | 16:9, not guaranteed |

Feature uses `maxresdefault` with a one-shot `onError` fallback to `mqdefault`;
the side list uses `mqdefault`, which is ample for a 132px-wide thumbnail. No
scaling anywhere. Verified: 0% cropping on all four images, source and
container both exactly 1.7778.

---

## Blog + Articles

**Blog** ships empty with a coming-soon state that points at the articles beside
it. An empty state should say what is coming and offer somewhere to go, not
shrug.

**Articles** shows five: `featured: true` first, then newest to fill. Only three
articles carry the flag, so featured-only would render short — and this keeps
the flag meaningful as editorial promotion rather than a chore to maintain at
exactly five.

---

## Newsletter

Posts to `/api/subscribe`, which forwards to whatever
`NEWSLETTER_WEBHOOK_URL` is set — Buttondown, Mailchimp via Zapier, an internal
CRM. Nothing is tied to a vendor.

**No provider is configured, so the endpoint returns 503 and the form says so,
offering an email address instead.** It deliberately does not show a success
message it cannot honour: a form that says "Subscribed!" while storing nothing
sends the visitor away believing they will hear from you.

Email validation is deliberately permissive. Strict regexes reject valid
addresses — plus-addressing, new TLDs, unicode domains. This catches typos; the
provider does real validation and a confirmation email is what actually proves
an address works.

---

## Verification

| Check | Result |
|-------|--------|
| Build, 49 pages prerender | **PASS** |
| No hydration warning on `/media` | **PASS** — console clean |
| Section order | **PASS** — rail → video → panels → newsletter |
| Video split at desktop | **PASS** — 564/564, exactly 50/50 |
| Watch more sits below the list | **PASS** |
| Feature and side columns balance | **PASS** — 485px each |
| News rail scrollable | **PASS** |
| Marquee seam | **PASS** — 0px error, 64s loop |
| Duplicate pass hidden from a11y tree | **PASS** — 6 tab stops for 6 stories |
| Pauses on keyboard focus | **PASS** |
| Full-bleed band | **PASS** |
| Live items open in a new tab safely | **PASS** — `target=_blank` + `rel=noopener` |
| Fallback when key absent | **PASS** — 200, curated, internal links |
| `/api/subscribe` with no provider | **PASS** — 503, never claims success |
| Endpoint checks | **23/23 pass** |
| Contrast | **22 pairs, all pass** after one fix |
| No horizontal scroll at 375 / 768 / 1280 | **PASS** |

### One bug found in verification

`.article-idx` used `--gray-400` at **2.71:1**. That is the same token misused
for the currency code on Home. `--gray-400` is fine for borders and icons and
never for text — decorative numbering is still visible text. Now `--gray-500`.

## Non-goals

- No YouTube Data API; titles and dates come from `src/videos.ts`
- No embedded player
- No blog CMS — the panel is a placeholder
- No news images; the rail is text, which keeps it fast and avoids hotlinking
  publisher assets
