import handler from "@/lib/site-api/quotes";
import { refusePublic } from "@/lib/api/public-guard";

/* Was a Vercel serverless function under api/. The handler signature Vercel
   passes — (Request) => Promise<Response> — is the same one the App Router
   wants, so the body moved unchanged and this only names the method. */

/* ViewTrade, licensed per account, and `?gainers=1` fans ONE request out to
   twenty-one upstream calls. The home page asks once per load. */
export async function GET(request: Request): Promise<Response> {
  const refused = refusePublic(request.headers, {
    route: "quotes",
    limit: 20,
    windowMs: 60000,
  });
  return refused ?? handler(request);
}
