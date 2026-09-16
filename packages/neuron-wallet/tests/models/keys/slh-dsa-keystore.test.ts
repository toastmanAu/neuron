import 'dotenv/config'
import SlhDsaKeystore from '../../../src/models/keys/slh-dsa-keystore'

// Neuron's own scrypt cost (N = 2^18) takes a second or two per call. The cost is part of the
// stored format, so a cheaper setting here is ordinary use of the API rather than a test hook.
const FAST_KDF = { n: 1024, r: 8, p: 1 }

// 3n bytes for n = 16: SK.seed, SK.prf and PK.seed.
const MASTER_SEED = `0x${'ab'.repeat(48)}`
const PUBLIC_KEY = `0x${'cd'.repeat(32)}`
const PASSWORD = 'correct horse battery staple'

const create = (secret = MASTER_SEED, accountIndex = 0) =>
  SlhDsaKeystore.create(
    { masterSeed: secret, publicKey: PUBLIC_KEY, parameterSet: 'SLH-DSA-SHA2-128s', accountIndex },
    PASSWORD,
    { kdfparams: FAST_KDF }
  )

describe('SlhDsaKeystore', () => {
  describe('round trip', () => {
    it('returns the master seed it was given', () => {
      expect(create().decrypt(PASSWORD)).toBe(MASTER_SEED)
    })

    it('stores the master seed rather than an expanded key, and says so', () => {
      const keystore = create()

      expect(keystore.payload).toBe('master-seed')
      expect(keystore.version).toBe(2)
    })

    it('keeps the account index, which the seed alone does not imply', () => {
      expect(create(MASTER_SEED, 3).accountIndex).toBe(3)
      expect(SlhDsaKeystore.fromJson(JSON.stringify(create(MASTER_SEED, 3).toJson())).accountIndex).toBe(3)
    })

    it('keeps the public key and parameter set in the clear for recovery', () => {
      // Neither is secret, and both are needed to rebuild the lock script. Encrypting them would
      // make a wallet unrecoverable without the password even for watch-only purposes.
      const keystore = create()

      expect(keystore.publicKey).toBe(PUBLIC_KEY)
      expect(keystore.parameterSet).toBe('SLH-DSA-SHA2-128s')
    })

    it('survives serialisation to JSON and back', () => {
      const restored = SlhDsaKeystore.fromJson(JSON.stringify(create().toJson()))

      expect(restored.decrypt(PASSWORD)).toBe(MASTER_SEED)
      expect(restored.publicKey).toBe(PUBLIC_KEY)
    })
  })

  describe('password handling', () => {
    it('refuses to decrypt with the wrong password', () => {
      expect(() => create().decrypt('wrong password')).toThrow(/password/i)
    })

    it('never returns plaintext for a wrong password', () => {
      // Authenticated encryption, so a wrong key fails rather than yielding garbage that a caller
      // might go on to treat as a key.
      let result: string | undefined
      try {
        result = create().decrypt('wrong password')
      } catch {
        result = undefined
      }

      expect(result).toBeUndefined()
    })

    it('reports whether a password is correct without decrypting', () => {
      const keystore = create()

      expect(keystore.checkPassword(PASSWORD)).toBe(true)
      expect(keystore.checkPassword('wrong password')).toBe(false)
    })

    it('rejects an empty password', () => {
      expect(() =>
        SlhDsaKeystore.create(
          { masterSeed: MASTER_SEED, publicKey: PUBLIC_KEY, parameterSet: 'SLH-DSA-SHA2-128s', accountIndex: 0 },
          '',
          { kdfparams: FAST_KDF }
        )
      ).toThrow(/password/i)
    })
  })

  describe('tamper resistance', () => {
    it('rejects modified ciphertext', () => {
      const json = create().toJson()
      const flipped = json.crypto.ciphertext.slice(0, -2) + (json.crypto.ciphertext.endsWith('00') ? '11' : '00')

      const tampered = SlhDsaKeystore.fromJson(
        JSON.stringify({ ...json, crypto: { ...json.crypto, ciphertext: flipped } })
      )

      expect(() => tampered.decrypt(PASSWORD)).toThrow()
    })

    it('rejects a modified authentication tag', () => {
      const json = create().toJson()
      const flipped = json.crypto.authTag.slice(0, -2) + (json.crypto.authTag.endsWith('00') ? '11' : '00')

      const tampered = SlhDsaKeystore.fromJson(
        JSON.stringify({ ...json, crypto: { ...json.crypto, authTag: flipped } })
      )

      expect(() => tampered.decrypt(PASSWORD)).toThrow()
    })

    it('rejects a swapped salt, so a vault cannot be re-keyed to a known password', () => {
      const json = create().toJson()
      const other = create().toJson()

      const swapped = SlhDsaKeystore.fromJson(
        JSON.stringify({ ...json, crypto: { ...json.crypto, kdfparams: other.crypto.kdfparams } })
      )

      expect(() => swapped.decrypt(PASSWORD)).toThrow()
    })
  })

  describe('encryption parameters', () => {
    it('produces different ciphertext each time for the same secret and password', () => {
      expect(create().toJson().crypto.ciphertext).not.toBe(create().toJson().crypto.ciphertext)
    })

    it('uses a fresh salt and iv per vault', () => {
      const a = create().toJson().crypto
      const b = create().toJson().crypto

      expect(a.kdfparams.salt).not.toBe(b.kdfparams.salt)
      expect(a.cipherparams.iv).not.toBe(b.cipherparams.iv)
    })

    it('uses authenticated encryption over the full derived key', () => {
      expect(create().toJson().crypto.cipher).toBe('aes-256-gcm')
    })

    it('defaults to the same scrypt cost Neuron already uses for secp keystores', () => {
      const keystore = SlhDsaKeystore.create(
        { masterSeed: MASTER_SEED, publicKey: PUBLIC_KEY, parameterSet: 'SLH-DSA-SHA2-128s', accountIndex: 0 },
        PASSWORD
      )

      expect(keystore.toJson().crypto.kdfparams).toMatchObject({ n: 262144, r: 8, p: 1, dklen: 32 })
    }, 60000)
  })

  describe('validation', () => {
    it('rejects a secret that is not hex', () => {
      expect(() => create('not hex')).toThrow(/master seed/i)
    })

    it('rejects a master seed of the wrong length for its parameter set', () => {
      // 48 bytes for n = 16; anything else means the caller and the parameter set disagree about
      // which key this vault holds, and that only surfaces later as a wrong address.
      expect(() => create(`0x${'ab'.repeat(32)}`)).toThrow(/master seed/i)
    })

    it('rejects a negative or non-integer account index', () => {
      expect(() => create(MASTER_SEED, -1)).toThrow(/account index/i)
      expect(() => create(MASTER_SEED, 1.5)).toThrow(/account index/i)
    })

    it('rejects an unknown parameter set', () => {
      expect(() =>
        SlhDsaKeystore.create(
          { masterSeed: MASTER_SEED, publicKey: PUBLIC_KEY, parameterSet: 'SLH-DSA-NOPE' as never, accountIndex: 0 },
          PASSWORD,
          { kdfparams: FAST_KDF }
        )
      ).toThrow(/parameter set/i)
    })

    it('rejects a public key of the wrong length for its parameter set', () => {
      expect(() =>
        SlhDsaKeystore.create(
          {
            masterSeed: MASTER_SEED,
            publicKey: `0x${'cd'.repeat(8)}`,
            parameterSet: 'SLH-DSA-SHA2-128s',
            accountIndex: 0,
          },
          PASSWORD,
          { kdfparams: FAST_KDF }
        )
      ).toThrow(/public key/i)
    })

    it('rejects a vault whose stored version it does not understand', () => {
      const json = create().toJson()

      expect(() => SlhDsaKeystore.fromJson(JSON.stringify({ ...json, version: 99 }))).toThrow(/version/i)
    })
  })

  describe('secret hygiene', () => {
    it('does not keep the plaintext secret on the instance', () => {
      const keystore = create()

      expect(JSON.stringify(keystore)).not.toContain(MASTER_SEED.slice(2))
    })

    it('does not put the secret in a thrown error message', () => {
      try {
        create().decrypt('wrong password')
      } catch (error) {
        expect((error as Error).message).not.toContain(MASTER_SEED.slice(2))
      }
    })
  })

  describe('version 1 vaults', () => {
    // Version 1 stored the expanded SLH-DSA secret key and had no mnemonic behind it. Wallets in
    // that format exist on disk with funds in them, so reading one has to keep working forever
    // even though nothing writes one any more. Built from a literal below rather than from this
    // module, so removing the legacy path cannot quietly keep the test green.
    const LEGACY_V1 = {
      version: 1,
      parameterSet: 'SLH-DSA-SHA2-128s',
      publicKey: PUBLIC_KEY,
      crypto: {
        cipher: 'aes-256-gcm',
        ciphertext: '9b9c24fdca7bd3b8de8f3f07f3ee85a4b5b5ce37e0e5aa6c6b35c0e6d1b0a9c3',
        cipherparams: { iv: '000102030405060708090a0b' },
        authTag: '00112233445566778899aabbccddeeff',
        kdf: 'scrypt',
        kdfparams: { n: 1024, r: 8, p: 1, dklen: 32, salt: 'ff'.repeat(32) },
      },
    }

    it('still parses', () => {
      const keystore = SlhDsaKeystore.fromJson(JSON.stringify(LEGACY_V1))

      expect(keystore.version).toBe(1)
      expect(keystore.publicKey).toBe(PUBLIC_KEY)
      expect(keystore.parameterSet).toBe('SLH-DSA-SHA2-128s')
    })

    it('reports that it holds an expanded key, not a master seed', () => {
      // The caller has to know which one came back out of `decrypt`, and a v1 vault cannot produce
      // a mnemonic or further accounts.
      expect(SlhDsaKeystore.fromJson(JSON.stringify(LEGACY_V1)).payload).toBe('secret-key')
    })

    it('has no account index', () => {
      expect(SlhDsaKeystore.fromJson(JSON.stringify(LEGACY_V1)).accountIndex).toBeUndefined()
    })

    it('round trips back to version 1, so reading one does not rewrite it', () => {
      expect(SlhDsaKeystore.fromJson(JSON.stringify(LEGACY_V1)).toJson()).toEqual(LEGACY_V1)
    })
  })
})
