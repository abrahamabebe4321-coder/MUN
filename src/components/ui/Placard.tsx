import type { Delegate } from '../../domain/types'
import { Flag } from '../Flag'

export function Placard({
  delegate,
  size = 'md',
}: {
  delegate: Pick<Delegate, 'name' | 'flag'>
  size?: 'md' | 'lg'
}) {
  return (
    <div className={`placard placard-${size}`}>
      <Flag code={delegate.flag} size={size === 'lg' ? 56 : 32} />
      <span className="placard-name">{delegate.name}</span>
    </div>
  )
}
