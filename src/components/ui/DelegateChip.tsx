import type { Delegate } from '../../domain/types'
import { Flag } from '../Flag'

export function DelegateChip({
  delegate,
  size,
  muted,
}: {
  delegate: Pick<Delegate, 'name' | 'flag'>
  size?: number
  muted?: boolean
}) {
  return (
    <span className={`chip${muted ? ' chip-muted' : ''}`}>
      <Flag code={delegate.flag} size={size} />
      <span>{delegate.name}</span>
    </span>
  )
}
