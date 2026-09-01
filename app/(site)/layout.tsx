import type { ReactNode } from "react";

import "lenis/dist/lenis.css";
import "@/css/styles.css";
/* Order matters: the revamp layer redefines tokens declared in styles.css, so
   it must load after it. tokens -> base -> components. This chain used to live
   in src/entry-client.tsx, which the Next migration retired; losing it left
   every rule in it unapplied, which is why the header logo rendered at its
   natural size. */
import "@/Platizio_Global_Revamp/styles/tokens.css";
import "@/Platizio_Global_Revamp/styles/base.css";
import "@/Platizio_Global_Revamp/styles/chrome.css";
/* Page furniture shared by every inner page: the .page-hero opener, the
   breadcrumb trail, and the 404. */
import "@/Platizio_Global_Revamp/styles/page.css";
import "@/Platizio_Global_Revamp/styles/home-market.css";
import "@/Platizio_Global_Revamp/styles/pricing.css";
import "@/Platizio_Global_Revamp/styles/about.css";
import "@/Platizio_Global_Revamp/styles/media.css";
/* /faqs and /user-guide. */
import "@/Platizio_Global_Revamp/styles/help.css";
/* /articles, the topic hubs, and the article pages. */
import "@/Platizio_Global_Revamp/styles/library.css";
/* /disclaimer, /privacy, /terms. */
import "@/Platizio_Global_Revamp/styles/legal.css";
/* products.css declares every token on .ft and nothing on :root, so it can
   load beside the others without reaching the rest of the site. */
import "@/Platizio_Global_Revamp/styles/products.css";
/* Scoped to .pg-terminal, which the Products surface still carries. */
import "@/Platizio_Global_Revamp/styles/terminal.css";
import "@/Platizio_Global_Revamp/styles/terminal-v2.css";

import { AppProvider } from "@/src/context/AppContext";
import Header from "@/src/components/Header";
import Footer from "@/src/components/Footer";
import ContactModal from "@/src/components/ContactModal";
import WhatsAppFloat from "@/src/components/WhatsAppFloat";
import SiteChrome from "./site-chrome";

/* The marketing site's chrome.

   This is the old src/App.tsx <Layout/> — everything that wrapped <Outlet/> —
   expressed as a route-group layout. The terminal sits outside this group, so
   it keeps its own full-bleed shell and none of this loads there. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <SiteChrome />
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Header />
      <main id="main-content">{children}</main>
      <Footer />
      <ContactModal />
      <WhatsAppFloat />
    </AppProvider>
  );
}
