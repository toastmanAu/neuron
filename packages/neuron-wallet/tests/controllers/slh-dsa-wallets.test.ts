import 'dotenv/config'

const createMock = jest.fn()
const deriveIdentityMock = jest.fn()
const importWatchOnlyMock = jest.fn()
const importMnemonicMock = jest.fn()
const exportMnemonicMock = jest.fn()
const exportBackupMock = jest.fn()
const importBackupMock = jest.fn()
const walletCreateMock = jest.fn()
const walletDeleteMock = jest.fn()
const getCurrentNetworkMock = jest.fn()

jest.mock('../../src/services/slh-dsa-wallets', () => ({
  __esModule: true,
  default: {
    create: (...a: unknown[]) => createMock(...a),
    deriveIdentity: (...a: unknown[]) => deriveIdentityMock(...a),
    importWatchOnly: (...a: unknown[]) => importWatchOnlyMock(...a),
    importMnemonic: (...a: unknown[]) => importMnemonicMock(...a),
    exportMnemonic: (...a: unknown[]) => exportMnemonicMock(...a),
    exportBackup: (...a: unknown[]) => exportBackupMock(...a),
    importBackup: (...a: unknown[]) => importBackupMock(...a),
    delete: jest.fn(),
  },
}))
jest.mock('../../src/services/wallets', () => ({
  __esModule: true,
  default: { getInstance: () => ({ create: walletCreateMock, delete: walletDeleteMock }) },
}))
jest.mock('../../src/services/networks', () => ({
  __esModule: true,
  default: { getInstance: () => ({ getCurrent: () => getCurrentNetworkMock() }) },
}))

import SlhDsaWalletsController from '../../src/controllers/slh-dsa-wallets'
import { ResponseCode } from '../../src/utils/const'

const network = {
  id: 'n',
  name: 'n',
  remote: 'http://x',
  type: 1,
  genesisHash: '0xg',
  chain: 'ckb_testnet',
  readonly: false,
}

// 36 words: three BIP39 phrases. Contents do not matter here, only that the controller passes it
// through without inspecting or storing it.
const MNEMONIC = Array.from({ length: 36 }, (_, i) => `word${i}`).join(' ')

