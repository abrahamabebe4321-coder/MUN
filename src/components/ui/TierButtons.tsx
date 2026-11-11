import type { Tier } from '../../domain/types'
import { TIER_LABELS } from '../../domain/scoring'

const TIERS: Tier[] = [1, 2, 3]

export function TierButtons({
  onPick,
  points,
  disabled,
  compact,
  selected,
  labels = TIER_LABELS,
}: {
  onPick: (tier: Tier) => void
  points?: (tier: Tier) => number
  disabled?: boolean
  compact?: boolean
  selected?: Tier | null
  labels?: Record<Tier, string>
}) {
  return (
    <div className={`tier-buttons${compact ? ' tier-buttons-compact' : ''}`}>
      {TIERS.map((tier) => {
        const label = labels[tier]
        const pts = points?.(tier)
        const aria = pts === undefined ? label : `${label} (${pts} points)`
        const ptsText = pts === undefined ? null : pts > 0 ? `+${pts}` : `${pts}`
        return (
          <button
            key={tier}
            type="button"
            className={`tier-btn tier-${tier}${selected === tier ? ' is-selected' : ''}`}
            aria-pressed={selected === undefined ? undefined : selected === tier}
            disabled={disabled}
            aria-label={aria}
            title={label}
            onClick={() => onPick(tier)}
          >
            <span className="tier-pips" aria-hidden="true">
              {TIERS.map((n) => (
                <span key={n} className={`tier-pip${n <= tier ? ' is-filled' : ''}`} />
              ))}
            </span>
            {compact ? <span className="sr-only">{tier}</span> : <span className="tier-label">{label}</span>}
            {!compact && ptsText !== null && <span className="tier-points">{ptsText}</span>}
          </button>
        )
      })}
    </div>
  )
}
