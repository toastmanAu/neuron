import crypto from 'crypto'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { hd } from '@ckb-lumos/lumos'
import { bytes } from '@ckb-lumos/lumos/codec'
import { getParameterSet, SlhDsaParameterSetName } from '../../services/lock-providers/slh-dsa/parameter-sets'

/**
 * Mnemonic backup and account derivation for SLH-DSA keys, following Quantum Purse.
 *
 * FIPS 205 has no BIP32, so there is nothing standard to derive with. Quantum Purse settled on a
 * scheme and has users with funds under it; matching it is what makes a Quantum Purse backup
 * recoverable here, so this reproduces it rather than inventing a third convention:
 *
 *   - The master seed is `3n` bytes, consumed by key generation as SK.seed, SK.prf and PK.seed.
 *   - Written down, it is three ordinary BIP39 English phrases concatenated — 36, 54 or 72 words
 *     for n of 16, 24 or 32. Each third is a self-contained, checksummed phrase, so a word copied
 *     down wrong is caught in the phrase that contains it instead of silently yielding a different
 *     wallet. Any BIP39 tool can read the parts.
 *   - An account is an HKDF-SHA256 expansion of each third under the same info string,
 *     `ckb/quantum-purse/sphincs-plus/<index>`, with no salt. The three outputs are the seeds key
 *     generation is then run with.
 *
 * Pinned by `tests/fixtures/quantum-purse-vectors.ts`, which is produced by compiling Quantum
 * Purse's own `spx_keygen!` rather than by restating the description above.
 *
 * ONE DIVERGENCE, DELIBERATE. The key material matches; the address does not. Quantum Purse builds
 * the lock's all-in-one multisig header as `80 00 01 01`, while the reference crate it vendors —
 * and this wallet, and the spends proven on chain — use `80 01 01 01`. Since script args are
 * `blake2b(header || public_key)`, the same key lands on two different addresses. This module
 * therefore reproduces Quantum Purse's *key derivation* and nothing downstream of it; a Quantum
 * Purse phrase imported here recovers the same keys at different addresses, so it does not recover
 * their funds. Do not offer a "Quantum Purse import" until that is resolved upstream.
 */

/** `KDF_PATH_PREFIX` in quantum-purse-key-vault's constants.rs. */
export const KDF_PATH_PREFIX = 'ckb/quantum-purse/sphincs-plus/'

/** SK.seed, SK.prf and PK.seed: the master seed is this many equal parts. */
export const MASTER_SEED_PARTS = 3

/** BIP39 word counts for the three parameter set sizes, keyed by `n`. */
const WORDS_FOR_N: Readonly<Record<number, number>> = { 16: 12, 24: 18, 32: 24 }

const VALID_WORDS_PER_PHRASE: readonly number[] = Object.values(WORDS_FOR_N)

export const masterSeedLength = (parameterSet: SlhDsaParameterSetName): number =>
  getParameterSet(parameterSet).n * MASTER_SEED_PARTS

export const wordsPerPhrase = (parameterSet: SlhDsaParameterSetName): number =>
  WORDS_FOR_N[getParameterSet(parameterSet).n]

/** Total words a written-down backup has for this parameter set: 36, 54 or 72. */
export const wordCount = (parameterSet: SlhDsaParameterSetName): number =>
  wordsPerPhrase(parameterSet) * MASTER_SEED_PARTS

/** `n` for a master seed, or undefined if its length is not three equal parts of a known size. */
const partSizeOf = (masterSeed: Uint8Array): number | undefined => {
  const n = masterSeed.byteLength / MASTER_SEED_PARTS
  return WORDS_FOR_N[n] === undefined ? undefined : n
}

export const generateMasterSeed = (parameterSet: SlhDsaParameterSetName): Uint8Array =>
  Uint8Array.from(crypto.randomBytes(masterSeedLength(parameterSet)))

/**
 * Render a master seed as three BIP39 phrases.
 *
 * The parameter set is not taken as an argument: the seed's own length fixes it, and passing one
 * would let the two disagree.
 */
