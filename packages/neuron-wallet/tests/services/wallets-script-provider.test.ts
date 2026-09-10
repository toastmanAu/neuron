import 'dotenv/config'
import { WalletFunctionNotSupported } from '../../src/exceptions/wallet'

const identitiesByWallet = new Map<string, unknown[]>()
jest.doMock('../../src/services/script-identities', () => ({
  __esModule: true,
  default: {
    getByWalletId: async (walletId: string) => identitiesByWallet.get(walletId) ?? [],
    deleteByWalletId: async (walletId: string) => identitiesByWallet.delete(walletId),
  },
}))
jest.doMock('../../src/services/addresses', () => ({
  deleteByWalletId: jest.fn(),
  generateAndSaveForPublicKeyQueue: { asyncPush: jest.fn() },
  generateAndSaveForExtendedKeyQueue: { asyncPush: jest.fn() },
  getNextUnusedAddressByWalletId: jest.fn(),
  getNextUnusedChangeAddressByWalletId: jest.fn(),
  getUnusedReceivingAddressesByWalletId: jest.fn(),
  getFirstAddressByWalletId: jest.fn(),
  getAddressesByWalletId: jest.fn().mockResolvedValue([]),
}))

import WalletService, { ScriptProviderWallet } from '../../src/services/wallets'
import ScriptIdentity from '../../src/models/script-identity'
import { ScriptHashType } from '../../src/models/chain/script'
import { hd } from '@ckb-lumos/lumos'
import { closeConnection, initConnection } from '../setupAndTeardown'

const PROVIDER = 'slh-dsa-fips205'

const identityFor = (walletId: string, args: string) =>
  ScriptIdentity.fromObject({
    walletId,
    providerId: PROVIDER,
    addressType: hd.AddressType.Receiving,
    addressIndex: 0,
    address: `ckt1q-${args.slice(2, 10)}`,
    lockCodeHash: `0x${'a1'.repeat(32)}`,
    lockHashType: ScriptHashType.Data1,
    lockArgs: args,
    derivationPath: `vault:${walletId}`,
    publicKey: `0x${'cd'.repeat(32)}`,
    metadata: { parameterSet: 'SLH-DSA-SHA2-128s' },
  })

