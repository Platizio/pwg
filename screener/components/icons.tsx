import type { SVGProps } from "react";

/**
 * Lux is almost entirely typographic — navigation, insights and signals carry
 * no icons at all. Only the handful of controls that genuinely need a glyph
 * are drawn here, at 1px stroke to sit with the design's hairline rules.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
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

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

export const IconMinus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8h10" />
  </Icon>
);

/* Two arrows passing, for the control that trades one side of the order for
   the other. Drawn rather than borrowed: the set is 1px stroke on a 16 grid. */
export const IconSwap = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 3.5L2 6h9M11.5 12.5L14 10H5" />
  </Icon>
);

export const IconMenu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 4.5h12M2 8h12M2 11.5h12" />
  </Icon>
);

export const IconArea = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.5 11 5.4 7 8 9.4l2.6-4.4L14.5 8.6" />
    <path d="M1.5 11 5.4 7 8 9.4l2.6-4.4L14.5 8.6v5h-13Z" fill="currentColor" fillOpacity="0.16" stroke="none" />
  </Icon>
);

export const IconCandles = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.6 2v12M11.4 2v12" />
    <rect x="2.9" y="5" width="3.4" height="6" />
    <rect x="9.7" y="4" width="3.4" height="5" />
  </Icon>
);

export const IconVolume = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 13.5v-3.5M6.2 13.5v-6.5M9.8 13.5v-2.5M13.5 13.5v-8.5" strokeWidth="1.4" />
  </Icon>
);

/**
 * Direction carets. Sage and terracotta carry direction everywhere in this
 * system, and colour alone is not an accessible signal — so every figure that
 * states a direction pairs its colour with one of these. Filled rather than
 * stroked: at 8px a 1px outline triangle turns to mush.
 */
export const IconRise = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3.5 13 12H3Z" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconFall = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 12.5 3 4h10Z" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconArrow = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Icon>
);

/**
 * The navigation set.
 *
 * The first system carried no icons at all — navigation was text only, and
 * that was a deliberate position. The card surface changes the arithmetic: a
 * rail of filled rounded items with nothing but a word in each reads as empty,
 * and the eye needs an anchor at the left edge of every row.
 *
 * Drawn rather than imported so they share the hairline grammar of the rules
 * they replaced: one 1.25px stroke, round caps and joins, 16px box, no fills.
 */
const NAV_STROKE = 1.25;

function NavIcon({ children, ...props }: IconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={NAV_STROKE}
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

/** Overview — a reading taken off a dial. */
export const IconOverview = (p: IconProps) => (
  <NavIcon {...p}>
    <circle cx="9" cy="9" r="6.4" />
    <path d="M6.2 9.9 8.3 7.6l1.7 1.7 2.1-2.6" />
  </NavIcon>
);

/** Watch list — a ruled sheet of entries. */
export const IconWatchlist = (p: IconProps) => (
  <NavIcon {...p}>
    <rect x="3.4" y="2.6" width="11.2" height="12.8" rx="1.6" />
    <path d="M6.2 6.2h5.6M6.2 9h5.6M6.2 11.8h3.2" />
  </NavIcon>
);

/** Preferences — a pair of settings sliders. */
export const IconPreferences = (p: IconProps) => (
  <NavIcon {...p}>
    <path d="M3 6.2h4.2M10.4 6.2H15M3 11.8h6.2M12.4 11.8H15" />
    <circle cx="8.8" cy="6.2" r="1.5" />
    <circle cx="11" cy="11.8" r="1.5" />
  </NavIcon>
);

/** The desk — a person at a counter. */
export const IconDesk = (p: IconProps) => (
  <NavIcon {...p}>
    <circle cx="9" cy="6.4" r="2.6" />
    <path d="M3.6 15c.5-2.8 2.7-4.2 5.4-4.2s4.9 1.4 5.4 4.2" />
  </NavIcon>
);

/** A scheduled event. */
export const IconClock = (p: IconProps) => (
  <NavIcon {...p}>
    <circle cx="9" cy="9" r="6.4" />
    <path d="M9 5.4V9l2.4 1.5" />
  </NavIcon>
);

/** The session, open or closed. */
export const IconPulse = (p: IconProps) => (
  <NavIcon {...p}>
    <path d="M2.4 9h3l1.8-4.4L10.6 13l1.5-4h3.5" />
  </NavIcon>
);

/** Chart / equity. */
export const IconChart = (p: IconProps) => (
  <NavIcon {...p}>
    <path d="M3 14.4V8.2M7.4 14.4V4.6M11.8 14.4v-4M15 14.4v-7" strokeWidth="1.5" />
  </NavIcon>
);

export const IconChevron = (p: IconProps) => (
  <NavIcon {...p}>
    <path d="M7 4.4 11.6 9 7 13.6" />
  </NavIcon>
);

/** Collapse the rail. */
export const IconCollapse = (p: IconProps) => (
  <NavIcon {...p}>
    <rect x="2.6" y="3.4" width="12.8" height="11.2" rx="2" />
    <path d="M7 3.4v11.2" />
  </NavIcon>
);

/** A gift — the referral row. */
export const IconGift = (p: IconProps) => (
  <NavIcon {...p}>
    <rect x="2.8" y="7.2" width="12.4" height="7.6" rx="1.4" />
    <path d="M2.8 7.2h12.4M9 7.2v7.6" />
    <path d="M9 7.2C7.6 5 6.6 4 5.6 4a1.6 1.6 0 0 0 0 3.2M9 7.2c1.4-2.2 2.4-3.2 3.4-3.2a1.6 1.6 0 0 1 0 3.2" />
  </NavIcon>
);

/** A calendar date. */
export const IconCalendar = (p: IconProps) => (
  <NavIcon {...p}>
    <rect x="2.8" y="4" width="12.4" height="11" rx="1.8" />
    <path d="M2.8 7.4h12.4M6.2 2.6v2.6M11.8 2.6v2.6" />
  </NavIcon>
);

/** The globe on the language control. */
export const IconGlobe = (p: IconProps) => (
  <NavIcon {...p}>
    <circle cx="9" cy="9" r="6.4" />
    <path d="M2.6 9h12.8M9 2.6c1.7 1.8 2.6 4 2.6 6.4S10.7 13.6 9 15.4C7.3 13.6 6.4 11.4 6.4 9S7.3 4.4 9 2.6Z" />
  </NavIcon>
);

/** Search — the screener's primary affordance. */
export const IconSearch = (p: IconProps) => (
  <NavIcon {...p}>
    <circle cx="8.2" cy="8.2" r="5.2" />
    <path d="m12.2 12.2 3 3" />
  </NavIcon>
);

/** A newspaper — the wire. */
export const IconWire = (p: IconProps) => (
  <NavIcon {...p}>
    <path d="M3 4.4h9.2v10.2H4.6A1.6 1.6 0 0 1 3 13V4.4Z" />
    <path d="M12.2 7h1.2A1.6 1.6 0 0 1 15 8.6V13a1.6 1.6 0 0 1-3.2 0" />
    <path d="M5.4 7h4.4M5.4 9.6h4.4M5.4 12.2h2.6" />
  </NavIcon>
);

/** Lighting — a sun for the lit page. */
export const IconSun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="3.1" />
    <path d="M8 1.4v1.5M8 13.1v1.5M1.4 8h1.5M13.1 8h1.5M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1" />
  </Icon>
);

/** Lighting — a moon for the dim room the terminal was designed in. */
export const IconMoon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z" />
  </Icon>
);
