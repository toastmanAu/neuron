import { blake2b } from '@noble/hashes/blake2b'
import {
  slh_dsa_sha2_128f,
  slh_dsa_sha2_128s,
  slh_dsa_sha2_192f,
  slh_dsa_sha2_192s,
  slh_dsa_sha2_256f,
  slh_dsa_sha2_256s,
  slh_dsa_shake_128f,
  slh_dsa_shake_128s,
  slh_dsa_shake_192f,
  slh_dsa_shake_192s,
  slh_dsa_shake_256f,
  slh_dsa_shake_256s,
} from '@noble/post-quantum/slh-dsa'
import { bytes } from '@ckb-lumos/lumos/codec'

/** Blake2b personalisation the lock uses when hashing a public key into script args. */
export const SCRIPT_ARGS_PERSONAL = 'ckb-sphincs+-sct'

/** Every prefix is `80 01 01 01 <flag>`; only the flag byte varies. */
const PREFIX_HEAD = [0x80, 0x01, 0x01, 0x01]
const PREFIX_LENGTH = 5

/**
 * Molecule and fixvec overhead a witness carries on top of its lock payload:
 * 16 bytes of `WitnessArgs` table header (full size plus three field offsets), 4 bytes of lock
 * length, and 8 bytes of the transaction's witness fixvec (item count plus offset).
 *
 * Cross-checked against the secp case, where the lock payload is 65 bytes and
 * `TransactionSize.secpLockWitness()` is 93.
 */
export const WITNESS_OVERHEAD_BYTES = 28

export type SlhDsaParameterSetName =
  | 'SLH-DSA-SHA2-128f'
  | 'SLH-DSA-SHA2-128s'
  | 'SLH-DSA-SHA2-192f'
  | 'SLH-DSA-SHA2-192s'
  | 'SLH-DSA-SHA2-256f'
  | 'SLH-DSA-SHA2-256s'
  | 'SLH-DSA-SHAKE-128f'
  | 'SLH-DSA-SHAKE-128s'
  | 'SLH-DSA-SHAKE-192f'
  | 'SLH-DSA-SHAKE-192s'
  | 'SLH-DSA-SHAKE-256f'
  | 'SLH-DSA-SHAKE-256s'

/** The signing surface this module needs from @noble/post-quantum. */
export interface SlhDsaSigner {
  keygen: (seed: Uint8Array) => { secretKey: Uint8Array; publicKey: Uint8Array }
  sign: (secretKey: Uint8Array, msg: Uint8Array, random?: Uint8Array) => Uint8Array
  verify: (publicKey: Uint8Array, msg: Uint8Array, sig: Uint8Array) => boolean
  signRandBytes: number
}

export interface SlhDsaParameterSet {
  readonly name: SlhDsaParameterSetName
  /** Upstream `ParamId`, 48..59. The prefixes are derived from it. */
  readonly paramId: number
  readonly argsPrefix: string
  readonly witnessPrefix: string
  /**
   * FIPS 205 `n`, the security parameter in bytes: 16, 24 or 32.
   *
   * Key generation consumes three n-byte seeds (SK.seed, SK.prf, PK.seed) and the public key is
   * two of them wide, so this is always `publicKeyLength / 2`. It is named here rather than
   * recomputed at each site because seed handling reads as arithmetic on a public key length
   * otherwise, which is the sort of thing that survives review while being wrong.
   */
  readonly n: number
  readonly publicKeyLength: number
  readonly signatureLength: number
  readonly signer: SlhDsaSigner
}

/**
 * `flag = (param_id << 1) | has_signature`, matching `construct_flag` upstream.
 *
 * The script args prefix and the witness prefix differ only in that low bit, which is why they are
 * derived here from one number rather than written out as two tables that could drift apart.
 */
const prefixFor = (paramId: number, hasSignature: boolean): string =>
  bytes.hexify(Uint8Array.from([...PREFIX_HEAD, ((paramId << 1) | (hasSignature ? 1 : 0)) & 0xff]))

const define = (
  name: SlhDsaParameterSetName,
  paramId: number,
  publicKeyLength: number,
  signatureLength: number,
  signer: SlhDsaSigner
): SlhDsaParameterSet => ({
  name,
  paramId,
  argsPrefix: prefixFor(paramId, false),
  witnessPrefix: prefixFor(paramId, true),
  n: publicKeyLength / 2,
  publicKeyLength,
  signatureLength,
  signer,
})

/**
 * The twelve parameter sets the all-in-one lock supports.
 *
 * `paramId` values and key/signature lengths come from upstream's `ParamId` enum and
 * `verifying::lengths`, and are pinned by cross-language vectors.
 */