describe('SlhDsaWalletsController', () => {
  const controller = new SlhDsaWalletsController()

  beforeEach(() => {
    jest.clearAllMocks()
    getCurrentNetworkMock.mockReturnValue(network)
    walletCreateMock.mockReturnValue({ id: 'w1', name: 'pq', toJSON: () => ({ id: 'w1', name: 'pq' }) })
    createMock.mockResolvedValue({
      publicKey: `0x${'cd'.repeat(32)}`,
      parameterSet: 'SLH-DSA-SHA2-128s',
      mnemonic: MNEMONIC,
    })
    importMnemonicMock.mockResolvedValue({
      publicKey: `0x${'cd'.repeat(32)}`,
      parameterSet: 'SLH-DSA-SHA2-128s',
      mnemonic: MNEMONIC,
    })
    exportMnemonicMock.mockResolvedValue(MNEMONIC)
    deriveIdentityMock.mockResolvedValue({
      address: 'ckt1qq',
      lockArgs: `0x${'11'.repeat(32)}`,
      lockCodeHash: `0x${'a1'.repeat(32)}`,
      lockHashType: 'data1',
      addressType: 0,
      addressIndex: 0,
      providerId: 'slh-dsa-fips205',
      metadata: { parameterSet: 'SLH-DSA-SHA2-128s' },
      isWatchOnly: () => false,
    })
  })

  describe('parameterSets', () => {
    it('lists every supported set with its signature size', async () => {
      const res = await controller.getParameterSets()

      expect(res.status).toBe(ResponseCode.Success)
      expect(res.result).toHaveLength(12)
      expect(res.result!.find(p => p.name === 'SLH-DSA-SHA2-128s')).toMatchObject({
        signatureLength: 7856,
        witnessSize: 7921,
      })
    })

    it('marks the SHAKE sets as slow, because they are several times slower to sign', async () => {
      const res = await controller.getParameterSets()

      expect(res.result!.find(p => p.name === 'SLH-DSA-SHAKE-256s')!.slowSigning).toBe(true)
      expect(res.result!.find(p => p.name === 'SLH-DSA-SHA2-128s')!.slowSigning).toBe(false)
    })
  })

  describe('createWallet', () => {
    it('creates the wallet, the vault and the identity together', async () => {
      const res = await controller.createWallet({ name: 'pq', password: 'pw', parameterSet: 'SLH-DSA-SHA2-128s' })

      expect(res.status).toBe(ResponseCode.Success)
      expect(walletCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'pq', lockProviderId: 'slh-dsa-fips205' })
      )
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ walletId: 'w1', parameterSet: 'SLH-DSA-SHA2-128s' }),
        undefined
      )
      expect(deriveIdentityMock).toHaveBeenCalledWith('w1', network)
    })

    it('never returns secret material to the caller', async () => {
      const res = await controller.createWallet({ name: 'pq', password: 'pw', parameterSet: 'SLH-DSA-SHA2-128s' })

      expect(JSON.stringify(res)).not.toContain('pw')
      expect(res.result).not.toHaveProperty('secretKey')
    })

    it('rolls the wallet back if key generation fails', async () => {
      // Otherwise a wallet would be listed with no vault behind it: visible, unusable, and
      // impossible to delete cleanly.
      createMock.mockRejectedValue(new Error('disk full'))

      await expect(
        controller.createWallet({ name: 'pq', password: 'pw', parameterSet: 'SLH-DSA-SHA2-128s' })
      ).rejects.toThrow(/disk full/)
      expect(walletDeleteMock).toHaveBeenCalledWith('w1')
    })

    it('rejects an empty password', async () => {
      await expect(
        controller.createWallet({ name: 'pq', password: '', parameterSet: 'SLH-DSA-SHA2-128s' })
      ).rejects.toThrow(/password/i)
    })

    it('rejects an unknown parameter set', async () => {
      await expect(
        controller.createWallet({ name: 'pq', password: 'pw', parameterSet: 'SLH-DSA-NOPE' as never })
      ).rejects.toThrow(/parameter set/i)
    })
  })

  describe('getAddresses', () => {
    it('returns the identity as an address the renderer can show', async () => {
      deriveIdentityMock.mockResolvedValue({
        address: 'ckt1qq',
        lockArgs: `0x${'11'.repeat(32)}`,
        lockCodeHash: `0x${'a1'.repeat(32)}`,
        lockHashType: 'data1',
        addressType: 0,
        addressIndex: 0,
        providerId: 'slh-dsa-fips205',
        metadata: { parameterSet: 'SLH-DSA-SHA2-128s' },
        isWatchOnly: () => false,
      })

      const res = await controller.getAddresses({ walletID: 'w1' })

      expect(res.result).toEqual([
        expect.objectContaining({ address: 'ckt1qq', parameterSet: 'SLH-DSA-SHA2-128s', watchOnly: false }),
      ])
    })

    it('does not leak the lock args as if they were a blake160', async () => {
      const res = await controller.getAddresses({ walletID: 'w1' })

      expect(res.result![0]).not.toHaveProperty('blake160')
    })
  })

  describe('backup', () => {
    it('exports the encrypted vault', async () => {
      exportBackupMock.mockReturnValue({ version: 1, parameterSet: 'SLH-DSA-SHA2-128s', crypto: {} })

      const res = await controller.exportBackup({ walletID: 'w1' })

      expect(res.result).toMatchObject({ version: 1 })
    })

    it('imports a backup into a new wallet', async () => {
      const res = await controller.importBackup({ name: 'restored', backup: '{"version":1}' })

      expect(walletCreateMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'restored' }))
      expect(importBackupMock).toHaveBeenCalledWith('w1', '{"version":1}')
      expect(res.status).toBe(ResponseCode.Success)
    })

    it('rolls the wallet back if the backup will not import', async () => {
      importBackupMock.mockRejectedValue(new Error('not a vault'))

      await expect(controller.importBackup({ name: 'restored', backup: '{}' })).rejects.toThrow(/not a vault/)
      expect(walletDeleteMock).toHaveBeenCalledWith('w1')
    })
  })

  describe('watch-only', () => {
    it('creates a wallet that tracks a public key with no vault', async () => {
      importWatchOnlyMock.mockResolvedValue({
        address: 'ckt1qq',
        lockArgs: `0x${'11'.repeat(32)}`,
        lockCodeHash: `0x${'a1'.repeat(32)}`,
        lockHashType: 'data1',
        addressType: 0,
        addressIndex: 0,
        providerId: 'slh-dsa-fips205',
        metadata: { parameterSet: 'SLH-DSA-SHA2-128s' },
        isWatchOnly: () => true,
      })

      const res = await controller.importWatchOnly({
        name: 'watch',
        publicKey: `0x${'11'.repeat(32)}`,
        parameterSet: 'SLH-DSA-SHA2-128s',
      })

      expect(res.status).toBe(ResponseCode.Success)
      expect(importWatchOnlyMock).toHaveBeenCalledWith(
        expect.objectContaining({ walletId: 'w1', publicKey: `0x${'11'.repeat(32)}` }),
        network
      )
    })

    it('rejects a public key of the wrong length for the parameter set', async () => {
      await expect(
        controller.importWatchOnly({ name: 'watch', publicKey: '0xabcd', parameterSet: 'SLH-DSA-SHA2-128s' })
      ).rejects.toThrow(/public key/i)
    })
  })
})

