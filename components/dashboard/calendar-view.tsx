import Link from "next/link";
import { IconCalendar } from "@/components/icons";
import { Badge, Card } from "@/components/ui/surface";
import { calendarDate, type CalendarEvent } from "@/lib/market/session";
import { instrumentPath } from "@/lib/market/paths";

const KIND_LABEL = {
  earnings: "Earnings",
  macro: "Macro",
  policy: "Policy",
  corporate: "Corporate action",
} as const;

const KIND_NOTE = {
  earnings: "A company reporting its own results.",
  macro: "A figure for the whole economy, not one company.",
  policy: "A decision by the people who set interest rates.",
  corporate: "A dividend or a split at one company.",
} as const;

/**
 * The calendar, in full.
 *
 * The rail shows these five as a list of titles and times, which answers
 * "what is coming" and nothing else. A reader who clicks through has asked the
 * next question — what is it, and why would it move anything — so this page
 * gives every event its summary and its one thing to watch, on the page, with
 * no second click. Nothing here is behind a dialog.
 *
 * Events are grouped by the day they land on, because "Thursday" is how a
 * person holds a week in their head, not "offset 3".
 */
export function CalendarView({ events, at }: { events: CalendarEvent[]; at: number }) {
  /* Group by day so the reader sees a week, not a queue. Events arrive in
     offset order, so a running comparison is enough — no sort needed. */
  const days: { offset: number; label: string; date: string; events: CalendarEvent[] }[] = [];
  for (const event of events) {
    const { date, relative } = calendarDate(event, at);
    const last = days[days.length - 1];
    if (last && last.offset === event.offset) last.events.push(event);
    else days.push({ offset: event.offset, label: relative, date, events: [event] });
  }

  return (
    <main id="terminal-main" className="flex min-w-0 flex-col overflow-hidden lg:h-full">
      <header className="border-b border-rule-section px-4 py-5 sm:px-6 lg:px-7">
        <h1 className="font-serif text-[clamp(1.75rem,3vw,2.25rem)] leading-none">
          Key events
        </h1>
        <p className="mt-3 max-w-[62ch] text-[13.5px] leading-[1.7] text-ink-3">
          The dates that tend to move prices, with what each one is and the single
          figure worth watching when it lands.
        </p>
      </header>

      <div className="flex-1 px-4 pt-5 pb-10 sm:px-6 lg:overflow-y-auto lg:px-7">
        {days.map((day) => (
          <section key={day.offset} aria-label={`${day.label}, ${day.date}`} className="mt-6 first:mt-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
              <h2 className="font-serif text-[21px] leading-none text-ink-2">{day.label}</h2>
              <p className="text-[12.5px] text-ink-3">{day.date}</p>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              {day.events.map((event) => (
                <Card key={`${event.title}-${event.offset}`} className="px-6 py-6">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                    <div className="flex min-w-0 items-start gap-3.5">
                      <span
                        aria-hidden="true"
                        className="tile grid h-10 w-10 flex-none place-items-center text-gold"
                      >
                        <IconCalendar className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-serif text-[20px] leading-[1.35] text-pretty text-ink">
                          {event.title}
                        </h3>
                        <p className="font-mono mt-1.5 text-[12.5px] tracking-[0.04em] text-ink-3">
                          {event.time}
                        </p>
                      </div>
                    </div>
                    <Badge tone="quiet">{KIND_LABEL[event.kind]}</Badge>
                  </div>

                  <p className="mt-5 max-w-[68ch] text-[13.5px] leading-[1.75] text-ink-3">
                    {event.summary}
                  </p>

                  <div className="mt-5 border-t border-rule-section pt-4">
                    <p className="card-label">What to watch</p>
                    <p className="mt-2 max-w-[68ch] text-[13.5px] leading-[1.75] text-ink-2">
                      {event.watch}
                    </p>
                  </div>

                  {/* The note explains the kind; the link is an action. They
                      were one sentence, which made the action a 16px target
                      hanging off the end of prose. */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                    <p className="text-[12.5px] leading-[1.6] text-ink-3">
                      {KIND_NOTE[event.kind]}
                    </p>
                    {event.ticker && (
                      <Link
                        href={instrumentPath(event.ticker)}
                        className="-mx-2 inline-flex min-h-9 items-center rounded-full px-2 text-[12.5px] text-gold transition-colors hover:bg-[rgba(217,189,139,0.06)] hover:text-ink"
                      >
                        Open {event.ticker}
                      </Link>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}

        <p className="mt-8 max-w-[70ch] text-[12.5px] leading-[1.75] text-ink-3">
          Every date and figure on this page is simulated for demonstration.
          Platizio Global is not connected to a market feed, and nothing here is advice.
        </p>
      </div>
    </main>
  );
}
