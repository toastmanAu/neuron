import 'dotenv/config'

const getWalletMock = jest.fn()

jest.mock('../../src/services/wallets', () => ({
  __esModule: true,
  default: { getInstance: () => ({ get: (...a: unknown[]) => getWalletMock(...a) }) },
  Wallet: class {},
}))

import AssetAccountService, { assertAssetAccountsUsable } from '../../src/services/asset-account-service'
import { LockProviderFeatureUnavailable } from '../../src/exceptions'

/**
 * Asset accounts and a quantum-resistant wallet.
 *
 * Unlike DAO, this is not a wiring gap. An asset account is held under the deployed
 * `anyone_can_pay` lock, whose args are a 20-byte secp public key hash and which verifies a secp
 * signature. An SLH-DSA wallet has no blake160 and cannot satisfy that lock, so the account could
 * be created and never spent. These paths must refuse, and say why.
 */
describe('asset accounts for a provider-backed wallet', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getWalletMock.mockReturnValue({
      isHardware: () => false,
      isHDWallet: () => false,
      getLockProviderId: () => 'slh-dsa-fips205',
    })
  })

  it('refuses to create one, rather than building a cell nobody can spend', async () => {
    await expect(
      AssetAccountService.generateCreateTx({
        walletID: 'pq',
        tokenID: 'CKBytes',
        symbol: 'CKB',
        accountName: 'a',
        tokenName: 'CKBytes',
        decimal: '8',
        feeRate: '1000',
        fee: '0',
      })
    ).rejects.toThrow(LockProviderFeatureUnavailable)
  })

  it('explains that the anyone-can-pay lock is the obstacle', async () => {
    // "This wallet does not support getNextReceivingAddresses function" told the user nothing they
    // could act on, and named an internal method as though it were a feature.
    await expect(
      AssetAccountService.generateCreateTx({
        walletID: 'pq',
        tokenID: 'CKBytes',
        symbol: 'CKB',
        accountName: 'a',
        tokenName: 'CKBytes',
        decimal: '8',
        feeRate: '1000',
        fee: '0',
      })
    ).rejects.toThrow(/anyone-can-pay|secp256k1/i)
  })

  it('refuses through the shared guard, which the send path uses too', () => {
    // `generateAnyoneCanPayTx` loads the account from the database before it reaches the guard, so
    // it is exercised here through the guard itself rather than behind a database.
    expect(() => assertAssetAccountsUsable('pq')).toThrow(LockProviderFeatureUnavailable)
  })

  it('leaves an ordinary wallet alone', async () => {
    // The guard must key on the lock provider, not on "not an HD wallet" — a hardware wallet is
    // also not HD and asset accounts work fine for it.
    getWalletMock.mockReturnValue({
      isHardware: () => true,
      isHDWallet: () => false,
      getLockProviderId: () => undefined,
    })

    await expect(
      AssetAccountService.generateCreateTx({
        walletID: 'hw',
        tokenID: 'CKBytes',
        symbol: 'CKB',
        accountName: 'a',
        tokenName: 'CKBytes',
        decimal: '8',
        feeRate: '1000',
        fee: '0',
      })
    ).rejects.not.toThrow(LockProviderFeatureUnavailable)
  })
})
