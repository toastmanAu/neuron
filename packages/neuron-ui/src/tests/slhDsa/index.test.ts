import { describe, it, expect } from 'vitest'
import {
  RECOMMENDED_PARAMETER_SET,
  describeParameterSet,
  groupParameterSets,
  isAdvancedParameterSet,
  formatWitnessCost,
  mnemonicWordCount,
} from '../../utils/slhDsa'

const sets: Controller.SlhDsaParameterSetSummary[] = [
  { name: 'SLH-DSA-SHA2-128f', publicKeyLength: 32, signatureLength: 17088, witnessSize: 17153, slowSigning: false },
  { name: 'SLH-DSA-SHA2-128s', publicKeyLength: 32, signatureLength: 7856, witnessSize: 7921, slowSigning: false },
  { name: 'SLH-DSA-SHA2-256s', publicKeyLength: 64, signatureLength: 29792, witnessSize: 29889, slowSigning: false },
  { name: 'SLH-DSA-SHA2-256f', publicKeyLength: 64, signatureLength: 49856, witnessSize: 49953, slowSigning: false },
  { name: 'SLH-DSA-SHAKE-256s', publicKeyLength: 64, signatureLength: 29792, witnessSize: 29889, slowSigning: true },
]

describe('SLH-DSA parameter set presentation', () => {
  it('recommends a set that actually exists', () => {
    expect(sets.some(s => s.name === RECOMMENDED_PARAMETER_SET)).toBe(true)
  })

  it('recommends a SHA2 set, since SHAKE is several times slower to sign', () => {
    expect(RECOMMENDED_PARAMETER_SET).toContain('SHA2')
  })

  it('puts the recommended set first so the default needs no searching', () => {
    const { recommended, advanced } = groupParameterSets(sets)

    expect(recommended.name).toBe(RECOMMENDED_PARAMETER_SET)
    expect(advanced.some(s => s.name === RECOMMENDED_PARAMETER_SET)).toBe(false)
  })

  it('keeps every set reachable, none silently dropped', () => {
    const { recommended, advanced } = groupParameterSets(sets)

    expect([recommended, ...advanced]).toHaveLength(sets.length)
  })

  it('treats everything except the recommendation as advanced', () => {
    expect(isAdvancedParameterSet('SLH-DSA-SHA2-128f')).toBe(true)
    expect(isAdvancedParameterSet(RECOMMENDED_PARAMETER_SET)).toBe(false)
  })

  describe('describeParameterSet', () => {
    it('describes the trade-off in terms a user can act on', () => {
      const d = describeParameterSet(sets.find(s => s.name === 'SLH-DSA-SHA2-128s')!)

      expect(d.securityBits).toBe(128)
      expect(d.fastSigning).toBe(false)
      expect(d.signatureKb).toBeCloseTo(7.7, 1)
    })

    it('reads the f/s variant off the name rather than guessing from size', () => {
      expect(describeParameterSet(sets.find(s => s.name === 'SLH-DSA-SHA2-128f')!).fastSigning).toBe(true)
      expect(describeParameterSet(sets.find(s => s.name === 'SLH-DSA-SHA2-256s')!).fastSigning).toBe(false)
    })

    it('reads the security level off the name', () => {
      expect(describeParameterSet(sets.find(s => s.name === 'SLH-DSA-SHA2-256f')!).securityBits).toBe(256)
    })

    it('warns about slow signing only where the backend says so', () => {
      expect(describeParameterSet(sets.find(s => s.name === 'SLH-DSA-SHAKE-256s')!).warnSlow).toBe(true)
      expect(describeParameterSet(sets.find(s => s.name === 'SLH-DSA-SHA2-256s')!).warnSlow).toBe(false)
    })
  })

  describe('formatWitnessCost', () => {
    it('states the witness size in KB, the number that drives the fee', () => {
      expect(formatWitnessCost(7921)).toBe('7.7 KB')
      expect(formatWitnessCost(49953)).toBe('48.8 KB')
    })

    it('compares against a secp witness so the difference is legible', () => {
      // A secp witness is 93 bytes; an SLH-DSA one is thousands. Users should see the scale.
      expect(formatWitnessCost(7921, { comparedToSecp: true })).toContain('85')
    })
  })
})

describe('mnemonicWordCount', () => {
  it('is 36 words for a 128-bit set', () => {
    // Three BIP39 phrases of 12: the master seed is 3 x 16 bytes.
    expect(mnemonicWordCount('SLH-DSA-SHA2-128s')).toBe(36)
    expect(mnemonicWordCount('SLH-DSA-SHAKE-128f')).toBe(36)
  })

  it('is 54 words for a 192-bit set', () => {
    expect(mnemonicWordCount('SLH-DSA-SHA2-192f')).toBe(54)
  })

  it('is 72 words for a 256-bit set', () => {
    expect(mnemonicWordCount('SLH-DSA-SHA2-256s')).toBe(72)
    expect(mnemonicWordCount('SLH-DSA-SHAKE-256s')).toBe(72)
  })

  it('returns undefined rather than guessing at an unknown set', () => {
    // A wrong guess renders the wrong number of slots, and the phrase typed into it restores a
    // different wallet. Nothing is better than something plausible here.
    expect(mnemonicWordCount('SLH-DSA-NOPE')).toBeUndefined()
  })
})
