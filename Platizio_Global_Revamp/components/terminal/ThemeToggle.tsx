import type { ComponentType } from 'react'
import { Moon, Sun } from './Icons'
import type { Ground } from '../../hooks/useTerminalTheme'

interface ThemeToggleProps {
  ground: Ground
  onChange: (next: Ground) => void
}

const GROUNDS: readonly { id: Ground; label: string; Icon: ComponentType }[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
]

/**
 * Two explicit positions rather than one flipping button.
 *
 * A single toggle has to answer "does this icon show the state I am in, or the
 * state I would get" — and it answers differently on every site. Two seats,
 * each stating its own aria-pressed, means the current ground is visible
 * without decoding anything, and a screen reader is told which of the two is
 * active rather than being handed a verb.
 *
 * aria-label carries the accessible name so the word beside the glyph can drop
 * on a narrow screen without taking the name with it.
 */
export default function ThemeToggle({ ground, onChange }: ThemeToggleProps) {
  return (
    <div className="m-theme" role="group" aria-label="Terminal ground">
      {GROUNDS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={id === ground}
          aria-label={`${label} ground`}
          onClick={() => onChange(id)}
        >
          <Icon />
          <span className="m-theme-w">{label}</span>
        </button>
      ))}
    </div>
  )
}
