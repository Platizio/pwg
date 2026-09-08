import type { ReactNode } from "react";

import { SiteShell } from "./shell";

/* Every stylesheet and every piece of chrome lives in `shell.tsx`, because the
   root not-found needs the identical set and cannot reach this layout. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
