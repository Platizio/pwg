"use client"

import Image from 'next/image'

import { TEAM, initials } from '../data/team'

/**
 * The whole team, visible at once.
 *
 * Replaces a 3D autoplay carousel that showed roughly one person at a time.
 * On a page whose job is answering "who is actually behind this", rotating
 * seven of eight people out of view is the wrong trade — and a grid needs no
 * autoplay, no interval and no reduced-motion handling.
 *
 * Static markup: the prerendered HTML is the finished section.
 */
export default function TeamGrid() {
  return (
    <ul className="team-grid">
      {TEAM.map((member) => (
        <li className="team-card reveal" key={member.name}>
          <div className="team-photo-wrap">
            {/* Initials sit underneath and the photo covers them. If the image
                fails it removes itself, revealing the initials — a broken-image
                icon where a colleague's face should be is worse than "AP". The
                handler still runs under next/image: it hands the same <img>
                element through, so hiding it reveals the initials as before. */}
            <span className="team-initials" aria-hidden="true">{initials(member.name)}</span>
            {/* `fill` rather than intrinsic dimensions because the wrapper
                already fixes the box at aspect-ratio 1 and .team-photo crops to
                it — the served width follows the column, not a 320px guess. */}
            <Image
              className="team-photo"
              src={member.image}
              alt={member.name}
              fill
              sizes="(max-width: 620px) 45vw, (max-width: 1024px) 30vw, 280px"
              draggable={false}
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          </div>
          <p className="team-name">{member.name}</p>
          <p className="team-role">{member.role}</p>
        </li>
      ))}
    </ul>
  )
}
