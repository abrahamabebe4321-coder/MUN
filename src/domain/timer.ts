export interface TimerState {
  durationMs: number
  elapsedMs: number
  startedAt: number | null
}

export function createTimer(seconds: number): TimerState {
  return { durationMs: Math.max(0, seconds) * 1000, elapsedMs: 0, startedAt: null }
}

export function isRunning(t: TimerState): boolean {
  return t.startedAt !== null
}

export function elapsedMs(t: TimerState, now: number): number {
  const run = t.startedAt === null ? 0 : now - t.startedAt
  return Math.max(0, t.elapsedMs + run)
}

export function remainingMs(t: TimerState, now: number): number {
  return Math.max(0, t.durationMs - elapsedMs(t, now))
}

export function overtimeMs(t: TimerState, now: number): number {
  return Math.max(0, elapsedMs(t, now) - t.durationMs)
}

export function isExpired(t: TimerState, now: number): boolean {
  return t.durationMs > 0 && elapsedMs(t, now) >= t.durationMs
}

export function start(t: TimerState, now: number): TimerState {
  if (isRunning(t)) return t
  return { ...t, startedAt: now }
}

export function pause(t: TimerState, now: number): TimerState {
  if (!isRunning(t)) return t
  return { ...t, elapsedMs: elapsedMs(t, now), startedAt: null }
}

export function toggle(t: TimerState, now: number): TimerState {
  return isRunning(t) ? pause(t, now) : start(t, now)
}

export function reset(t: TimerState): TimerState {
  return { ...t, elapsedMs: 0, startedAt: null }
}

export function setDuration(t: TimerState, seconds: number): TimerState {
  return { ...t, durationMs: Math.max(0, seconds) * 1000 }
}

export function addTime(t: TimerState, seconds: number): TimerState {
  return { ...t, durationMs: Math.max(0, t.durationMs + seconds * 1000) }
}

export function progress(t: TimerState, now: number): number {
  if (t.durationMs <= 0) return 0
  return Math.min(1, Math.max(0, elapsedMs(t, now) / t.durationMs))
}

export function formatTime(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function parseTime(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (s === '') return null
  let m = /^(\d+):(\d{1,2})$/.exec(s)
  if (m) {
    const sec = Number(m[2])
    if (sec > 59) return null
    return Number(m[1]) * 60 + sec
  }
  m = /^(\d+)s?$/.exec(s)
  if (m) return Number(m[1])
  m = /^(?:(\d+)m)?(?:(\d+)s)?$/.exec(s)
  if (m && (m[1] !== undefined || m[2] !== undefined)) {
    return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)
  }
  return null
}
