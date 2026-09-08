/**
 * Heading extraction for the article table of contents.
 *
 * Article bodies are trusted, author-controlled HTML strings held in the
 * registry — there is no document to query, and the contents rail has to be in
 * the first painted frame rather than assembled from the DOM after it. So this
 * is a pure function over the string: `extractHeadings(bodyHtml)` in, an
 * ordered list out, no globals, no DOM, no I/O. It runs on the server during
 * the prerender, and its output ships as part of the HTML.
 *
 * Four properties of the real corpus shaped it:
 *
 *  - Four of the thirty bodies are a single line of ten thousand characters,
 *    so nothing here may backtrack. The attribute pattern is an alternation of
 *    three pieces that cannot start at the same character, which is what keeps
 *    it linear; the heading's own text is bounded by a plain index search
 *    rather than a lazy quantifier.
 *  - Headings carry entities (`S&amp;P 500` is in the registry today).
 *    Slugging the raw string gives `s-amp-p-500`.
 *  - The same words head sections in more than one article, and occasionally
 *    twice in one, so ids are deduplicated rather than assumed distinct.
 *  - Nothing in the corpus writes an `id` today, but anything that does owns
 *    an anchor other pages may already link to, so an id in the markup is
 *    taken verbatim and never re-derived.
 */

export interface Heading {
  /** Fragment id: the markup's own `id` when it has one, else a slug of the
   *  text. Unique within a single call. */
  id: string
  /** The heading's words — tags removed, entities decoded, space collapsed. */
  text: string
  /** 2 or 3. h1 belongs to the page, h4 and below are too deep for a rail. */
  level: 2 | 3
}

/* An h2 or h3 opening tag. `\b` after the digit is what stops `<h2x>` and
   `<header>` from matching. The attribute run allows a `>` inside a quoted
   value: at any position exactly one of the three alternatives can begin — a
   double-quoted value, a single-quoted value, or a character that is none of
   `>`, `"`, `'` — so there is no ambiguity for the engine to explore. */
const OPEN_TAG = String.raw`<h([23])\b((?:"[^"]*"|'[^']*'|[^>"'])*)>`

/** `id="…"`, `id='…'` or a bare `id=…`, wherever it sits among the attributes.
 *  The leading `(?:^|\s)` is what keeps `data-id` from answering for `id`. */
const ID_ATTR = /(?:^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i

const COMMENT = /<!--[\s\S]*?-->/g

/** Entities that actually occur in editorial prose. Anything unlisted is left
 *  standing rather than guessed at — a visible `&frac12;` is a smaller failure
 *  than a wrong character. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  times: '×',
  deg: '°',
  pound: '£',
  euro: '€',
  cent: '¢',
  copy: '©',
  reg: '®',
  trade: '™',
}

const ENTITY = /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g

const decodeEntities = (input: string): string =>
  input.replace(ENTITY, (whole, body: string) => {
    if (body[0] !== '#') return NAMED_ENTITIES[body.toLowerCase()] ?? whole

    const hex = body[1] === 'x' || body[1] === 'X'
    const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
    if (!Number.isInteger(code) || code < 1 || code > 0x10ffff) return whole
    return String.fromCodePoint(code)
  })

/**
 * The words inside a heading.
 *
 * Tags are dropped outright rather than replaced with a space, because a tag
 * can sit mid-word — `Co<span>st</span>s` is one word and must stay one.
 * `<br>` is the exception: it is the one tag that stands for a gap, so
 * dropping it silently welds `Rates<br>and limits` into `Ratesand`.
 *
 * Entities are decoded after the tags are gone, never before: `&lt;b&gt;` is
 * text an author escaped on purpose, and decoding first would turn it into a
 * tag and then strip it.
 */
const plainText = (fragment: string): string =>
  decodeEntities(
    fragment.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim()

/** Lowercase ASCII words joined by single dashes. Accents are folded rather
 *  than dropped, so `Café` slugs as `cafe` and not `caf`. */
const slugify = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** `costs`, then `costs-2`, then `costs-3`. Two anchors pointing at one place
 *  is the failure this exists to prevent. */
const claim = (base: string, taken: Set<string>): string => {
  if (!taken.has(base)) {
    taken.add(base)
    return base
  }
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  const id = `${base}-${n}`
  taken.add(id)
  return id
}

const attrId = (attrs: string): string | undefined => {
  const found = ID_ATTR.exec(attrs)
  if (!found) return undefined
  const raw = (found[1] ?? found[2] ?? found[3] ?? '').trim()
  return raw || undefined
}

/**
 * Every h2 and h3 in an article body, in document order.
 *
 * Malformed markup contributes nothing rather than corrupting what follows: a
 * self-closing `<h2 />` and a heading whose closing tag is missing are both
 * skipped, and neither can absorb the section after it — each heading's text
 * is bounded by the next heading's opening tag as well as by its own close.
 */
export function extractHeadings(bodyHtml: string): Heading[] {
  if (!bodyHtml) return []

  const html = bodyHtml.replace(COMMENT, '')

  /* Every opening tag first, so each heading's text can be bounded by the next
     one. Without that bound, an unclosed `<h2>` runs to the *following*
     heading's `</h2>` and returns a heading whose text is the article. */
  const opens: { level: 2 | 3; attrs: string; start: number; end: number }[] = []
  const openTag = new RegExp(OPEN_TAG, 'gi')
  let match: RegExpExecArray | null
  while ((match = openTag.exec(html)) !== null) {
    opens.push({
      level: Number(match[1]) as 2 | 3,
      attrs: match[2],
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  const found: { level: 2 | 3; text: string; explicit?: string }[] = []

  for (let i = 0; i < opens.length; i++) {
    const open = opens[i]

    // `<h2 />` — a heading with no words is nothing a rail can name.
    if (/\/\s*$/.test(open.attrs)) continue

    const limit = i + 1 < opens.length ? opens[i + 1].start : html.length
    const region = html.slice(open.end, limit)
    const closeAt = region.search(new RegExp(`</h${open.level}\\s*>`, 'i'))
    if (closeAt === -1) continue

    const text = plainText(region.slice(0, closeAt))
    if (!text) continue

    found.push({ level: open.level, text, explicit: attrId(open.attrs) })
  }

  const taken = new Set<string>()
  return found.map((heading, i) => ({
    /* An id in the markup is an anchor something may already link to, so it is
       used as written. A generated one falls back to the heading's position
       when the words hold nothing sluggable — a heading of one em dash. */
    id: heading.explicit
      ? claim(heading.explicit, taken)
      : claim(slugify(heading.text) || `heading-${i + 1}`, taken),
    text: heading.text,
    level: heading.level,
  }))
}