export const masterSeedToMnemonic = (masterSeed: Uint8Array): string => {
  const partSize = partSizeOf(masterSeed)
  if (partSize === undefined) {
    throw new Error(`A quantum-resistant master seed is 48, 72 or 96 bytes, got ${masterSeed.byteLength}`)
  }

  const words: string[] = []
  for (let part = 0; part < MASTER_SEED_PARTS; part++) {
    const chunk = masterSeed.slice(part * partSize, (part + 1) * partSize)
    words.push(hd.mnemonic.entropyToMnemonic(bytes.hexify(chunk)))
  }
  return words.join(' ')
}

/**
 * Read three BIP39 phrases back into a master seed.
 *
 * Each third is validated on its own so a failure names the phrase to check rather than telling the
 * user that 36 words are wrong somewhere.
 */
export const mnemonicToMasterSeed = (phrase: string): Uint8Array => {
  const words = phrase.trim().split(/\s+/).filter(Boolean)
  const perPhrase = words.length / MASTER_SEED_PARTS
  if (!VALID_WORDS_PER_PHRASE.includes(perPhrase)) {
    throw new Error(
      `A quantum-resistant recovery phrase is 36, 54 or 72 words — three BIP39 phrases — got ${words.length}`
    )
  }

  const parts: Uint8Array[] = []
  for (let part = 0; part < MASTER_SEED_PARTS; part++) {
    const chunk = words.slice(part * perPhrase, (part + 1) * perPhrase).join(' ')
    try {
      parts.push(bytes.bytify(hd.mnemonic.mnemonicToEntropy(chunk)))
    } catch (error) {
      // BIP39 rejects an unknown word and a wrong checksum alike; neither says which word, so the
      // most useful thing to add is which of the three phrases to re-read.
      throw new Error(
        `Words ${part * perPhrase + 1}-${(part + 1) * perPhrase} (phrase ${
          part + 1
        } of ${MASTER_SEED_PARTS}) are not a valid BIP39 phrase`
      )
    }
  }
  return bytes.concat(...parts)
}

/**
 * Expand a master seed into the three seeds key generation for one account consumes.
 *
 * Returned concatenated in the order FIPS 205 reads them, which is also the order the master seed
 * is split in, so the result can be handed straight to `signer.keygen`.
 */
export const deriveChildSeed = (masterSeed: Uint8Array, index: number): Uint8Array => {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Account index must be a non-negative integer, got ${index}`)
  }
  const partSize = partSizeOf(masterSeed)
  if (partSize === undefined) {
    throw new Error(`A quantum-resistant master seed is 48, 72 or 96 bytes, got ${masterSeed.byteLength}`)
  }

  const info = new TextEncoder().encode(`${KDF_PATH_PREFIX}${index}`)
  const parts: Uint8Array[] = []
  for (let part = 0; part < MASTER_SEED_PARTS; part++) {
    const chunk = masterSeed.slice(part * partSize, (part + 1) * partSize)
    // No salt, matching `Hkdf::<Sha256>::new(None, ikm)`: RFC 5869 then extracts under a block of
    // zeros, which is what both implementations end up doing.
    parts.push(hkdf(sha256, chunk, undefined, info, partSize))
  }
  return bytes.concat(...parts)
}

export interface SlhDsaKeyPair {
  publicKey: string
  secretKey: string
}

/**
 * The key pair for one account.
 *
 * `signer.keygen` splits the seed it is given into SK.seed, SK.prf and PK.seed in the same order,
 * so the concatenated HKDF output feeds it directly.
 */
export const deriveChildKeyPair = (
  masterSeed: Uint8Array,
  parameterSet: SlhDsaParameterSetName,
  index: number
): SlhDsaKeyPair => {
  const set = getParameterSet(parameterSet)
  const expected = masterSeedLength(parameterSet)
  if (masterSeed.byteLength !== expected) {
    throw new Error(
      `${parameterSet} needs a ${expected} byte master seed (${wordCount(parameterSet)} words), got ${
        masterSeed.byteLength
      }`
    )
  }

  const childSeed = deriveChildSeed(masterSeed, index)
  try {
    const { publicKey, secretKey } = set.signer.keygen(childSeed)
    try {
      return { publicKey: bytes.hexify(publicKey), secretKey: bytes.hexify(secretKey) }
    } finally {
      secretKey.fill(0)
    }
  } finally {
    childSeed.fill(0)
  }
}
