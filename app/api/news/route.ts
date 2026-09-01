import handler from "@/lib/site-api/news";

/* See app/api/quotes/route.ts. The 12h cache this sets on its own responses is
   load-bearing: the upstream key has a 2000-request LIFETIME quota. */
export const GET = handler;
