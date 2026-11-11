// @types/node is not installed, so the node imports are untyped here.
// @ts-expect-error TS2591
import { existsSync } from 'node:fs'
// @ts-expect-error TS2591
import path from 'node:path'
import { COUNTRIES, getCountry, searchCountries } from './countries'

declare const process: { cwd(): string }

describe('COUNTRIES', () => {
  it('has 195 entries', () => {
    expect(COUNTRIES).toHaveLength(195)
  })
  it('has unique lowercase 2-letter codes', () => {
    const codes = COUNTRIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of codes) expect(c).toMatch(/^[a-z]{2}$/)
  })
  it('has unique names', () => {
    const names = COUNTRIES.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })
  it('is sorted by name', () => {
    const names = COUNTRIES.map((c) => c.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
  it('has a flag file for every code', () => {
    for (const c of COUNTRIES) {
      const p = path.resolve(process.cwd(), 'node_modules/flag-icons/flags/4x3', `${c.code}.svg`)
      expect(existsSync(p), c.code).toBe(true)
    }
  })
  it('getCountry works', () => {
    expect(getCountry('et')?.name).toBe('Ethiopia')
    expect(getCountry('zz')).toBeUndefined()
  })
})

describe('searchCountries', () => {
  it('returns all for empty query', () => {
    expect(searchCountries('')).toBe(COUNTRIES)
    expect(searchCountries('  ')).toBe(COUNTRIES)
  })
  it('puts prefix matches first', () => {
    const names = searchCountries('uni').map((c) => c.name)
    expect(names.slice(0, 3)).toEqual(['United Arab Emirates', 'United Kingdom', 'United States'])
    const ni = searchCountries('ni').map((c) => c.name)
    expect(ni.slice(0, 3)).toEqual(['Nicaragua', 'Niger', 'Nigeria'])
    expect(ni).toContain('Tunisia')
  })
  it('matches aliases and diacritics', () => {
    expect(searchCountries('usa')[0].name).toBe('United States')
    expect(searchCountries('DPRK')[0].name).toBe('North Korea')
    expect(searchCountries('turkiye')[0].name).toBe('Türkiye')
    expect(searchCountries('cote')[0].name).toBe("Côte d'Ivoire")
  })
  it('returns empty for no match', () => {
    expect(searchCountries('zzz')).toEqual([])
  })
})
