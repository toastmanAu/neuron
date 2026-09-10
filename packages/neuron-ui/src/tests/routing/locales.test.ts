import { describe, it, expect } from 'vitest'
import en from '../../locales/en.json'
import zh from '../../locales/zh.json'
import fr from '../../locales/fr.json'
import es from '../../locales/es.json'
import ar from '../../locales/ar.json'

/**
 * i18n is configured as `resources: { en, ... }`, so every top-level key of a locale file becomes
 * an i18next *namespace*, and lookups default to `translation`. A block added at the top level is
 * therefore unreachable through `t('block.key')` — it resolves to nothing and the raw key is what
 * the user sees. The unit tests cannot catch this because they mock i18n.
 */
describe('locale files declare no namespace but translation', () => {
  const locales = { en, zh, fr, es, ar } as Record<string, Record<string, unknown>>

  Object.entries(locales).forEach(([name, locale]) => {
    it(`${name}.json keeps every string under "translation"`, () => {
      expect(Object.keys(locale)).toEqual(['translation'])
    })
  })

  it('resolves the quantum-resistant wallet strings from the default namespace', () => {
    const translation = en.translation as Record<string, any>

    expect(translation['slh-dsa']?.create?.title).toBeTruthy()
  })
})
