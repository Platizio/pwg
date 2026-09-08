"use client"

import Image from 'next/image'

import { TEAM, initials } from '../data/team'

/**
 * The team, moving.
 *
 * A continuous marquee rather than a slide-at-a-time carousel. The distinction
 * matters on this section: its heading is "Eight people, named", and a carousel
 * that shows one person and rotates the other seven out of view answers "who is
 * behind this" worse than a static list does. This one keeps four or five faces
 * on screen at once and simply drifts, so the motion is decoration on top of a
 * list rather than a mechanism you have to operate to read it.
 *
 * THE LOOP. The set is rendered twice and the track travels exactly -50%, so
 * the first pass lands on the duplicate's first card and there is no seam. That
 * only holds if the inter-card spacing is a margin on EVERY card rather than a
 * flex `gap`: N cards carry N-1 gaps, which leaves the half-way point one gap
 * short and the track visibly jumps once per cycle.
 *
 * THE DUPLICATE is `aria-hidden`. Without it a screen reader reads the team
 * twice and announces sixteen people where there are eight.
 *
 * STOPPING. Hover and focus-within pause it, so a reader can finish a name.
 * Under `prefers-reduced-motion` the animation is off, the duplicate is
 * removed, and the track becomes an ordinary horizontal scroller — the content
 * stays reachable rather than being frozen mid-drift.
 */

function Member({ member, clone }: { member: (typeof TEAM)[number]; clone?: boolean }) {
  return (
    <li className="team-card" {...(clone ? { 'aria-hidden': true } : {})}>
      <div className="team-photo-wrap">
        {/* Initials sit underneath and the photo covers them. If the image
            fails it removes itself, revealing the initials — a broken-image
            icon where a colleague's face should be is worse than "AP". The
            handler still runs under next/image: it hands the same <img>
            element through, so hiding it reveals the initials as before. */}
        <span className="team-initials" aria-hidden="true">{initials(member.name)}</span>
        <Image
          className="team-photo"
          src={member.image}
          alt={clone ? '' : member.name}
          fill
          sizes="(max-width: 620px) 55vw, (max-width: 1024px) 30vw, 264px"
          draggable={false}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      </div>
      <p className="team-name">{member.name}</p>
      <p className="team-role">{member.role}</p>
    </li>
  )
}

export default function TeamCarousel() {
  return (
    <div className="team-marquee">
      <ul className="team-track">
        {TEAM.map((member) => (
          <Member member={member} key={member.name} />
        ))}
        {TEAM.map((member) => (
          <Member member={member} clone key={`dup-${member.name}`} />
        ))}
      </ul>
    </div>
  )
}
