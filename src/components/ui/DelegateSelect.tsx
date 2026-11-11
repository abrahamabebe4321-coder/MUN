import { useId, useMemo, useState } from 'react'
import type { Delegate } from '../../domain/types'
import { Flag } from '../Flag'

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function DelegateSelect({
  delegates,
  value,
  onChange,
  label,
  placeholder,
  excludeIds,
  autoFocus,
}: {
  delegates: Delegate[]
  value: string | null
  onChange: (id: string | null) => void
  label: string
  placeholder?: string
  excludeIds?: string[]
  autoFocus?: boolean
}) {
  const listId = useId()
  const selected = delegates.find((d) => d.id === value) ?? null
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState<string | null>(null) // null = not editing
  const [active, setActive] = useState(0)

  const options = useMemo(() => {
    const ex = new Set(excludeIds ?? [])
    const q = normalize(query ?? '')
    const pool = delegates.filter((d) => !ex.has(d.id))
    if (!q) return pool
    const starts: Delegate[] = []
    const contains: Delegate[] = []
    for (const d of pool) {
      const n = normalize(d.name)
      if (n.startsWith(q)) starts.push(d)
      else if (n.includes(q)) contains.push(d)
    }
    return [...starts, ...contains]
  }, [delegates, excludeIds, query])

  const text = query ?? selected?.name ?? ''

  const close = () => {
    setOpen(false)
    setQuery(null)
  }
  const select = (d: Delegate) => {
    onChange(d.id)
    close()
  }
  const activeIdx = Math.min(active, Math.max(0, options.length - 1))

  return (
    <div className="combo">
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[activeIdx] ? `${listId}-${options[activeIdx].id}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={text}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive(Math.min(activeIdx + 1, options.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(Math.max(activeIdx - 1, 0))
          } else if (e.key === 'Enter') {
            if (open && options[activeIdx]) {
              e.preventDefault()
              select(options[activeIdx])
            }
          } else if (e.key === 'Escape') {
            if (open) e.stopPropagation()
            close()
          }
        }}
      />
      {selected && (
        <button
          type="button"
          className="combo-clear"
          aria-label={`Clear ${label}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange(null)
            setQuery(null)
          }}
        >
          ✕
        </button>
      )}
      {open && (
        <ul className="combo-list" role="listbox" id={listId} aria-label={`${label} options`}>
          {options.length === 0 ? (
            <li className="combo-empty" role="presentation">
              No matches
            </li>
          ) : (
            options.map((d, i) => (
              <li
                key={d.id}
                id={`${listId}-${d.id}`}
                role="option"
                aria-selected={d.id === value}
                className={`combo-option${i === activeIdx ? ' is-active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  select(d)
                }}
                onMouseEnter={() => setActive(i)}
              >
                <Flag code={d.flag} size={16} />
                <span>{d.name}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