describe('provider-backed wallets', () => {
  let walletService: WalletService

  beforeAll(async () => {
    await initConnection()
  })

  afterAll(async () => {
    await closeConnection()
  })

  beforeEach(() => {
    identitiesByWallet.clear()
    walletService = new WalletService()
    walletService.clearAll()
  })

  const createPq = (name: string) => walletService.create({ id: '', name, extendedKey: '', lockProviderId: PROVIDER })

  describe('creation', () => {
    it('creates a wallet with no extended key and no keystore', () => {
      const wallet = createPq('pq one')

      expect(wallet.name).toBe('pq one')
      expect(wallet.getLockProviderId()).toBe(PROVIDER)
      expect(walletService.getAll()).toHaveLength(1)
    })

    it('loads back as a provider-backed wallet', () => {
      const created = createPq('pq one')

      expect(walletService.get(created.id)).toBeInstanceOf(ScriptProviderWallet)
    })

    it('is neither a hardware nor an HD wallet', () => {
      const wallet = walletService.get(createPq('pq one').id)

      expect(wallet.isHardware()).toBe(false)
      expect(wallet.isHDWallet()).toBe(false)
    })

    it('does not treat two provider wallets as duplicates of each other', () => {
      // Duplicate detection keys off the extended public key, which these do not have. Without a
      // carve-out every provider-backed wallet would look like a duplicate of the first one.
      createPq('pq one')

      expect(() => createPq('pq two')).not.toThrow()
      expect(walletService.getAll()).toHaveLength(2)
    })

    it('still rejects a duplicate name', () => {
      createPq('pq one')

      expect(() => createPq('pq one')).toThrow(/name/i)
    })

    it('survives a round trip through stored JSON', () => {
      const created = createPq('pq one')

      const stored = walletService.getAll().find(w => w.id === created.id)!

      expect(stored.lockProviderId).toBe(PROVIDER)
    })
  })

  describe('addresses', () => {
    it('reports the identities the wallet actually has', async () => {
      const wallet = walletService.get(createPq('pq one').id) as ScriptProviderWallet
      identitiesByWallet.set(wallet.id, [identityFor(wallet.id, `0x${'11'.repeat(32)}`)])

      const identities = await wallet.getScriptIdentities()

      expect(identities).toHaveLength(1)
      expect(identities[0].lockArgs).toBe(`0x${'11'.repeat(32)}`)
    })

    it('reports no HD addresses, because it has none', async () => {
      // Honest rather than convenient: an SLH-DSA wallet has no blake160-shaped address, and
      // inventing one would feed a secp script into every consumer that reads that field.
      const wallet = walletService.get(createPq('pq one').id)

      await expect(wallet.getAllAddresses()).resolves.toEqual([])
    })

    it('generating HD addresses is a no-op rather than an error', async () => {
      // WalletService.create calls this for every wallet; identities are created by the SLH-DSA
      // wallet service instead.
      const wallet = walletService.get(createPq('pq one').id)

      await expect(wallet.checkAndGenerateAddresses()).resolves.toBeUndefined()
    })

    it.each(['getNextAddress', 'getNextChangeAddress', 'getNextReceivingAddresses'] as const)(
      'refuses %s, which only means something for an HD wallet',
      async method => {
        const wallet = walletService.get(createPq('pq one').id)

        await expect(wallet[method]()).rejects.toThrow(WalletFunctionNotSupported)
      }
    )

    it('refuses keystore operations', () => {
      const wallet = walletService.get(createPq('pq one').id)

      expect(() => wallet.loadKeystore()).toThrow(WalletFunctionNotSupported)
    })
  })

  describe('code that assumes every soft wallet has a keystore', () => {
    // `loadKeystore` throws for these wallets by design. Anything reaching for it must first ask
    // whether the wallet is provider-backed, exactly as it already asks whether it is hardware.
    // Observed in the running app: selecting a quantum-resistant wallet crashed the main process at
    // startup with an uncaught `WalletFunctionNotSupported` from the application menu.
    it('throws rather than returning an empty keystore', () => {
      const wallet = createPq('pq')

      expect(() => wallet.loadKeystore()).toThrow(/not support/i)
    })

    it('is not an HD wallet, so HD-guarded paths skip it', () => {
      const wallet = createPq('pq')

      expect(wallet.isHDWallet()).toBe(false)
    })

    it('is not a hardware wallet, so a hardware check alone does not protect those paths', () => {
      // The reason the crash happened: every guard in the code was `!wallet.isHardware()`, which is
      // true here, so a provider-backed wallet walked straight into the keystore branch.
      const wallet = createPq('pq')

      expect(wallet.isHardware()).toBe(false)
      expect(wallet.getLockProviderId()).toBe(PROVIDER)
    })
  })

  describe('deletion', () => {
    it('removes the wallet and its identities', async () => {
      const wallet = createPq('pq one')
      identitiesByWallet.set(wallet.id, [identityFor(wallet.id, `0x${'11'.repeat(32)}`)])
      createPq('pq two')

      await walletService.delete(wallet.id)

      expect(walletService.getAll().map(w => w.name)).toEqual(['pq two'])
      expect(identitiesByWallet.has(wallet.id)).toBe(false)
    })
  })

  describe('existing wallets', () => {
    it('leaves a wallet with no lock provider on the legacy path', () => {
      const mnemonic = 'tank planet champion pottery together intact quick police asset flower sudden question'
      const seed = hd.mnemonic.mnemonicToSeedSync(mnemonic)
      const master = hd.Keychain.fromSeed(seed)
      const extendedKey = new hd.AccountExtendedPublicKey(
        `0x${master.publicKey.toString('hex')}`,
        `0x${master.chainCode.toString('hex')}`
      ).serialize()

      const wallet = walletService.create({
        id: '',
        name: 'legacy',
        extendedKey,
        keystore: hd.Keystore.createEmpty(),
      })

      expect(wallet.getLockProviderId()).toBeUndefined()
      expect(wallet.isHDWallet()).toBe(true)
    })
  })
})
