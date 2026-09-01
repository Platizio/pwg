import handler from "@/lib/site-api/quotes";

/* Was a Vercel serverless function under api/. The handler signature Vercel
   passes — (Request) => Promise<Response> — is the same one the App Router
   wants, so the body moved unchanged and this only names the method. */
export const GET = handler;
