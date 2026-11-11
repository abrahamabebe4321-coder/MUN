import {
  addTime, createTimer, elapsedMs, formatTime, isExpired, isRunning, overtimeMs,
  parseTime, pause, progress, remainingMs, reset, setDuration, start, toggle,
} from './timer'

describe('timer', () => {
  it('createTimer', () => {
    expect(createTimer(90)).toEqual({ durationMs: 90000, elapsedMs: 0, startedAt: null })
    expect(createTimer(-5).durationMs).toBe(0)
  })

  it('start/pause/resume accumulate', () => {
    const t0 = createTimer(60)
    expect(isRunning(t0)).toBe(false)
    const t1 = start(t0, 1000)
    expect(isRunning(t1)).toBe(true)
    expect(elapsedMs(t1, 4000)).toBe(3000)
    const t2 = pause(t1, 4000)
    expect(t2).toEqual({ durationMs: 60000, elapsedMs: 3000, startedAt: null })
    expect(elapsedMs(t2, 99999)).toBe(3000)
    const t3 = start(t2, 10000)
    expect(elapsedMs(t3, 12000)).toBe(5000)
    expect(remainingMs(t3, 12000)).toBe(55000)
    expect(t0.startedAt).toBeNull()
  })

  it('no-ops return same reference', () => {
    const t = createTimer(10)
    expect(pause(t, 5)).toBe(t)
    const r = start(t, 5)
    expect(start(r, 9)).toBe(r)
  })

  it('elapsed never negative', () => {
    expect(elapsedMs(start(createTimer(10), 100), 50)).toBe(0)
  })

  it('toggle', () => {
    const t = toggle(createTimer(10), 0)
    expect(isRunning(t)).toBe(true)
    expect(isRunning(toggle(t, 1000))).toBe(false)
  })

  it('reset', () => {
    const t = start(createTimer(10), 0)
    expect(reset(pause(t, 3000))).toEqual({ durationMs: 10000, elapsedMs: 0, startedAt: null })
    expect(reset(t).startedAt).toBeNull()
  })

  it('expiry and overtime', () => {
    const t = start(createTimer(10), 0)
    expect(isExpired(t, 9999)).toBe(false)
    expect(isExpired(t, 10000)).toBe(true)
    expect(remainingMs(t, 15000)).toBe(0)
    expect(overtimeMs(t, 9000)).toBe(0)
    expect(overtimeMs(t, 15000)).toBe(5000)
    expect(isExpired(start(createTimer(0), 0), 100)).toBe(false)
  })

  it('setDuration and addTime clamp', () => {
    const t = createTimer(60)
    expect(setDuration(t, 30).durationMs).toBe(30000)
    expect(setDuration(t, -3).durationMs).toBe(0)
    expect(addTime(t, 15).durationMs).toBe(75000)
    expect(addTime(t, -15).durationMs).toBe(45000)
    expect(addTime(t, -500).durationMs).toBe(0)
    expect(t.durationMs).toBe(60000)
  })

  it('progress', () => {
    const t = start(createTimer(10), 0)
    expect(progress(t, 0)).toBe(0)
    expect(progress(t, 5000)).toBe(0.5)
    expect(progress(t, 50000)).toBe(1)
    expect(progress(createTimer(0), 1000)).toBe(0)
  })

  it('formatTime', () => {
    expect(formatTime(90000)).toBe('1:30')
    expect(formatTime(59001)).toBe('1:00')
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(3600000)).toBe('60:00')
    expect(formatTime(-500)).toBe('0:00')
    expect(formatTime(1)).toBe('0:01')
  })

  it('parseTime valid', () => {
    expect(parseTime('1:30')).toBe(90)
    expect(parseTime('02:05')).toBe(125)
    expect(parseTime(' 90 ')).toBe(90)
    expect(parseTime('2m')).toBe(120)
    expect(parseTime('45s')).toBe(45)
    expect(parseTime('1m30s')).toBe(90)
  })

  it('parseTime invalid', () => {
    for (const s of ['abc', '1:75', '', '  ', '1:', ':30', '-5', '1.5', 'm', '1s2m']) {
      expect(parseTime(s)).toBeNull()
    }
  })
})
