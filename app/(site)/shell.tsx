import type { ReactNode } from "react";

import "lenis/dist/lenis.css";

/* The legacy sheets. They style the pages that later phases rebuild
   (pricing, about, media, articles, help, legal) and are deleted page by
   page as those ship. Their chrome sections are already gone. */
import "@/css/styles.css";
import "@/Platizio_Global_Revamp/styles/tokens.css";
import "@/Platizio_Global_Revamp/styles/base.css";
import "@/Platizio_Global_Revamp/styles/page.css";
import "@/Platizio_Global_Revamp/styles/home-market.css";
import "@/Platizio_Global_Revamp/styles/pricing.css";
import "@/Platizio_Global_Revamp/styles/about.css";
import "@/Platizio_Global_Revamp/styles/media.css";
import "@/Platizio_Global_Revamp/styles/help.css";
import "@/Platizio_Global_Revamp/styles/library.css";
import "@/Platizio_Global_Revamp/styles/legal.css";
import "./marketing-surfaces.css";
/* The products page owns its own sheet and imports it itself; this keeps the
   cascade position it had. */
import "@/Platizio_Global_Revamp/styles/products.css";

/* The system. Order is the cascade: tokens, then the ground and type, then the
   material, then the chrome. Everything above loses to these at equal
   specificity, which is the point. Nothing may be added below chrome.css
   except a sheet that is entirely inside a media query — see below. */
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/glass.css";
import "./styles/home.css";
import "./styles/chrome.css";

/* The one thing allowed after chrome.css, because it has to be and because it
   cannot do any harm there. The phone type floor raises label sizes that are
   set as low as 9px across nine sheets — several of them in chrome.css itself,
   so it can only win from here. Every rule in it lives inside
   `@media (max-width: 560px)`, so above that width the file contributes
   nothing at all and the cascade above is exactly as it was. */
import "./styles/mobile.css";

import { AppProvider } from "@/src/context/AppContext";
import Header from "@/components/marketing/chrome/header";
import Footer from "@/components/marketing/chrome/footer";
import ContactModal from "@/components/marketing/chrome/contact-modal";
import WhatsAppFloat from "@/components/marketing/chrome/whatsapp-float";
import SiteChrome from "./site-chrome";
import { MotionProvider } from "./motion-provider";

/*
 * The marketing site's shell: every stylesheet the site depends on, in cascade
 * order, plus the chrome that frames every page.
 *
 * It lives here rather than inside `layout.tsx` because the route group's
 * layout is NOT the only entry that needs it. `app/not-found.tsx` catches every
 * unmatched URL for the whole app, and a root-level not-found renders under
 * `app/layout.tsx` alone — which imports `globals.css` and nothing else. So the
 * 404 shipped with no tokens, no type, no header and no footer: raw text
 * stacked in the top-left corner and an unsized arrow filling the viewport,
 * because the rule that constrains `.btn svg` was in a sheet that never
 * loaded. Both entries import this, so both get the same site.
 *
 * The terminal sits outside this route group and keeps its own full-bleed
 * shell; none of this loads there.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <MotionProvider>
        <SiteChrome />
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Header />
        <main id="main-content">{children}</main>
        <Footer />
        <ContactModal />
        <WhatsAppFloat />
      </MotionProvider>
    </AppProvider>
  );
}
