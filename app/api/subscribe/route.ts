import handler from "@/lib/site-api/subscribe";

/* See app/api/quotes/route.ts. POST-only; the handler 503s honestly when
   NEWSLETTER_WEBHOOK_URL is unset rather than accepting an address it cannot
   deliver. */
export const POST = handler;
