import { describe, expect, it } from 'vitest'
import en from '../src/locales/en'
import { LOCALES, type Dict, type Entry } from '../src/i18n'

const files = import.meta.glob('../src/locales/*.ts', { eager: true }) as Record<string, { default: Dict }>
const byCode = Object.fromEntries(Object.entries(files).map(([p, m]) => [p.match(/\/(\w+)\.ts$/)![1], m.default]))

const texts = (e: Entry) => (typeof e === 'string' ? [e] : Object.values(e) as string[])
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1])
const needed = (e: Entry) => [...new Set(texts(e).flatMap(holes))].filter(h => h !== 'n').sort()

describe('translations', () => {
  it('every language in the picker has a file', () => {
    for (const l of LOCALES) expect(byCode[l.code], l.code).toBeTruthy()
  })

  for (const l of LOCALES.filter(x => x.code !== 'en')) {
    const d = byCode[l.code]
    it(`${l.code} has exactly the English keys`, () => {
      expect(Object.keys(d).filter(k => !(k in en)), 'extra keys').toEqual([])
      expect(Object.keys(en).filter(k => !(k in d)), 'missing keys').toEqual([])
    })
    it(`${l.code} keeps every {placeholder}`, () => {
      const bad: string[] = []
      for (const k of Object.keys(en)) {
        const want = needed(en[k])
        // a plural entry may spell the number out ("one city"), so {n} is not required, but nothing else may go missing or be invented
        const got = needed(d[k])
        if (want.join() !== got.join()) bad.push(`${k}: wanted {${want}} got {${got}}`)
      }
      expect(bad).toEqual([])
    })
    it(`${l.code} plural entries cover the language's categories`, () => {
      const cats = new Intl.PluralRules(l.code).resolvedOptions().pluralCategories
      const bad: string[] = []
      for (const k of Object.keys(en)) {
        if (typeof en[k] === 'string' || typeof d[k] === 'string') continue
        const e = d[k] as Record<string, string>
        for (const c of cats) if (!(c in e) && !('other' in e)) bad.push(`${k}.${c}`)
        if (!('other' in e)) bad.push(`${k}.other`)
      }
      expect(bad).toEqual([])
    })
    it(`${l.code} does not leave English sentences behind`, () => {
      if (['en'].includes(l.code)) return
      const same = Object.keys(en).filter(k => typeof en[k] === 'string' && d[k] === en[k] && /[a-z]{4,}.* [a-z]{3,}/i.test(en[k] as string) && !/^(app\.title|pp\.brand|acct\.(rowIn|emailPh))/.test(k))
      expect(same).toEqual([])
    })
  }
})
