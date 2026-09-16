import 'dotenv/config'

// In-memory stand-in for the on-disk vault store, so these tests exercise the real service logic
// without touching the user's Neuron directory.
const files = new Map<string, string>()
const modules = new Set<string>()
const key = (moduleName: string, filename: string) => `${moduleName}/${filename}`

// The real FileService throws when a module directory has not been created, and reads throw just
// as writes do. A mock that answers `hasModule: () => true` is kinder than the thing it stands in
// for, and hides exactly the failure a fresh profile hits on its very first read.
jest.mock('../../src/services/file', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      addModule: (m: string) => {
        modules.add(m)
      },
      hasModule: (m: string) => modules.has(m),
      hasFile: (m: string, f: string) => {
        if (!modules.has(m)) throw new Error(`Module ${m} not found`)
        return files.has(key(m, f))
      },
      readFileSync: (m: string, f: string) => {
        if (!files.has(key(m, f))) throw new Error(`FileNotFound ${f}`)
        return files.get(key(m, f))!
      },
      writeFileSync: (m: string, f: string, data: string) => {
        if (!modules.has(m)) throw new Error(`Module ${m} not found`)
        files.set(key(m, f), data)
      },
      deleteFileSync: (m: string, f: string) => {
        files.delete(key(m, f))
      },
    }),
  },
}))

import SlhDsaWalletService from '../../src/services/slh-dsa-wallets'
import ScriptIdentityService from '../../src/services/script-identities'
import { deriveLockArgs } from '../../src/services/lock-providers/slh-dsa/parameter-sets'
import { ScriptHashType } from '../../src/models/chain/script'
import { Network, NetworkType, MAINNET_GENESIS_HASH, TESTNET_GENESIS_HASH } from '../../src/models/network'
import ScriptIdentityEntity from '../../src/database/chain/entities/script-identity'
import { closeConnection, getConnection, initConnection } from '../setupAndTeardown'

const networkWith = (genesisHash: string, chain: string): Network => ({
  id: 'n',
  name: 'n',
  remote: 'http://127.0.0.1:8114',
  type: NetworkType.Normal,
  genesisHash,
  chain,
  readonly: false,
})

const testnet = networkWith(TESTNET_GENESIS_HASH, 'ckb_testnet')
const mainnet = networkWith(MAINNET_GENESIS_HASH, 'ckb')
const devnet = networkWith(`0x${'ee'.repeat(32)}`, 'ckb_dev')

const WALLET = 'pq-wallet-1'
const PASSWORD = 'a strong enough password'
const PARAM = 'SLH-DSA-SHA2-128s' as const
// Neuron's real scrypt cost is ~2s per call; the cost is part of the stored format so a cheaper
// setting is ordinary use of the API.
const FAST = { kdfparams: { n: 1024, r: 8, p: 1 } }

