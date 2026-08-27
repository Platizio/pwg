import "server-only";
import { cache } from "react";

/* The only real clock in the codebase.

   Everything else derives "now" from a value passed in, which is what keeps
   the server and the browser rendering identical bytes. React's cache() pins
   this to one value per request so that two components a millisecond apart
   cannot disagree about what time it is. */
export const nowSeconds = cache(() => Math.floor(Date.now() / 1000));
export const nowMs = cache(() => Date.now());
