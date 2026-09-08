/* Reading stylesheets as text.
 *
 * There is no DOM in this suite and no renderer, so nothing here computes what
 * a browser would actually paint. What it does instead is read the sheets the
 * way a careful reviewer would — as declarations grouped into blocks, and as
 * colours with measurable luminance — which turns out to be enough to catch
 * the class of defect that has actually shipped in this repo:
 *
 *   - a declaration whose value went missing, so a shadow silently vanished
 *     from two tile types while every sibling kept theirs;
 *   - the same property written twice in one block, so a `position: sticky`
 *     quietly became something else;
 *   - a colour left behind by a palette conversion, unreadable on its new
 *     ground.
 *
 * None of those throw. None of them fail a build. They just render a slightly
 * wrong page forever, which is exactly the kind of thing a text-level guard is
 * good at and a human reviewer is bad at.
 *
 * Everything here is pure: callers read the files. That keeps the module out
 * of the app's runtime graph and keeps the parsing honest — the same string
 * always gives the same answer.
 */

/* ------------------------------------------------------------------ parsing */

/** One `property: value` pair, with the source line its property name sits on. */
export type Declaration = {
  property: string;
  value: string;
  line: number;
};

/** One `{ … }` block: a style rule, or an at-rule such as `@media`. */
export type Rule = {
  /** The text before the brace, whitespace collapsed. `@media …` for at-rules. */
  prelude: string;
  /** `prelude` split on top-level commas. Empty for at-rules. */
  selectors: string[];
  /** Enclosing preludes, outermost first. */
  ancestors: string[];
  declarations: Declaration[];
  /** Source line the prelude starts on. */
  line: number;
};

/**
 * Replace comment bodies with spaces, preserving every newline and every
 * offset.
 *
 * Blanking rather than deleting is the point: a comment that documents a bug
 * — "every paragraph was still #16283C" — must not be mistaken for the bug,
 * and a line number computed after the strip must still name the right line.
 */