describe('SlhDsaWalletService', () => {
  beforeAll(async () => {
    await initConnection()
  })

  afterAll(async () => {
    await closeConnection()
  })

  beforeEach(async () => {
    files.clear()
    modules.clear()
    await getConnection().createQueryBuilder().delete().from(ScriptIdentityEntity).execute()
  })

  describe('creating a wallet', () => {
    it('creates the first wallet on a profile that has no vault directory yet', async () => {
      // The case every new user hits. `create` reads before it writes, and FileService throws
      // ModuleNotFound on reads too, so nothing had ever created the directory by the time the
      // first read happened. Creating a quantum-resistant wallet was impossible on a fresh install.
      modules.clear()
      files.clear()

      await expect(
        SlhDsaWalletService.create({ walletId: 'first', parameterSet: PARAM, password: PASSWORD }, FAST)
      ).resolves.toEqual(expect.objectContaining({ parameterSet: PARAM }))
      expect(SlhDsaWalletService.hasVault('first')).toBe(true)
    }, 60000)

    it('reports no vault, rather than throwing, before anything has been written', () => {
      modules.clear()
      files.clear()

      expect(SlhDsaWalletService.hasVault('nobody')).toBe(false)
    })

    it('stores an encrypted vault and returns the public key', async () => {
      const { publicKey, parameterSet } = await SlhDsaWalletService.create(
        { walletId: WALLET, parameterSet: PARAM, password: PASSWORD },
        FAST
      )

      expect(parameterSet).toBe(PARAM)
      expect(publicKey).toMatch(/^0x[0-9a-f]{64}$/)
      expect(SlhDsaWalletService.hasVault(WALLET)).toBe(true)
    })

    it('never writes the private key in the clear', async () => {
      await SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)
      const secret = await SlhDsaWalletService.getSecret(WALLET, PASSWORD)

      const stored = [...files.values()].join('')

      expect(stored).not.toContain(secret.secretKey.slice(2))
    })

    it('generates a different key for every wallet', async () => {
      const a = await SlhDsaWalletService.create({ walletId: 'a', parameterSet: PARAM, password: PASSWORD }, FAST)
      const b = await SlhDsaWalletService.create({ walletId: 'b', parameterSet: PARAM, password: PASSWORD }, FAST)

      expect(a.publicKey).not.toBe(b.publicKey)
    })

    it('refuses to overwrite an existing vault', async () => {
      await SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)

      await expect(
        SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)
      ).rejects.toThrow(/already/i)
    })

    it('returns a 36 word recovery phrase the user can write down', async () => {
      const { mnemonic } = await SlhDsaWalletService.create(
        { walletId: WALLET, parameterSet: PARAM, password: PASSWORD },
        FAST
      )

      expect(mnemonic.split(' ')).toHaveLength(36)
    })

    it('sizes the phrase to the parameter set', async () => {
      // A 256-bit set needs three 24 word phrases, not three 12 word ones. Getting this wrong
      // produces a phrase that restores a different, shorter seed.
      const { mnemonic } = await SlhDsaWalletService.create(
        { walletId: 'big', parameterSet: 'SLH-DSA-SHA2-256s', password: PASSWORD },
        FAST
      )

      expect(mnemonic.split(' ')).toHaveLength(72)
    })

    it('stores the master seed, not the expanded key', async () => {
      await SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)

      const vault = SlhDsaWalletService.loadVault(WALLET)

      expect(vault.payload).toBe('master-seed')
      expect(vault.accountIndex).toBe(0)
    })
  })

  describe('recovery phrases', () => {
    it('restores the same wallet from the phrase it handed out', async () => {
      const created = await SlhDsaWalletService.create(
        { walletId: WALLET, parameterSet: PARAM, password: PASSWORD },
        FAST
      )

      await SlhDsaWalletService.importMnemonic(
        { walletId: 'restored', parameterSet: PARAM, password: 'a different password', mnemonic: created.mnemonic },
        FAST
      )

      const restored = SlhDsaWalletService.loadVault('restored')
      expect(restored.publicKey).toBe(created.publicKey)
    })

    it('restores a spendable key, not just a matching address', async () => {
      const created = await SlhDsaWalletService.create(
        { walletId: WALLET, parameterSet: PARAM, password: PASSWORD },
        FAST
      )
      await SlhDsaWalletService.importMnemonic(
        { walletId: 'restored', parameterSet: PARAM, password: PASSWORD, mnemonic: created.mnemonic },
        FAST
      )

      const original = await SlhDsaWalletService.getSecret(WALLET, PASSWORD)
      const restored = await SlhDsaWalletService.getSecret('restored', PASSWORD)

      expect(restored.secretKey).toBe(original.secretKey)
    })

    it('exports the same phrase it was created with', async () => {
      const { mnemonic } = await SlhDsaWalletService.create(
        { walletId: WALLET, parameterSet: PARAM, password: PASSWORD },
        FAST
      )

      await expect(SlhDsaWalletService.exportMnemonic(WALLET, PASSWORD)).resolves.toBe(mnemonic)
    })

    it('will not export the phrase without the password', async () => {
      await SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)

      await expect(SlhDsaWalletService.exportMnemonic(WALLET, 'wrong password')).rejects.toThrow(/password/i)
    })

    it('rejects a phrase whose length does not match the chosen parameter set', async () => {
      const { mnemonic } = await SlhDsaWalletService.create(
        { walletId: WALLET, parameterSet: PARAM, password: PASSWORD },
        FAST
      )

      await expect(
        SlhDsaWalletService.importMnemonic(
          { walletId: 'mismatch', parameterSet: 'SLH-DSA-SHA2-256s', password: PASSWORD, mnemonic },
          FAST
        )
      ).rejects.toThrow(/SLH-DSA-SHA2-256s/)
      expect(SlhDsaWalletService.hasVault('mismatch')).toBe(false)
    })

    it('rejects a phrase with a miscopied word, naming which of the three to re-read', async () => {
      const { mnemonic } = await SlhDsaWalletService.create(
        { walletId: WALLET, parameterSet: PARAM, password: PASSWORD },
        FAST
      )
      const words = mnemonic.split(' ')
      words[13] = 'zoo'

      await expect(
        SlhDsaWalletService.importMnemonic(
          { walletId: 'typo', parameterSet: PARAM, password: PASSWORD, mnemonic: words.join(' ') },
          FAST
        )
      ).rejects.toThrow(/phrase 2/)
    })

    it('refuses to overwrite an existing vault', async () => {
      const { mnemonic } = await SlhDsaWalletService.create(
        { walletId: WALLET, parameterSet: PARAM, password: PASSWORD },
        FAST
      )

      await expect(
        SlhDsaWalletService.importMnemonic(
          { walletId: WALLET, parameterSet: PARAM, password: PASSWORD, mnemonic },
          FAST
        )
      ).rejects.toThrow(/already/i)
    })

    it('cannot export a phrase for a version 1 vault, which never had one', async () => {
      // Vaults created before mnemonics exist on disk with funds in them. They still sign; they
      // just have no words behind them, and saying so plainly beats returning a phrase that
      // restores nothing.
      await SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)
      const v2 = JSON.parse(files.get(`pq-vaults/${WALLET}.json`)!)
      files.set(`pq-vaults/${WALLET}.json`, JSON.stringify({ ...v2, version: 1, accountIndex: undefined }))

      await expect(SlhDsaWalletService.exportMnemonic(WALLET, PASSWORD)).rejects.toThrow(/recovery phrase/i)
    })
  })

  describe('deriving identities', () => {
    it('creates the identity for the connected network', async () => {
      const { publicKey } = await SlhDsaWalletService.create(
        { walletId: WALLET, parameterSet: PARAM, password: PASSWORD },
        FAST
      )

      const identity = await SlhDsaWalletService.deriveIdentity(WALLET, testnet)

      expect(identity.lockCodeHash).toBe('0x147ecbb5c5127d982ee1362d2c2bb4267803da2eb006d150e88af6caaa0a7eaf')
      expect(identity.lockHashType).toBe(ScriptHashType.Data1)
      expect(identity.lockArgs).toBe(deriveLockArgs(PARAM, publicKey))
      expect(identity.metadata).toEqual({ parameterSet: PARAM, publicKey })
    })

    it('persists the identity so it survives a restart', async () => {
      await SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)
      await SlhDsaWalletService.deriveIdentity(WALLET, testnet)

      const stored = await ScriptIdentityService.getByWalletId(WALLET)

      expect(stored).toHaveLength(1)
      expect(stored[0].providerId).toBe('slh-dsa-fips205')
    })

    it('does not create a second identity for the same network', async () => {
      await SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)
      await SlhDsaWalletService.deriveIdentity(WALLET, testnet)
      await SlhDsaWalletService.deriveIdentity(WALLET, testnet)

      expect(await ScriptIdentityService.getByWalletId(WALLET)).toHaveLength(1)
    })

    it('creates a distinct identity per network, because the deployed script differs', async () => {
      await SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)

      const onTestnet = await SlhDsaWalletService.deriveIdentity(WALLET, testnet)
      const onMainnet = await SlhDsaWalletService.deriveIdentity(WALLET, mainnet)

      expect(onTestnet.lockArgs).toBe(onMainnet.lockArgs)
      expect(onTestnet.lockCodeHash).not.toBe(onMainnet.lockCodeHash)
      expect(await ScriptIdentityService.getByWalletId(WALLET)).toHaveLength(2)
    })

    it('refuses to derive on a chain with no recorded deployment', async () => {
      await SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)

      await expect(SlhDsaWalletService.deriveIdentity(WALLET, devnet)).rejects.toThrow(/deployment|network/i)
    })
  })

  describe('secret retrieval', () => {
    it('returns secret material bound to the stored parameter set', async () => {
      await SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)

      const secret = await SlhDsaWalletService.getSecret(WALLET, PASSWORD)

      expect(secret.type).toBe('slh-dsa-secret-key')
      expect(secret.parameterSet).toBe(PARAM)
    })

    it('refuses the wrong password', async () => {
      await SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)

      await expect(SlhDsaWalletService.getSecret(WALLET, 'nope')).rejects.toThrow(/password/i)
    })

    it('reports a missing vault distinctly from a wrong password', async () => {
      await expect(SlhDsaWalletService.getSecret('no-such-wallet', PASSWORD)).rejects.toThrow(/vault|not found/i)
    })
  })

  describe('backup and recovery', () => {
    it('recovers the same key, args and address from a backup', async () => {
      // The recovery gate: backup -> secret -> public key -> args -> script.
      const created = await SlhDsaWalletService.create(
        { walletId: WALLET, parameterSet: PARAM, password: PASSWORD },
        FAST
      )
      const original = await SlhDsaWalletService.deriveIdentity(WALLET, testnet)
      const backup = SlhDsaWalletService.exportBackup(WALLET)
      const originalSecret = await SlhDsaWalletService.getSecret(WALLET, PASSWORD)

      files.clear()
      modules.clear()
      await getConnection().createQueryBuilder().delete().from(ScriptIdentityEntity).execute()

      await SlhDsaWalletService.importBackup('restored', JSON.stringify(backup))
      const restoredIdentity = await SlhDsaWalletService.deriveIdentity('restored', testnet)
      const restoredSecret = await SlhDsaWalletService.getSecret('restored', PASSWORD)

      expect(restoredSecret.secretKey).toBe(originalSecret.secretKey)
      expect(restoredIdentity.metadata).toEqual({ parameterSet: PARAM, publicKey: created.publicKey })
      expect(restoredIdentity.lockArgs).toBe(original.lockArgs)
      expect(restoredIdentity.address).toBe(original.address)
    })

    it('keeps the backup password bound to the original password', async () => {
      await SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)
      const backup = SlhDsaWalletService.exportBackup(WALLET)

      await SlhDsaWalletService.importBackup('restored', JSON.stringify(backup))

      await expect(SlhDsaWalletService.getSecret('restored', 'a different password')).rejects.toThrow(/password/i)
    })

    it('refuses to import over an existing vault', async () => {
      await SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)
      const backup = SlhDsaWalletService.exportBackup(WALLET)

      await expect(SlhDsaWalletService.importBackup(WALLET, JSON.stringify(backup))).rejects.toThrow(/already/i)
    })

    it('rejects a backup that is not a vault', async () => {
      await expect(SlhDsaWalletService.importBackup('restored', '{"hello":"world"}')).rejects.toThrow()
    })
  })

  describe('watch-only', () => {
    it('tracks an identity from a public key with no vault', async () => {
      const publicKey = `0x${'11'.repeat(32)}`

      const identity = await SlhDsaWalletService.importWatchOnly(
        { walletId: 'watch', publicKey, parameterSet: PARAM },
        testnet
      )

      expect(identity.isWatchOnly()).toBe(true)
      expect(identity.lockArgs).toBe(deriveLockArgs(PARAM, publicKey))
      expect(SlhDsaWalletService.hasVault('watch')).toBe(false)
    })

    it('cannot produce secret material for a watch-only wallet', async () => {
      await SlhDsaWalletService.importWatchOnly(
        { walletId: 'watch', publicKey: `0x${'11'.repeat(32)}`, parameterSet: PARAM },
        testnet
      )

      await expect(SlhDsaWalletService.getSecret('watch', PASSWORD)).rejects.toThrow(/vault|not found|watch/i)
    })
  })

  describe('deletion', () => {
    it('removes the vault and the identities together', async () => {
      await SlhDsaWalletService.create({ walletId: WALLET, parameterSet: PARAM, password: PASSWORD }, FAST)
      await SlhDsaWalletService.deriveIdentity(WALLET, testnet)

      await SlhDsaWalletService.delete(WALLET)

      expect(SlhDsaWalletService.hasVault(WALLET)).toBe(false)
      expect(await ScriptIdentityService.getByWalletId(WALLET)).toHaveLength(0)
    })
  })
})
