export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_KEY = 'mun-chair:theme'

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function applyTheme(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  if (choice === 'system') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', choice)
}

export function setTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_KEY, choice)
  } catch {
    // storage unavailable; still apply for this session
  }
  applyTheme(choice)
}

export function applyStoredTheme(): void {
  applyTheme(getTheme())
}

try {
  applyStoredTheme()
} catch {
  // never throw at import time
}
