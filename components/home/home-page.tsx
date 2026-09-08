"use client";

import SEO from "@/src/components/SEO";
import { useMarketData } from "@/Platizio_Global_Revamp/hooks/useMarketData";
import { COPY } from "@/lib/home/copy";
import { useSession } from "./use-session";
import { Hero } from "./hero";
import { Ticker } from "./ticker";
import { Closing, Faq, Fees, How, Regulated, Why } from "./sections";

/*
 * The home page, in the products page's own world and the order Aayush set:
 * hero, the tall ticker, why invest globally, how to invest, regulated, fees,
 * questions, the account, then the footer. The `ft` root class is what gives
 * every section the products page's tokens and sheet.
 */
export default function HomePage() {
  const data = useMarketData();
  const session = useSession();

  return (
    <div className="ft hm">
      <SEO title={COPY.seo.title} description={COPY.seo.description} canonical="/" />
      <Hero />
      <Ticker data={data} session={session} />
      <Why />
      <How />
      <Regulated />
      <Fees />
      <Faq />
      <Closing />
    </div>
  );
}
