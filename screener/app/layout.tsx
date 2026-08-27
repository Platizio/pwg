import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

/*
  One family, as the pinned reference sets it.

  Platizio Global ran three voices — Instrument Serif for names, IBM Plex Mono for
  figures, Manrope for labels. The reference uses a single geometric sans for
  all three jobs, headline figures included, so the three-voice system is
  retired here rather than half-kept: a page that mixes a geometric display
  number with a mono column reads as two designs, not one.

  Variable, so every weight from 300 to 700 costs one file. Column alignment
  moves to `font-variant-numeric: tabular-nums`, which is what a proportional
  face needs to hold a price column steady.
*/
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

/**
 * The dashboard's direction contract, emitted into the markup so it survives
 * the production build and can be audited against what actually shipped.
 *
 * This is a module constant with no interpolation and no input of any kind —
 * `dangerouslySetInnerHTML` is the only way React will emit a literal HTML
 * comment, and there is nothing here for an injection to reach.
 */
const DIRECTION_CONTRACT = `<!--
  MERIDIAN · DASHBOARD DIRECTION CONTRACT · seed 961def36

  THESIS: A dashboard is one ruled sheet, re-ruled as it descends — never a
  stack of sections and never a grid of cards. It refuses the KPI-card row and
  the panel-bounded chart this category always ships.

  OWN-WORLD: Platizio Global, inherited whole from DESIGN.md. Champagne gilt on warm
  black; Instrument Serif names, IBM Plex Mono figures, Manrope tracked caps;
  0px radius; structure by hairline. The terminal runs full bleed — the rails
  are fixed, so every pixel goes to the working column.

  STORY: The reader learns when this is and whether the market is open, where
  the three indices stand, what moved hardest each way, what everyone is
  watching, and where that leaves each sector — reaching any covered
  instrument in one click.

  FIRST VIEWPORT: A dateline rule; a three-index strip; then the sheet's first
  real band split in half — top gainers against top losers, both drawn from
  the whole quoted universe rather than the six covered names.

  FORM: Ruled Field of Registers — candidate 5 of 7 by resonance.

  NOTE: this surface carries no primary action, so it carries no gold fill.
  DESIGN.md's One Gold Rule caps gilt at one filled element; here the count is
  zero and gilt survives only as line, dot and type.

  FINISH: unreviewed and undocumented is unfinished; this build ends with the
  finish review, the verdict, and DESIGN.md
-->`;

export const metadata: Metadata = {
  title: "Platizio Global · Private Markets",
  description:
    "A private-markets terminal — quotes, fundamentals, technicals, peers and holdings, with a simulated execution desk.",
};

export const viewport: Viewport = {
  /* Both lightings, so the browser chrome matches the page rather than
     staying warm black behind a champagne one. */
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#080706" },
    { media: "(prefers-color-scheme: light)", color: "#f2ece1" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Applies a stored lighting choice before the first paint. Without it a
          reader who pinned light would get one frame of the dark terminal on
          every navigation — the flash that makes a theme toggle feel broken.

          Nothing here runs for a reader who has not chosen: the attribute stays
          absent and `prefers-color-scheme` in globals.css decides, with no
          JavaScript involved at all. Inlined rather than imported because a
          module arrives after paint, which is exactly too late.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('pg-theme');" +
              "document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'light';}" +
              "catch(e){document.documentElement.dataset.theme='light';}",
          }}
        />
      </head>
      {/*
        Extensions that rewrite the DOM before React hydrates (Bitdefender adds
        `bis_register` and `__processed_<uuid>__`, Grammarly and password
        managers do similar) stamp attributes onto <body>, which React then
        reports as a hydration mismatch. This suppresses that comparison for
        this element only — it does not reach the children, so real mismatches
        inside the app still surface.
      */}
      <body className="min-h-full" suppressHydrationWarning>
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        {children}
      </body>
    </html>
  );
}