export function blankComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/** Split a selector list on commas that are not inside parens or quotes. */
export function splitSelectorList(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let buf = "";
  for (const ch of prelude) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

/**
 * Every block in a stylesheet, innermost first, with its own declarations.
 *
 * Deliberately not a real CSS parser. It tracks quotes and parentheses so a
 * `url("a{b")` or a `@media (min-width: 40em)` cannot break the block
 * structure, and that is the whole ambition. What it must get right is the
 * thing the lints depend on: a declaration ends at a top-level `;` or at the
 * closing brace, never at a newline — so a `box-shadow:` whose value sits on
 * the following line is a complete declaration, not an empty one.
 */
export function parseCss(css: string): Rule[] {
  const src = blankComments(css);
  const out: Rule[] = [];
  const open: Array<{ prelude: string; line: number; declarations: Declaration[] }> = [];

  let buf = "";
  let bufLine = 1;
  let line = 1;
  let quote: string | null = null;
  let paren = 0;

  const flushDeclaration = () => {
    const text = buf.trim();
    buf = "";
    if (!text) return;
    const frame = open[open.length - 1];
    if (!frame) return;
    const colon = text.indexOf(":");
    if (colon <= 0) return;
    frame.declarations.push({
      property: text.slice(0, colon).trim(),
      value: text.slice(colon + 1).trim(),
      line: bufLine,
    });
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\n") line++;

    if (quote) {
      buf += ch;
      if (ch === "\\") {
        const next = src[i + 1];
        if (next !== undefined) {
          if (next === "\n") line++;
          buf += next;
          i++;
        }
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      if (!buf.trim()) bufLine = line;
      quote = ch;
      buf += ch;
      continue;
    }

    if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);

    if (paren === 0 && (ch === "{" || ch === "}" || ch === ";")) {
      if (ch === "{") {
        const prelude = buf.trim().replace(/\s+/g, " ");
        open.push({ prelude, line: prelude ? bufLine : line, declarations: [] });
        buf = "";
      } else if (ch === "}") {
        flushDeclaration();
        const frame = open.pop();
        if (frame) {
          out.push({
            prelude: frame.prelude,
            selectors: frame.prelude.startsWith("@") ? [] : splitSelectorList(frame.prelude),
            ancestors: open.map((f) => f.prelude),
            declarations: frame.declarations,
            line: frame.line,
          });
        }
      } else {
        flushDeclaration();
      }
      continue;
    }

    if (!buf.trim() && !/\s/.test(ch)) bufLine = line;
    buf += ch;
  }

  return out;
}

/** Class names named by a selector: `.ft-cell::before` → `["ft-cell"]`. */
export function classNames(selector: string): string[] {
  return [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
}

/** Custom properties declared by the blocks whose prelude `matches`. */
export function customProperties(rules: Rule[], matches: (prelude: string) => boolean): Map<string, string> {
  const vars = new Map<string, string>();
  for (const rule of rules) {
    if (!matches(rule.prelude)) continue;
    for (const d of rule.declarations) {
      if (d.property.startsWith("--")) vars.set(d.property, d.value);
    }
  }
  return vars;
}

/**
 * Substitute `var(--name)` — and `var(--name, fallback)` — until the value
 * stops changing. Returns the value unchanged if a name is not declared, so
 * an unresolvable token reads as "not a colour" rather than as a wrong one.
 */
export function resolveVars(value: string, vars: Map<string, string>, depth = 8): string {
  let out = value;
  for (let i = 0; i < depth; i++) {
    const next = out.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g, (whole, name: string, fallback?: string) => {
      const declared = vars.get(name);
      if (declared !== undefined) return declared;
      if (fallback !== undefined) return fallback.trim();
      return whole;
    });
    if (next === out) return out;
    out = next;
  }
  return out;
}

/* ------------------------------------------------------------------- colour */

export type Rgba = { r: number; g: number; b: number; a: number };

/**
 * `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()` in either the
 * comma or the space syntax. Anything else — `color-mix`, a gradient, a
 * keyword — returns null, and callers treat that as "not measurable here"
 * rather than as a pass.
 */
export function parseColor(value: string): Rgba | null {
  const v = value.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hex) {
    const h = hex[1];
    const pair = (s: string) => parseInt(s.length === 1 ? s + s : s, 16);
    if (h.length === 3 || h.length === 4) {
      return { r: pair(h[0]), g: pair(h[1]), b: pair(h[2]), a: h.length === 4 ? pair(h[3]) / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: pair(h.slice(0, 2)),
        g: pair(h.slice(2, 4)),
        b: pair(h.slice(4, 6)),
        a: h.length === 8 ? pair(h.slice(6, 8)) / 255 : 1,
      };
    }
    return null;
  }

  const fn = /^rgba?\(([^()]*)\)$/.exec(v);
  if (fn) {
    const parts = fn[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((p) => (p.endsWith("%") ? Number(p.slice(0, -1)) / 100 : Number(p)));
    if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
    const channel = (raw: string, n: number) => (raw.endsWith("%") ? n * 255 : n);
    const raw = fn[1].split(/[\s,/]+/).filter(Boolean);
    const r = channel(raw[0], parts[0]);
    const g = channel(raw[1], parts[1]);
    const b = channel(raw[2], parts[2]);
    let a = 1;
    if (parts.length > 3 && Number.isFinite(parts[3])) a = parts[3];
    return { r, g, b, a };
  }

  return null;
}

/** Composite a translucent colour over an opaque one. */
export function flatten(fg: Rgba, bg: Rgba): Rgba {
  const a = Math.min(1, Math.max(0, fg.a));
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(c: Rgba): number {
  const channel = (v: number) => {
    const s = Math.min(255, Math.max(0, v)) / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/**
 * WCAG 2.1 contrast ratio, 1 to 21. A translucent foreground is composited
 * over the background first, which is what a browser paints.
 */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const ground = bg.a < 1 ? flatten(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
  const ink = fg.a < 1 ? flatten(fg, ground) : fg;
  const a = relativeLuminance(ink);
  const b = relativeLuminance(ground);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Hue in degrees, saturation and lightness in 0..1. */
export function hsl(c: Rgba): { h: number; s: number; l: number } {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

/** Every colour literal in a sheet, with the line it appears on. */
export function colorLiterals(css: string): Array<{ text: string; color: Rgba; line: number }> {
  const src = blankComments(css);
  const out: Array<{ text: string; color: Rgba; line: number }> = [];
  const lineAt = (index: number) => src.slice(0, index).split("\n").length;
  for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)/g)) {
    const color = parseColor(m[0]);
    if (!color) continue;
    out.push({ text: m[0], color, line: lineAt(m.index) });
  }
  return out;
}
