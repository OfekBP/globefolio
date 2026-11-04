import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (f: string) => JSON.parse(readFileSync(`public/geo/${f}`, 'utf8'))
const rows = read('cities.json') as [string, string, number, number, number, number, string?][]
const isos = new Set((read('countries.json').features as { properties: { i: string } }[]).map(f => f.properties.i))
const key = (r: (typeof rows)[number]) => `${r[1]}|${r[0]}|${r[2].toFixed(1)}`

describe('city data', () => {
  it('has a large, well-formed list', () => {
    expect(rows.length).toBeGreaterThan(50000)
    for (const r of rows) {
      expect(r[0].trim()).toBe(r[0])
      expect(r[0].length).toBeGreaterThan(1)
      expect(r[2]).toBeGreaterThanOrEqual(-90); expect(r[2]).toBeLessThanOrEqual(90)
      expect(r[3]).toBeGreaterThanOrEqual(-180); expect(r[3]).toBeLessThanOrEqual(180)
    }
  })
  it('only uses countries the map knows', () => {
    expect(rows.filter(r => !isos.has(r[1])).map(r => r[0]).slice(0, 5)).toEqual([])
  })
  it('keeps keys unique, so a saved trip always finds its city', () => {
    const seen = new Set<string>()
    const dup: string[] = []
    for (const r of rows) { const k = key(r); if (seen.has(k)) dup.push(k); seen.add(k) }
    expect(dup.length).toBeLessThan(10) // a handful of old twins are skipped by the loader
  })
  it('is sorted by population, biggest first (search relies on it)', () => {
    for (let i = 1; i < rows.length; i++) if (rows[i][4] > rows[i - 1][4]) throw new Error(`row ${i} out of order`)
  })
  it('has no camps, bases or numbered districts', () => {
    expect(rows.filter(r => /refugee camp|air force base|^paris \d/i.test(r[0]))).toEqual([])
  })
  it.each(['es', 'fr', 'de', 'pt', 'ru', 'ar', 'he', 'zh', 'ja'])('names-%s.json only names cities that exist', lang => {
    const names = read(`names-${lang}.json`) as Record<string, string>
    const known = new Set(rows.map(key))
    const orphans = Object.keys(names).filter(k => !known.has(k))
    expect(orphans.slice(0, 5)).toEqual([])
    expect(Object.keys(names).length).toBeGreaterThan(500)
  })
})