describe('SlhDsaWalletsController recovery phrases', () => {
  const controller = new SlhDsaWalletsController()

  beforeEach(() => {
    jest.clearAllMocks()
    getCurrentNetworkMock.mockReturnValue(network)
    walletCreateMock.mockReturnValue({ id: 'w1', name: 'pq', toJSON: () => ({ id: 'w1', name: 'pq' }) })
    createMock.mockResolvedValue({
      publicKey: `0x${'cd'.repeat(32)}`,
      parameterSet: 'SLH-DSA-SHA2-128s',
      mnemonic: MNEMONIC,
    })
    importMnemonicMock.mockResolvedValue({
      publicKey: `0x${'cd'.repeat(32)}`,
      parameterSet: 'SLH-DSA-SHA2-128s',
      mnemonic: MNEMONIC,
    })
    exportMnemonicMock.mockResolvedValue(MNEMONIC)
    deriveIdentityMock.mockResolvedValue({
      address: 'ckt1qq',
      lockArgs: `0x${'11'.repeat(32)}`,
      lockCodeHash: `0x${'a1'.repeat(32)}`,
      lockHashType: 'data1',
      addressType: 0,
      addressIndex: 0,
      providerId: 'slh-dsa-fips205',
      metadata: { parameterSet: 'SLH-DSA-SHA2-128s' },
      isWatchOnly: () => false,
    })
  })

  it('hands the new wallet its recovery phrase', async () => {
    const { result } = await controller.createWallet({
      name: 'pq',
      password: 'a strong enough password',
      parameterSet: 'SLH-DSA-SHA2-128s',
    })

    expect(result?.mnemonic).toBe(MNEMONIC)
  })

  it('imports a wallet from a recovery phrase', async () => {
    const { status, result } = await controller.importMnemonic({
      name: 'restored',
      password: 'a strong enough password',
      parameterSet: 'SLH-DSA-SHA2-128s',
      mnemonic: MNEMONIC,
    })

    expect(status).toBe(ResponseCode.Success)
    expect(result?.id).toBe('w1')
    expect(importMnemonicMock).toHaveBeenCalledWith(
      expect.objectContaining({ walletId: 'w1', mnemonic: MNEMONIC, parameterSet: 'SLH-DSA-SHA2-128s' }),
      undefined
    )
  })

  it('does not echo the phrase back after importing it', async () => {
    // The renderer already has it; sending it back is a copy of the wallet crossing the boundary
    // for no reason, and it would end up in whatever the caller logs.
    const { result } = await controller.importMnemonic({
      name: 'restored',
      password: 'a strong enough password',
      parameterSet: 'SLH-DSA-SHA2-128s',
      mnemonic: MNEMONIC,
    })

    expect(JSON.stringify(result)).not.toContain('word0')
  })

  it('removes the wallet record if importing the phrase fails', async () => {
    importMnemonicMock.mockRejectedValue(new Error('phrase 2 of 3 is not a valid BIP39 phrase'))

    await expect(
      controller.importMnemonic({
        name: 'restored',
        password: 'a strong enough password',
        parameterSet: 'SLH-DSA-SHA2-128s',
        mnemonic: MNEMONIC,
      })
    ).rejects.toThrow(/phrase 2/)
    expect(walletDeleteMock).toHaveBeenCalledWith('w1')
  })

  it('rejects an unknown parameter set before creating anything', async () => {
    await expect(
      controller.importMnemonic({
        name: 'restored',
        password: 'a strong enough password',
        parameterSet: 'SLH-DSA-NOPE',
        mnemonic: MNEMONIC,
      })
    ).rejects.toThrow(/parameter set/i)
    expect(walletCreateMock).not.toHaveBeenCalled()
  })

  it('requires a password to import', async () => {
    await expect(
      controller.importMnemonic({
        name: 'restored',
        password: '',
        parameterSet: 'SLH-DSA-SHA2-128s',
        mnemonic: MNEMONIC,
      })
    ).rejects.toThrow(/password/i)
    expect(walletCreateMock).not.toHaveBeenCalled()
  })

  it('shows the phrase again behind the password', async () => {
    const { status, result } = await controller.exportMnemonic({ walletID: 'w1', password: 'a strong enough password' })

    expect(status).toBe(ResponseCode.Success)
    expect(result).toBe(MNEMONIC)
    expect(exportMnemonicMock).toHaveBeenCalledWith('w1', 'a strong enough password')
  })

  it('will not show the phrase without a password', async () => {
    await expect(controller.exportMnemonic({ walletID: 'w1', password: '' })).rejects.toThrow(/password/i)
    expect(exportMnemonicMock).not.toHaveBeenCalled()
  })
})