export const SLH_DSA_PARAMETER_SETS: Record<SlhDsaParameterSetName, SlhDsaParameterSet> = {
  'SLH-DSA-SHA2-128f': define('SLH-DSA-SHA2-128f', 48, 32, 17088, slh_dsa_sha2_128f),
  'SLH-DSA-SHA2-128s': define('SLH-DSA-SHA2-128s', 49, 32, 7856, slh_dsa_sha2_128s),
  'SLH-DSA-SHA2-192f': define('SLH-DSA-SHA2-192f', 50, 48, 35664, slh_dsa_sha2_192f),
  'SLH-DSA-SHA2-192s': define('SLH-DSA-SHA2-192s', 51, 48, 16224, slh_dsa_sha2_192s),
  'SLH-DSA-SHA2-256f': define('SLH-DSA-SHA2-256f', 52, 64, 49856, slh_dsa_sha2_256f),
  'SLH-DSA-SHA2-256s': define('SLH-DSA-SHA2-256s', 53, 64, 29792, slh_dsa_sha2_256s),
  'SLH-DSA-SHAKE-128f': define('SLH-DSA-SHAKE-128f', 54, 32, 17088, slh_dsa_shake_128f),
  'SLH-DSA-SHAKE-128s': define('SLH-DSA-SHAKE-128s', 55, 32, 7856, slh_dsa_shake_128s),
  'SLH-DSA-SHAKE-192f': define('SLH-DSA-SHAKE-192f', 56, 48, 35664, slh_dsa_shake_192f),
  'SLH-DSA-SHAKE-192s': define('SLH-DSA-SHAKE-192s', 57, 48, 16224, slh_dsa_shake_192s),
  'SLH-DSA-SHAKE-256f': define('SLH-DSA-SHAKE-256f', 58, 64, 49856, slh_dsa_shake_256f),
  'SLH-DSA-SHAKE-256s': define('SLH-DSA-SHAKE-256s', 59, 64, 29792, slh_dsa_shake_256s),
}

export const getParameterSet = (name: SlhDsaParameterSetName): SlhDsaParameterSet => {
  const parameterSet = SLH_DSA_PARAMETER_SETS[name]
  if (!parameterSet) {
    throw new Error(`Unknown SLH-DSA parameter set "${name}"`)
  }
  return parameterSet
}

/**
 * Lock script args for a public key: `blake2b-256(args_prefix || public_key)` personalised with
 * `ckb-sphincs+-sct`.
 *
 * The parameter set is folded into the prefix, which is why it cannot be recovered from the args
 * afterwards and has to be stored alongside the identity.
 */
export const deriveLockArgs = (name: SlhDsaParameterSetName, publicKey: string): string => {
  const parameterSet = getParameterSet(name)
  const publicKeyBytes = bytes.bytify(publicKey)
  if (publicKeyBytes.byteLength !== parameterSet.publicKeyLength) {
    throw new Error(
      `${name} expects a ${parameterSet.publicKeyLength} byte public key, got ${publicKeyBytes.byteLength}`
    )
  }

  const hasher = blake2b.create({
    dkLen: 32,
    personalization: new TextEncoder().encode(SCRIPT_ARGS_PERSONAL),
  })
  hasher.update(bytes.bytify(parameterSet.argsPrefix))
  hasher.update(publicKeyBytes)
  return bytes.hexify(hasher.digest())
}

/** Bytes the witness `lock` field occupies: prefix, public key and signature. */
export const witnessLockLength = (name: SlhDsaParameterSetName): number => {
  const parameterSet = getParameterSet(name)
  return PREFIX_LENGTH + parameterSet.publicKeyLength + parameterSet.signatureLength
}

/** Serialized bytes this lock's witness contributes to a transaction, for fee estimation. */
export const estimateWitnessSize = (name: SlhDsaParameterSetName): number =>
  WITNESS_OVERHEAD_BYTES + witnessLockLength(name)

export const buildWitnessLock = (name: SlhDsaParameterSetName, publicKey: string, signature: string): string => {
  const parameterSet = getParameterSet(name)
  const publicKeyBytes = bytes.bytify(publicKey)
  const signatureBytes = bytes.bytify(signature)

  if (publicKeyBytes.byteLength !== parameterSet.publicKeyLength) {
    throw new Error(
      `${name} expects a ${parameterSet.publicKeyLength} byte public key, got ${publicKeyBytes.byteLength}`
    )
  }
  if (signatureBytes.byteLength !== parameterSet.signatureLength) {
    throw new Error(
      `${name} expects a ${parameterSet.signatureLength} byte signature, got ${signatureBytes.byteLength}`
    )
  }

  return bytes.hexify(bytes.concat(bytes.bytify(parameterSet.witnessPrefix), publicKeyBytes, signatureBytes))
}

export interface ParsedWitnessLock {
  parameterSet: SlhDsaParameterSet
  publicKey: string
  signature: string
}

/**
 * Read a witness lock back into its parts.
 *
 * Used when inspecting a transaction this wallet did not build, so it validates rather than trusts:
 * an unrecognised prefix or a length that disagrees with the declared parameter set is rejected.
 */
export const parseWitnessLock = (lock: string): ParsedWitnessLock => {
  const lockBytes = bytes.bytify(lock)
  if (lockBytes.byteLength < PREFIX_LENGTH) {
    throw new Error('SLH-DSA witness lock is too short to carry a parameter set prefix')
  }

  const prefix = bytes.hexify(lockBytes.slice(0, PREFIX_LENGTH))
  const parameterSet = Object.values(SLH_DSA_PARAMETER_SETS).find(set => set.witnessPrefix === prefix)
  if (!parameterSet) {
    throw new Error(`SLH-DSA witness lock carries an unrecognised parameter set prefix ${prefix}`)
  }

  const expected = witnessLockLength(parameterSet.name)
  if (lockBytes.byteLength !== expected) {
    throw new Error(
      `SLH-DSA witness lock for ${parameterSet.name} should be ${expected} bytes, got ${lockBytes.byteLength}`
    )
  }

  return {
    parameterSet,
    publicKey: bytes.hexify(lockBytes.slice(PREFIX_LENGTH, PREFIX_LENGTH + parameterSet.publicKeyLength)),
    signature: bytes.hexify(lockBytes.slice(PREFIX_LENGTH + parameterSet.publicKeyLength)),
  }
}
