import NotFound from "@/src/views/NotFound";
import { SiteShell } from "./(site)/shell";

/*
 * The catch-all 404. It sits at the root because that is the only place Next
 * consults for a URL that matches no route — a `not-found.tsx` inside the
 * `(site)` group would only answer `notFound()` calls raised from within that
 * group, not a mistyped address.
 *
 * Sitting at the root means it renders under `app/layout.tsx`, which imports
 * `globals.css` and nothing else, so it needs the site's shell explicitly.
 * Without it the page shipped with no tokens, no type, no header and no footer.
 */
export default function Page() {
  return (
    <SiteShell>
      <NotFound />
    </SiteShell>
  );
}
