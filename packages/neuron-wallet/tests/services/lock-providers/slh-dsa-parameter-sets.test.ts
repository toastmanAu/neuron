import 'dotenv/config'
import { sha256 } from '@noble/hashes/sha256'
import { bytes } from '@ckb-lumos/lumos/codec'
import {
  SLH_DSA_PARAMETER_SETS,
  SlhDsaParameterSetName,
  buildWitnessLock,
  deriveLockArgs,
  estimateWitnessSize,
  getParameterSet,
  parseWitnessLock,
  witnessLockLength,
} from '../../../src/services/lock-providers/slh-dsa/parameter-sets'
import { SLH_DSA_VECTORS } from '../../fixtures/slh-dsa-vectors'

const upstreamName = (rustName: string): SlhDsaParameterSetName => {
  // Upstream's Rust enum is Sha2128F / Shake256S; the NIST name is SLH-DSA-SHA2-128f.
  const m = rustName.match(/^(Sha2|Shake)(128|192|256)(F|S)$/)!
  return `SLH-DSA-${m[1] === 'Sha2' ? 'SHA2' : 'SHAKE'}-${m[2]}${m[3].toLowerCase()}` as SlhDsaParameterSetName
}

describe('SLH-DSA parameter sets', () => {
  it('covers all twelve NIST parameter sets', () => {
    expect(Object.keys(SLH_DSA_PARAMETER_SETS)).toHaveLength(12)
  })

  SLH_DSA_VECTORS.paramSets.forEach(vector => {
    const name = upstreamName(vector.paramId)

    describe(name, () => {
      it('is registered under its NIST name', () => {
        expect(getParameterSet(name).name).toBe(name)
      })

      it('derives the upstream script args prefix', () => {
        expect(getParameterSet(name).argsPrefix).toBe(vector.argsPrefix)
      })

      it('derives the upstream witness prefix', () => {
        expect(getParameterSet(name).witnessPrefix).toBe(vector.witnessPrefix)
      })

      it('records the upstream key and signature lengths', () => {
        expect(getParameterSet(name).publicKeyLength).toBe(vector.publicKeyLength)
        expect(getParameterSet(name).signatureLength).toBe(vector.signatureLength)
      })

      it('derives the same lock args as upstream for the same public key', () => {
        expect(deriveLockArgs(name, vector.publicKey)).toBe(vector.scriptArgs)
      })

      it('sizes the witness as prefix plus public key plus signature', () => {
        expect(witnessLockLength(name)).toBe(5 + vector.publicKeyLength + vector.signatureLength)
      })

      it('sizes the fee estimate to include molecule overhead', () => {
        // 16 bytes of WitnessArgs table header, 4 bytes of lock length, 8 bytes of fixvec overhead.
        expect(estimateWitnessSize(name)).toBe(28 + 5 + vector.publicKeyLength + vector.signatureLength)
      })
    })
  })

  it('rejects an unknown parameter set name', () => {
    expect(() => getParameterSet('SLH-DSA-SHA2-999s' as SlhDsaParameterSetName)).toThrow(/parameter set/i)
  })
})

describe('SLH-DSA witness lock encoding', () => {
  const name: SlhDsaParameterSetName = 'SLH-DSA-SHA2-128s'
  const set = getParameterSet(name)
  const publicKey = `0x${'42'.repeat(set.publicKeyLength)}`
  const signature = `0x${'7f'.repeat(set.signatureLength)}`

  it('lays out the lock as witness prefix, public key, signature', () => {
    const lock = buildWitnessLock(name, publicKey, signature)

    expect(lock.startsWith(set.witnessPrefix)).toBe(true)
    expect(bytes.bytify(lock).byteLength).toBe(witnessLockLength(name))
  })

  it('round trips through parseWitnessLock', () => {
    const parsed = parseWitnessLock(buildWitnessLock(name, publicKey, signature))

    expect(parsed.parameterSet.name).toBe(name)
    expect(parsed.publicKey).toBe(publicKey)
    expect(parsed.signature).toBe(signature)
  })

  it('uses the witness prefix, not the script args prefix', () => {
    // The two differ only in the low bit of the flag byte. Using the args prefix here would produce
    // a witness the lock rejects, and the mistake is invisible by inspection.
    const lock = buildWitnessLock(name, publicKey, signature)

    expect(lock.startsWith(set.argsPrefix)).toBe(false)
  })

  it('refuses a public key of the wrong length for the parameter set', () => {
    expect(() => buildWitnessLock(name, `0x${'42'.repeat(16)}`, signature)).toThrow(/public key/i)
  })

  it('refuses a signature of the wrong length for the parameter set', () => {
    expect(() => buildWitnessLock(name, publicKey, `0x${'7f'.repeat(10)}`)).toThrow(/signature/i)
  })

  it('rejects a witness lock with an unrecognised prefix', () => {
    expect(() => parseWitnessLock(`0x8001010199${'42'.repeat(set.publicKeyLength)}`)).toThrow(/prefix|parameter set/i)
  })

  it('rejects a witness lock whose length does not match its declared parameter set', () => {
    expect(() => parseWitnessLock(`${set.witnessPrefix}${'42'.repeat(10)}`)).toThrow(
      `SLH-DSA witness lock for ${name} should be ${witnessLockLength(name)} bytes, got 15`
    )
  })
})

describe('interoperability with the reference Rust implementation', () => {
  SLH_DSA_VECTORS.keyPairs.forEach(vector => {
    const name = vector.paramSet as SlhDsaParameterSetName

    describe(name, () => {
      const fullSignature = (vector as { signatureDeterministic?: string }).signatureDeterministic

      // Only the parameter sets whose full signature is kept in the fixture can be verified
      // directly; the rest are covered by the byte-equality test below.
      const verifies = fullSignature ? it : it.skip
      verifies('verifies a signature produced by the Rust implementation', () => {
        const set = getParameterSet(name)

        expect(
          set.signer.verify(bytes.bytify(vector.publicKey), bytes.bytify(vector.message), bytes.bytify(fullSignature!))
        ).toBe(true)
      })

      it('produces a byte identical signature from the same secret key and message', () => {
        const set = getParameterSet(name)
        const signature = set.signer.sign(bytes.bytify(vector.secretKey), bytes.bytify(vector.message))

        expect(signature.length).toBe(vector.signatureLength)
        expect(bytes.hexify(sha256(signature))).toBe(vector.signatureSha256)
      }, 120000)

      it('derives the same public key length the Rust implementation reported', () => {
        expect(bytes.bytify(vector.publicKey).byteLength).toBe(getParameterSet(name).publicKeyLength)
      })
    })
  })
})
