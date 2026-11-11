import { beforeEach, describe, expect, it } from 'vitest'
import { THEME_KEY, applyStoredTheme, getTheme, setTheme } from './theme'

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to system', () => {
    expect(getTheme()).toBe('system')
  })

  it('invalid stored value falls back to system', () => {
    localStorage.setItem(THEME_KEY, 'purple')
    expect(getTheme()).toBe('system')
  })

  it('setTheme stores and applies', () => {
    setTheme('dark')
    expect(getTheme()).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    setTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('system removes the attribute', () => {
    setTheme('dark')
    setTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(getTheme()).toBe('system')
  })

  it('applyStoredTheme applies the stored choice', () => {
    localStorage.setItem(THEME_KEY, 'light')
    applyStoredTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    localStorage.setItem(THEME_KEY, 'junk')
    applyStoredTheme()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})
