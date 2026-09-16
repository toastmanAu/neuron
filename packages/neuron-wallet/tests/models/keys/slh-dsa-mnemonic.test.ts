import { bytes } from '@ckb-lumos/lumos/codec'
import {
  KDF_PATH_PREFIX,
  MASTER_SEED_PARTS,
  deriveChildKeyPair,
  deriveChildSeed,
  generateMasterSeed,
  masterSeedLength,
  masterSeedToMnemonic,
  mnemonicToMasterSeed,
  wordsPerPhrase,
} from '../../../src/models/keys/slh-dsa-mnemonic'
import { SlhDsaParameterSetName, deriveLockArgs } from '../../../src/services/lock-providers/slh-dsa/parameter-sets'
import { QUANTUM_PURSE_KDF_PATH_PREFIX, QUANTUM_PURSE_VECTORS } from '../../fixtures/quantum-purse-vectors'

describe('SLH-DSA mnemonic', () => {
  it('uses the same KDF path prefix Quantum Purse does', () => {
    expect(KDF_PATH_PREFIX).toEqual(QUANTUM_PURSE_KDF_PATH_PREFIX)
  })

  it('splits the master seed into three parts', () => {
    expect(MASTER_SEED_PARTS).toBe(3)
  })

  describe.each(QUANTUM_PURSE_VECTORS)('$parameterSet', vector => {
    const parameterSet = vector.parameterSet as SlhDsaParameterSetName
    const masterSeed = bytes.bytify(vector.masterSeed)

    it('agrees on how long a master seed is', () => {
      expect(masterSeedLength(parameterSet)).toBe(vector.n * 3)
      expect(masterSeed.byteLength).toBe(vector.n * 3)
    })

    it('agrees on how many words each of the three phrases has', () => {
      expect(wordsPerPhrase(parameterSet)).toBe(vector.wordsPerPhrase)
      expect(wordsPerPhrase(parameterSet) * MASTER_SEED_PARTS).toBe(vector.totalWords)
    })

    it('renders the master seed as the same mnemonic', () => {
      expect(masterSeedToMnemonic(masterSeed)).toEqual(vector.mnemonic)
    })

    it('reads the mnemonic back to the same master seed', () => {
      expect(bytes.hexify(mnemonicToMasterSeed(vector.mnemonic))).toEqual(vector.masterSeed)
    })

    describe.each(vector.accounts)('account $index', account => {
      it('derives the same child seed', () => {
        const childSeed = deriveChildSeed(masterSeed, account.index)
        // Concatenated in the order FIPS 205 key generation consumes them.
        expect(bytes.hexify(childSeed)).toEqual(
          `${account.skSeedKd}${account.skPrfKd.slice(2)}${account.pkSeedKd.slice(2)}`
        )
      })

      it('derives the same key pair', () => {
        const keyPair = deriveChildKeyPair(masterSeed, parameterSet, account.index)
        expect(keyPair.publicKey).toEqual(account.publicKey)
        expect(keyPair.secretKey).toEqual(account.secretKey)
      })

      it('lands on the reference lock args, which are NOT Quantum Purse address', () => {
        // The divergence is pinned here rather than discovered by a user with funds: Quantum Purse
        // hashes `80 00 01 01` into the args where the deployed lock's own tooling — and this
        // wallet, and the spends proven on chain — hash `80 01 01 01`.
        const { publicKey } = deriveChildKeyPair(masterSeed, parameterSet, account.index)
        expect(deriveLockArgs(parameterSet, publicKey)).toEqual(account.referenceLockArgs)
        expect(deriveLockArgs(parameterSet, publicKey)).not.toEqual(account.quantumPurseLockArgs)
      })
    })
  })

  describe('validation', () => {
    const parameterSet: SlhDsaParameterSetName = 'SLH-DSA-SHA2-128s'
    const vector = QUANTUM_PURSE_VECTORS.find(v => v.parameterSet === parameterSet)!

    it('rejects a phrase whose word count is not three whole BIP39 phrases', () => {
      const words = vector.mnemonic.split(' ')
      expect(() => mnemonicToMasterSeed(words.slice(0, 35).join(' '))).toThrow(/36, 54 or 72 words.*got 35/)
    })

    it('rejects a phrase where one of the three chunks fails its BIP39 checksum', () => {
      const words = vector.mnemonic.split(' ')
      // Swap two words inside the last chunk: still 36 valid words, wrong checksum.
      const swapped = [...words]
      ;[swapped[24], swapped[25]] = [swapped[25], swapped[24]]
      expect(() => mnemonicToMasterSeed(swapped.join(' '))).toThrow(/phrase 3/)
    })

    it('rejects a word that is not in the BIP39 English list', () => {
      const words = vector.mnemonic.split(' ')
      words[0] = 'quantum'
      expect(() => mnemonicToMasterSeed(words.join(' '))).toThrow(/phrase 1/)
    })

    it('rejects a master seed that is not three equal parts of a known size', () => {
      expect(() => masterSeedToMnemonic(new Uint8Array(47))).toThrow(/47/)
    })

    it('refuses a master seed that is not three equal parts when deriving a child', () => {
      expect(() => deriveChildSeed(new Uint8Array(47), 0)).toThrow(/47/)
    })

    it('refuses a negative or non-integer account index', () => {
      const masterSeed = bytes.bytify(vector.masterSeed)
      expect(() => deriveChildSeed(masterSeed, -1)).toThrow(/index/)
      expect(() => deriveChildSeed(masterSeed, 1.5)).toThrow(/index/)
    })

    it('refuses a mnemonic whose length does not match the requested parameter set', () => {
      expect(() => deriveChildKeyPair(bytes.bytify(vector.masterSeed), 'SLH-DSA-SHA2-256s', 0)).toThrow(
        /SLH-DSA-SHA2-256s/
      )
    })
  })

  describe('generateMasterSeed', () => {
    it.each(['SLH-DSA-SHA2-128s', 'SLH-DSA-SHA2-192s', 'SLH-DSA-SHA2-256s'] as SlhDsaParameterSetName[])(
      'produces a seed of the right length for %s',
      name => {
        expect(generateMasterSeed(name).byteLength).toBe(masterSeedLength(name))
      }
    )

    it('does not produce the same seed twice', () => {
      const first = bytes.hexify(generateMasterSeed('SLH-DSA-SHA2-128s'))
      const second = bytes.hexify(generateMasterSeed('SLH-DSA-SHA2-128s'))
      expect(first).not.toEqual(second)
    })

    it('round trips through a mnemonic', () => {
      const seed = generateMasterSeed('SLH-DSA-SHA2-192s')
      expect(bytes.hexify(mnemonicToMasterSeed(masterSeedToMnemonic(seed)))).toEqual(bytes.hexify(seed))
    })
  })
})
