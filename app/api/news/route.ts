import handler from "@/lib/site-api/news";
import { refusePublic } from "@/lib/api/public-guard";

/* See app/api/quotes/route.ts. The 12h cache this sets on its own responses is
   load-bearing: the upstream key has a 2000-request LIFETIME quota. */

/* newsapi.ai, whose key has a TWO THOUSAND REQUEST LIFETIME quota — not per
   month, ever. The rail fetches once per page load and the response is cached
   twelve hours, so ten a minute is far above any reader and far below anything
   that could end the feature. */
export async function GET(request: Request): Promise<Response> {
  const refused = refusePublic(request.headers, {
    route: "news",
    limit: 10,
    windowMs: 60000,
  });
  return refused ?? handler(request);
}
