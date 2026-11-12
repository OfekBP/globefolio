import { describe, expect, it } from 'vitest'
import { ACCENTS, accentOk, contrast, derive } from '../src/accent'

describe('accent colors', () => {
  it('accepts only six-digit lowercase hex', () => {
    expect(accentOk('#0e7490')).toBe(true)
    for (const bad of ['red', '#FFF', '#0E7490', '#12345', null, 7]) expect(accentOk(bad)).toBe(false)
  })
  it('every choice gives readable buttons and links in both themes', () => {
    for (const hex of ACCENTS) {
      const light = derive(hex, 'light'), dark = derive(hex, 'dark')
      expect(contrast(light['--btn'], light['--btn-text'])).toBeGreaterThanOrEqual(4.5)
      expect(contrast(light['--accent-text'], '#fff8ec')).toBeGreaterThanOrEqual(4.5)
      expect(contrast(dark['--btn'], dark['--btn-text'])).toBeGreaterThanOrEqual(4.5)
      expect(contrast(dark['--btn'], '#101b33')).toBeGreaterThanOrEqual(4.5)
    }
  })
})
