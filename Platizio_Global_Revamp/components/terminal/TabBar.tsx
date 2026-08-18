import { useRef } from 'react'

export interface TabDef {
  id: string
  label: string
}

interface TabBarProps {
  tabs: readonly TabDef[]
  active: string
  onChange: (id: string) => void
  /** Used to tie each tab to its panel via aria-controls. */
  idPrefix: string
}

/**
 * The terminal's tabs, with a full WAI-ARIA tab pattern.
 *
 * Roving tabindex — only the selected tab is in the tab order, so a keyboard
 * user tabs past the whole group in one press rather than four. Arrow keys
 * move between tabs, Home and End jump to the ends, and selection follows
 * focus, which is the correct behaviour when switching panels is instant and
 * cheap (it is: every panel's data is already in memory).
 *
 * The sliding gold underline is CSS on [aria-selected]; nothing here measures
 * or positions it, so there is no layout read during render and nothing to
 * resynchronise on resize.
 */
export default function TabBar({ tabs, active, onChange, idPrefix }: TabBarProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const move = (to: number) => {
    const index = (to + tabs.length) % tabs.length
    onChange(tabs[index].id)
    refs.current[index]?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case 'ArrowRight': event.preventDefault(); move(index + 1); break
      case 'ArrowLeft': event.preventDefault(); move(index - 1); break
      case 'Home': event.preventDefault(); move(0); break
      case 'End': event.preventDefault(); move(tabs.length - 1); break
    }
  }

  return (
    <div className="m-tabs" role="tablist" aria-label="Instrument detail">
      {tabs.map((tab, index) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            ref={(el) => { refs.current[index] = el }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            className="m-tab"
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
