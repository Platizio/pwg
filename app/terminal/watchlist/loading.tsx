/* The watchlist page's shape while its snapshot is read.

   Without this the route would inherit app/terminal/loading.tsx, which is the
   dashboard's skeleton — boards and a rail that this page never draws, and
   then a jump to a header, tabs and a table. This stands in the places the
   page will occupy. No data reads and no client imports, for the reason the
   terminal's other fallbacks give. */

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse bg-[var(--tint-gold-ghost)] ${className}`} />;
}

export default function WatchlistLoading() {
  return (
    <main
      id="terminal-main"
      aria-busy="true"
      aria-label="Loading watchlists"
      className="flex min-w-0 flex-col overflow-hidden lg:h-full"
    >
      <header className="border-b border-rule-section px-4 py-5 sm:px-6 lg:px-7">
        <Bar className="h-8 w-44" />
        <Bar className="mt-4 h-3.5 w-[min(420px,80%)]" />
      </header>
      <div className="flex-1 px-4 pt-5 pb-12 sm:px-6 lg:px-7">
        <div className="flex flex-wrap gap-2">
          <Bar className="h-10 w-36 rounded-full" />
          <Bar className="h-10 w-28 rounded-full" />
        </div>
        <div className="mt-8 flex flex-col gap-4">
          <Bar className="h-7 w-52" />
          <Bar className="h-11 w-[min(520px,100%)] rounded-full" />
          {Array.from({ length: 6 }, (_, i) => (
            <Bar key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </main>
  );
}
