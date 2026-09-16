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

  /**
   * A missing key is not an error at runtime: i18next returns the key itself, so the user sees
   * `slh-dsa.create.phrase-title` in the interface and every unit test still passes, because they
   * mock `t` to the identity. Only reading the sources and the locale together catches it.
   */
  it('has a string for every key the new components ask for', () => {
    // Vite's own glob rather than node:fs, which is shimmed out in this environment.
    const sources = import.meta.glob('../../components/**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>

    const used = new Set<string>()
    Object.values(sources).forEach(text => {
      Array.from(text.matchAll(/t\(\s*'((?:slh-dsa|fiber)\.[a-z0-9.@_-]+)'/gi)).forEach(match => used.add(match[1]))
    })

    const resolve = (key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en.translation)

    expect(used.size).toBeGreaterThan(0)
    const missing = [...used].filter(key => typeof resolve(key) !== 'string')
    expect(missing).toEqual([])
  })
})
