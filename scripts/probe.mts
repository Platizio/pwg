/* Standalone endpoint probe.

   Run:  npm run probe
         npm run probe -- --only=auth,quotes
         npm run probe -- --json

   Requires --conditions=react-server so that `server-only` resolves to its
   empty shim; see the npm script. Nothing this imports may reach next/cache,
   which is why the cache layer lives in its own module. */

import { formatReport, runProbe } from "../lib/api/probe.ts";

const args = process.argv.slice(2);
const json = args.includes("--json");
const onlyArg = args.find((x) => x.startsWith("--only="));
const only = onlyArg ? onlyArg.slice("--only=".length).split(",").filter(Boolean) : undefined;

const report = await runProbe(only);

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`${formatReport(report)}\n`);
}

process.exit(report.failed);
