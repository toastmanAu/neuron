import 'dotenv/config'

const getCurrentNetworkMock = jest.fn()
jest.mock('../../src/services/networks', () => ({
  __esModule: true,
  default: { getInstance: () => ({ getCurrent: () => getCurrentNetworkMock(), isMainnet: () => false }) },
}))

import CellsService, { LockScriptCategory } from '../../src/services/cells'
import SystemScriptInfo from '../../src/models/system-script-info'

const testnet = {
  id: 'n',
  name: 'n',
  remote: 'http://127.0.0.1:8114',
  type: 0,
  genesisHash: '0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606',
  chain: 'ckb_testnet',
  readonly: false,
}

const TESTNET_SLH_DSA_CODE_HASH = '0x147ecbb5c5127d982ee1362d2c2bb4267803da2eb006d150e88af6caaa0a7eaf'

const outputWith = (codeHash: string, hashType: string) =>
  ({
    capacity: '0x0',
    lock: { codeHash, hashType, args: `0x${'11'.repeat(32)}` },
  } as unknown as CKBComponents.CellOutput)

describe('CellsService.getCellLockType', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getCurrentNetworkMock.mockReturnValue(testnet)
  })

  it('recognises a deployed provider lock rather than calling it unknown', () => {
    // Cell Management renders an unrecognised lock as type "Unknown", so every cell in a
    // quantum-resistant wallet read Unknown where the same cell in a secp wallet reads CKB.
    expect(CellsService.getCellLockType(outputWith(TESTNET_SLH_DSA_CODE_HASH, 'data1'))).toBe(
      LockScriptCategory.LOCK_PROVIDER
    )
  })

  it('still calls a genuinely unknown lock unknown', () => {
    expect(CellsService.getCellLockType(outputWith(`0x${'99'.repeat(32)}`, 'type'))).toBe(LockScriptCategory.Unknown)
  })

  it('leaves secp alone', () => {
    expect(CellsService.getCellLockType(outputWith(SystemScriptInfo.SECP_CODE_HASH, 'type'))).toBe(
      LockScriptCategory.SECP256K1
    )
  })

  it('does not match the provider lock on another network, where it is not deployed', () => {
    // The lock is deployed under a different code hash per network; the testnet code hash is not a
    // provider lock on mainnet and must not be labelled as one.
    getCurrentNetworkMock.mockReturnValue({ ...testnet, chain: 'ckb', genesisHash: `0x${'aa'.repeat(32)}` })

    expect(CellsService.getCellLockType(outputWith(TESTNET_SLH_DSA_CODE_HASH, 'data1'))).toBe(
      LockScriptCategory.Unknown
    )
  })

  it('adds no new dependency on a current network, because it already had one', () => {
    // This asserted that a missing network yields Unknown, which was never true: the first line of
    // getCellLockType constructs AssetAccountInfo, which reads the current network's genesis hash.
    // Recording the real behaviour instead, so the registry lookup cannot be blamed for it later.
    getCurrentNetworkMock.mockReturnValue(undefined)

    expect(() => CellsService.getCellLockType(outputWith(TESTNET_SLH_DSA_CODE_HASH, 'data1'))).toThrow(/genesisHash/)
  })
})
