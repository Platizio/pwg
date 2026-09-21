import handler from "@/lib/site-api/subscribe";
import { refusePublic } from "@/lib/api/public-guard";

/* See app/api/quotes/route.ts. POST-only; the handler 503s honestly when
   NEWSLETTER_WEBHOOK_URL is unset rather than accepting an address it cannot
   deliver. */

/* A relay into the newsletter provider. A person submits a form once; three
   a minute is generous for a human and useless for harvesting. */
export async function POST(request: Request): Promise<Response> {
  const refused = refusePublic(request.headers, {
    route: "subscribe",
    limit: 3,
    windowMs: 60000,
  });
  return refused ?? handler(request);
}
