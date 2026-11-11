import type { Tier } from '../../domain/types'
import { TIER_LABELS } from '../../domain/scoring'

const TIERS: Tier[] = [1, 2, 3]

export function TierButtons({
  onPick,
  points,
  disabled,
  compact,
}: {
  onPick: (tier: Tier) => void
  points?: (tier: Tier) => number
  disabled?: boolean
  compact?: boolean
}) {
  return (
    <div className={`tier-buttons${compact ? ' tier-buttons-compact' : ''}`}>
      {TIERS.map((tier) => {
        const label = TIER_LABELS[tier]
        const pts = points?.(tier)
        const aria = pts === undefined ? label : `${label} (${pts} points)`
        const ptsText = pts === undefined ? null : pts > 0 ? `+${pts}` : `${pts}`
        return (
          <button
            key={tier}
            type="button"
            className={`tier-btn tier-${tier}`}
            disabled={disabled}
            aria-label={aria}
            title={label}
            onClick={() => onPick(tier)}
          >
            <span>{compact ? tier : label}</span>
            {ptsText !== null && <span className="tier-points">{ptsText}</span>}
          </button>
        )
      })}
    </div>
  )
}
