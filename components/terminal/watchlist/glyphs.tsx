import type { SVGProps } from "react";

/* The few glyphs the watchlist controls need that components/icons.tsx does
   not carry. Drawn to the same grammar — 16px box, 1px stroke, round caps and
   joins, no fills — so they sit beside that set without reading as borrowed. */

type GlyphProps = SVGProps<SVGSVGElement>;

function Glyph({ children, ...props }: GlyphProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const GlyphCheck = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M3.5 8.4 6.6 11.4 12.5 4.8" />
  </Glyph>
);

export const GlyphCaret = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M4.5 6.2 8 9.8l3.5-3.6" />
  </Glyph>
);

export const GlyphUp = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />
  </Glyph>
);

export const GlyphDown = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />
  </Glyph>
);

/** Six dots: the handle a row is dragged by. */
export const GlyphGrip = (p: GlyphProps) => (
  <Glyph {...p} stroke="none" fill="currentColor">
    <circle cx="6" cy="4" r="1" />
    <circle cx="10" cy="4" r="1" />
    <circle cx="6" cy="8" r="1" />
    <circle cx="10" cy="8" r="1" />
    <circle cx="6" cy="12" r="1" />
    <circle cx="10" cy="12" r="1" />
  </Glyph>
);

export const GlyphPencil = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M10.6 3.2 12.8 5.4 6 12.2 3.4 12.6 3.8 10Z" />
  </Glyph>
);

export const GlyphTrash = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M3 4.6h10M6.4 4.6V3.2h3.2v1.4M4.4 4.6l.6 8.2h6l.6-8.2" />
  </Glyph>
);

export const GlyphBookmark = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M4.5 2.8h7v10.4L8 10.6l-3.5 2.6Z" />
  </Glyph>
);
