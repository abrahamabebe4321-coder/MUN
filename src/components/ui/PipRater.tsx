import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Tier } from '../../domain/types'
import { TIER_LABELS } from '../../domain/scoring'

const TIERS: Tier[] = [1, 2, 3]

export function PipRater({
  label,
  value,
  onPick,
  onClear,
  points,
  size = 'md',
  disabled,
  showLabel,
}: {
  label: string
  value: Tier | null
  onPick: (tier: Tier) => void
  onClear?: () => void
  points?: (tier: Tier) => number
  size?: 'sm' | 'md'
  disabled?: boolean
  showLabel?: boolean
}) {
  const [preview, setPreview] = useState<Tier | null>(null)
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const tabTier: Tier = value ?? 1

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, tier: Tier) => {
    let next: number | null = null
    if (e.key === 'ArrowRight') next = Math.min(3, tier + 1)
    else if (e.key === 'ArrowLeft') next = Math.max(1, tier - 1)
    if (next !== null) {
      e.preventDefault()
      refs.current[next - 1]?.focus()
    }
  }

  const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`)

  return (
    <>
      <div className={`pips pips-${size}`} role="radiogroup" aria-label={label}>
        {TIERS.map((tier) => {
          const name = TIER_LABELS[tier] + (points ? ` (${points(tier)} points)` : '')
          const filled = value !== null && tier <= value
          const previewing = preview !== null && tier <= preview
          return (
            <button
              key={tier}
              ref={(el) => {
                refs.current[tier - 1] = el
              }}
              type="button"
              role="radio"
              className={`pip${filled ? ' is-filled' : ''}${previewing ? ' is-preview' : ''}`}
              aria-checked={value === tier}
              aria-label={name}
              title={name}
              disabled={disabled}
              tabIndex={tier === tabTier ? 0 : -1}
              onClick={() => {
                if (value === tier && onClear) onClear()
                else onPick(tier)
              }}
              onMouseEnter={() => setPreview(tier)}
              onMouseLeave={() => setPreview(null)}
              onFocus={() => setPreview(tier)}
              onBlur={() => setPreview(null)}
              onKeyDown={(e) => onKeyDown(e, tier)}
            />
          )
        })}
      </div>
      {showLabel ? (
        <span className={`pips-label${value === null ? ' muted' : ''}`}>
          {value === null
            ? 'Not rated'
            : TIER_LABELS[value] + (points ? ` ${fmt(points(value))}` : '')}
        </span>
      ) : null}
    </>
  )
}
