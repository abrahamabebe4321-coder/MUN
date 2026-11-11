import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useNow } from './useNow'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1000)
})
afterEach(() => vi.useRealTimers())

it('advances while active', () => {
  const { result } = renderHook(() => useNow(true, 100))
  expect(result.current).toBe(1000)
  act(() => { vi.advanceTimersByTime(300) })
  expect(result.current).toBe(1300)
})

it('does not advance while inactive', () => {
  const { result } = renderHook(() => useNow(false, 100))
  act(() => { vi.advanceTimersByTime(500) })
  expect(result.current).toBe(1000)
})

it('stops when active flips off and updates immediately on flip', () => {
  const { result, rerender } = renderHook(({ a }) => useNow(a, 100), { initialProps: { a: true } })
  act(() => { vi.advanceTimersByTime(200) })
  expect(result.current).toBe(1200)
  rerender({ a: false })
  act(() => { vi.advanceTimersByTime(500) })
  expect(result.current).toBe(1200)
  vi.setSystemTime(5000)
  rerender({ a: true })
  expect(result.current).toBe(5000)
})
