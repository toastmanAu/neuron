import crypto from 'crypto'
import { bytes } from '@ckb-lumos/lumos/codec'
import { getParameterSet, SlhDsaParameterSetName } from '../../services/lock-providers/slh-dsa/parameter-sets'

/**
 * Encrypted storage for an SLH-DSA private key.
 *
 * Deliberately not Lumos' `hd.Keystore`, which Neuron uses for secp master keys. That envelope
 * derives 32 bytes with scrypt and then encrypts under only the first 16 of them with aes-128-ctr,
 * authenticating with a hand-assembled keccak MAC. Protecting a key whose entire purpose is
 * long-horizon quantum resistance with a 128-bit symmetric cipher is an odd pairing: Grover halves
 * the brute-force exponent, so 128-bit keys are exactly the case where the margin is thinnest.
 *
 * This uses the same scrypt cost Neuron already pays — so the password flow feels identical and is
 * no weaker — with AES-256-GCM over the full derived key. GCM is authenticated, so a wrong password
 * or a tampered vault fails loudly instead of returning plausible garbage that a caller might go on
 * to treat as a key.
 *
 * No cryptography is implemented here; this composes Node's standard primitives.
 */

/** Matches Neuron's existing keystore cost so the password flow is not silently made cheaper. */
export const DEFAULT_KDF_PARAMS = { n: 262144, r: 8, p: 1, dklen: 32 } as const

const CIPHER = 'aes-256-gcm'
const SALT_SIZE = 32
const IV_SIZE = 12
const VERSION = 1

export interface SlhDsaKdfParams {
  n: number
  r: number
  p: number
  dklen: number
  salt: string
}

export interface SlhDsaKeystoreCrypto {
  cipher: typeof CIPHER
  ciphertext: string
  cipherparams: { iv: string }
  authTag: string
  kdf: 'scrypt'
  kdfparams: SlhDsaKdfParams
}

export interface SlhDsaKeystoreJson {
  version: number
  parameterSet: SlhDsaParameterSetName
  publicKey: string
  crypto: SlhDsaKeystoreCrypto
}

export interface SlhDsaSecretToStore {
  secretKey: string
  publicKey: string
  parameterSet: SlhDsaParameterSetName
}

export class IncorrectVaultPassword extends Error {
  constructor() {
    super('Incorrect password for the quantum-resistant key vault')
  }
}

const HEX = /^0x([0-9a-f][0-9a-f])*$/i

/** Overwrite a buffer in place. Best effort: it cannot reach copies the runtime may have made. */
const wipe = (buffer: Buffer | undefined): void => {
  buffer?.fill(0)
}

const deriveKey = (password: string, kdfparams: SlhDsaKdfParams): Buffer =>
  crypto.scryptSync(Buffer.from(password, 'utf8'), Buffer.from(kdfparams.salt, 'hex'), kdfparams.dklen, {
    N: kdfparams.n,
    r: kdfparams.r,
    p: kdfparams.p,
    maxmem: 128 * (kdfparams.n + kdfparams.p + 2) * kdfparams.r,
  })

export default class SlhDsaKeystore {
  public readonly version: number
  public readonly parameterSet: SlhDsaParameterSetName
  public readonly publicKey: string
  public readonly crypto: SlhDsaKeystoreCrypto

  private constructor(json: SlhDsaKeystoreJson) {
    this.version = json.version
    this.parameterSet = json.parameterSet
    this.publicKey = json.publicKey
    this.crypto = json.crypto
  }

  public static create(
    secret: SlhDsaSecretToStore,
    password: string,
    options: { kdfparams?: { n: number; r: number; p: number }; salt?: Buffer; iv?: Buffer } = {}
  ): SlhDsaKeystore {
    if (!password) {
      throw new Error('A password is required to create a quantum-resistant key vault')
    }
    if (!HEX.test(secret.secretKey)) {
      throw new Error('The SLH-DSA secret key must be a 0x-prefixed hex string')
    }

    const parameterSet = getParameterSet(secret.parameterSet)
    const publicKeyBytes = bytes.bytify(secret.publicKey)
    if (publicKeyBytes.byteLength !== parameterSet.publicKeyLength) {
      throw new Error(
        `${parameterSet.name} expects a ${parameterSet.publicKeyLength} byte public key, got ${publicKeyBytes.byteLength}`
      )
    }

    const salt = options.salt ?? crypto.randomBytes(SALT_SIZE)
    const iv = options.iv ?? crypto.randomBytes(IV_SIZE)
    const kdfparams: SlhDsaKdfParams = {
      ...DEFAULT_KDF_PARAMS,
      ...options.kdfparams,
      salt: salt.toString('hex'),
    }

    let derivedKey: Buffer | undefined
    let plaintext: Buffer | undefined
    try {
      derivedKey = deriveKey(password, kdfparams)
      plaintext = Buffer.from(secret.secretKey.slice(2), 'hex')

      const cipher = crypto.createCipheriv(CIPHER, derivedKey, iv)
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])

      return new SlhDsaKeystore({
        version: VERSION,
        parameterSet: parameterSet.name,
        publicKey: secret.publicKey,
        crypto: {
          cipher: CIPHER,
          ciphertext: ciphertext.toString('hex'),
          cipherparams: { iv: iv.toString('hex') },
          authTag: cipher.getAuthTag().toString('hex'),
          kdf: 'scrypt',
          kdfparams,
        },
      })
    } finally {
      wipe(derivedKey)
      wipe(plaintext)
    }
  }

  public static fromJson(json: string): SlhDsaKeystore {
    const parsed = JSON.parse(json) as SlhDsaKeystoreJson
    if (parsed.version !== VERSION) {
      throw new Error(`Unsupported quantum-resistant key vault version ${parsed.version}`)
    }
    return new SlhDsaKeystore(parsed)
  }

  public toJson(): SlhDsaKeystoreJson {
    return {
      version: this.version,
      parameterSet: this.parameterSet,
      publicKey: this.publicKey,
      crypto: this.crypto,
    }
  }

  /**
   * Recover the private key.
   *
   * Throws on a wrong password or a tampered vault; GCM authentication makes those the same failure
   * and neither yields plaintext. Callers should use the returned key and drop it promptly — once it
   * is a JavaScript string the runtime owns its lifetime and it cannot be wiped.
   */
  public decrypt(password: string): string {
    let derivedKey: Buffer | undefined
    let plaintext: Buffer | undefined
    try {
      derivedKey = deriveKey(password, this.crypto.kdfparams)
      const decipher = crypto.createDecipheriv(
        this.crypto.cipher,
        derivedKey,
        Buffer.from(this.crypto.cipherparams.iv, 'hex')
      )
      decipher.setAuthTag(Buffer.from(this.crypto.authTag, 'hex'))
      plaintext = Buffer.concat([decipher.update(Buffer.from(this.crypto.ciphertext, 'hex')), decipher.final()])
      return `0x${plaintext.toString('hex')}`
    } catch {
      // Never surface the underlying cipher error: it varies with the failure and says nothing a
      // caller can act on beyond "this did not open".
      throw new IncorrectVaultPassword()
    } finally {
      wipe(derivedKey)
      wipe(plaintext)
    }
  }

  public checkPassword(password: string): boolean {
    try {
      this.decrypt(password)
      return true
    } catch {
      return false
    }
  }
}
