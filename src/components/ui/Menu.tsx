import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Button } from './Button'

export interface MenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  hint?: string
}

export function Menu({
  label,
  items,
  align = 'left',
  variant = 'secondary',
  size = 'md',
  children,
}: {
  label: string
  items: MenuItem[]
  align?: 'left' | 'right'
  variant?: 'secondary' | 'ghost' | 'primary'
  size?: 'sm' | 'md'
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const id = useId()

  const enabled = () => items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0)

  useEffect(() => {
    if (!open) return
    const first = enabled()[0]
    if (first !== undefined) itemRefs.current[first]?.focus()
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      e.preventDefault()
      close(true)
      return
    }
    const idx = enabled()
    if (idx.length === 0) return
    const current = idx.indexOf(itemRefs.current.findIndex((el) => el === document.activeElement))
    let target: number | null = null
    if (e.key === 'ArrowDown') target = idx[(current + 1) % idx.length]
    else if (e.key === 'ArrowUp') target = idx[(current <= 0 ? idx.length : current) - 1]
    else if (e.key === 'Home') target = idx[0]
    else if (e.key === 'End') target = idx[idx.length - 1]
    else if (e.key === 'Tab') setOpen(false)
    if (target !== null) {
      e.preventDefault()
      itemRefs.current[target]?.focus()
    }
  }

  return (
    <div ref={rootRef} className={`menu menu-${align}`} onKeyDown={open ? onKeyDown : undefined}>
      <Button
        ref={buttonRef}
        variant={variant}
        size={size}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        {children ?? label}
      </Button>
      {open ? (
        <div id={id} className="menu-popover" role="menu" aria-label={label}>
          {items.map((item, i) => (
            <button
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el
              }}
              type="button"
              role="menuitem"
              className={`menu-item${item.danger ? ' is-danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                item.onSelect()
                close(true)
              }}
            >
              <span>{item.label}</span>
              {item.hint ? <span className="menu-hint">{item.hint}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
