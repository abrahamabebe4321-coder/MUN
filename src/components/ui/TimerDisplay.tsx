import type { TimerState } from '../../domain/timer'
import { formatTime, isExpired, isRunning, progress, remainingMs } from '../../domain/timer'

export function TimerDisplay({
  timer,
  now,
  label,
  size = 'md',
}: {
  timer: TimerState
  now: number
  label?: string
  size?: 'sm' | 'md' | 'xl'
}) {
  const remaining = remainingMs(timer, now)
  const expired = isExpired(timer, now)
  const warning = !expired && timer.durationMs > 0 && remaining <= 10_000
  const cls = [
    'timer',
    `timer-${size}`,
    expired ? 'is-expired' : warning ? 'is-warning' : '',
    isRunning(timer) ? 'is-running' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls}>
      {label && <div className="timer-label">{label}</div>}
      <div className="timer-time tabular" role="timer">
        {formatTime(remaining)}
      </div>
      <div className="timer-bar" aria-hidden="true">
        <div className="timer-bar-fill" style={{ width: `${(1 - progress(timer, now)) * 100}%` }} />
      </div>
    </div>
  )
}
