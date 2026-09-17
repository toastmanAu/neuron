import 'dotenv/config'

const generateDepositTxMock = jest.fn()
const generateDepositAllTxMock = jest.fn()
const startWithdrawFromDaoMock = jest.fn()
const getByWalletIdMock = jest.fn()
const getWalletMock = jest.fn()
const getCurrentNetworkMock = jest.fn()
const getTransactionMock = jest.fn()
const getHeaderMock = jest.fn()
const getLiveCellMock = jest.fn()

jest.mock('../../../src/services/tx/transaction-generator', () => ({
  TransactionGenerator: {
    generateDepositTx: (...a: unknown[]) => generateDepositTxMock(...a),
    generateDepositAllTx: (...a: unknown[]) => generateDepositAllTxMock(...a),
    startWithdrawFromDao: (...a: unknown[]) => startWithdrawFromDaoMock(...a),
  },
}))
jest.mock('../../../src/services/script-identities', () => ({
  __esModule: true,
  default: { getByWalletId: (...a: unknown[]) => getByWalletIdMock(...a) },
}))
jest.mock('../../../src/services/wallets', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({ get: (...a: unknown[]) => getWalletMock(...a), getCurrent: () => getWalletMock() }),
  },
  Wallet: class {},
}))
jest.mock('../../../src/services/networks', () => ({
  __esModule: true,
  default: { getInstance: () => ({ getCurrent: () => getCurrentNetworkMock() }) },
}))
jest.mock('../../../src/services/cells', () => ({
  __esModule: true,
  default: { getLiveCell: (...a: unknown[]) => getLiveCellMock(...a) },
}))
jest.mock('../../../src/services/rpc-service', () => ({
  __esModule: true,
  default: class {
    getTransaction = (...a: unknown[]) => getTransactionMock(...a)

    getHeader = (...a: unknown[]) => getHeaderMock(...a)
  },
}))

import TransactionSender from '../../../src/services/transaction-sender'
import ScriptIdentity from '../../../src/models/script-identity'
import { ScriptHashType } from '../../../src/models/chain/script'
import OutPoint from '../../../src/models/chain/out-point'
import { hd } from '@ckb-lumos/lumos'
import { estimateWitnessSize } from '../../../src/services/lock-providers/slh-dsa/parameter-sets'

const TESTNET_CODE_HASH = '0x147ecbb5c5127d982ee1362d2c2bb4267803da2eb006d150e88af6caaa0a7eaf'
const SLH_DSA_CELL_DEP_TX = '0x631d9a6049fb1fc3790e89d9daf35abe535b5e754cd8c3404319319710f0b106'
const PQ_ADDRESS = 'ckt1qq-pq-address'

const network = {
  id: 'n',
  name: 'n',
  remote: 'http://127.0.0.1:8114',
  type: 0,
  genesisHash: '0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606',
  chain: 'ckb_testnet',
  readonly: false,
}

const identity = ScriptIdentity.fromObject({
  walletId: 'pq',
  providerId: 'slh-dsa-fips205',
  addressType: hd.AddressType.Receiving,
  addressIndex: 0,
  address: PQ_ADDRESS,
  lockCodeHash: TESTNET_CODE_HASH,
  lockHashType: ScriptHashType.Data1,
  lockArgs: `0x${'11'.repeat(32)}`,
  derivationPath: 'vault:pq',
  publicKey: `0x${'cd'.repeat(32)}`,
  metadata: { parameterSet: 'SLH-DSA-SHA2-128s', publicKey: `0x${'cd'.repeat(32)}` },
})

const expectedLockClass = {
  codeHash: TESTNET_CODE_HASH,
  hashType: ScriptHashType.Data1,
  lockArgs: [`0x${'11'.repeat(32)}`],
  witnessSize: estimateWitnessSize('SLH-DSA-SHA2-128s'),
}

/**
 * Nervos DAO from a quantum-resistant wallet.
 *
 * Every one of these paths previously threw `WalletFunctionNotSupported`, which reached the user as
 * "This wallet does not support {name} function." Fixing the address alone is not enough: the
 * generator would then build a deposit against the *secp* cell dep and gather secp cells, find
 * none, and fail with a capacity error instead — a quieter wrong answer. The lock class has to
 * travel with the address.
 */
describe('Nervos DAO for a provider-backed wallet', () => {
  const sender = new TransactionSender()

  beforeEach(() => {
    jest.clearAllMocks()
    getCurrentNetworkMock.mockReturnValue(network)
    getWalletMock.mockReturnValue({
      isHardware: () => false,
      getLockProviderId: () => 'slh-dsa-fips205',
      getNextAddress: async () => ({ address: PQ_ADDRESS }),
      getNextChangeAddress: async () => ({ address: PQ_ADDRESS }),
    })
    getByWalletIdMock.mockResolvedValue([identity])
    generateDepositTxMock.mockResolvedValue({ hash: '0xdead' })
    generateDepositAllTxMock.mockResolvedValue({ hash: '0xdead' })
    startWithdrawFromDaoMock.mockResolvedValue({ hash: '0xdead' })
  })

  describe('deposit', () => {
    it('does not refuse the wallet', async () => {
      await expect(sender.generateDepositTx('pq', '10200000000', '0', '1000')).resolves.toBeDefined()
    })

    it("builds against the provider's lock rather than secp", async () => {
      await sender.generateDepositTx('pq', '10200000000', '0', '1000')

      const [, , receiveAddress, changeAddress, , , lockClass] = generateDepositTxMock.mock.calls[0]
      expect(lockClass).toMatchObject(expectedLockClass)
      expect(lockClass.cellDep.outPoint.txHash).toBe(SLH_DSA_CELL_DEP_TX)
      expect(receiveAddress).toBe(PQ_ADDRESS)
      expect(changeAddress).toBe(PQ_ADDRESS)
    })
  })

  describe('deposit all', () => {
    it('does not refuse the wallet', async () => {
      await expect(sender.generateDepositAllTx('pq', true, '0', '1000')).resolves.toBeDefined()
    })

    it("builds against the provider's lock rather than secp", async () => {
      await sender.generateDepositAllTx('pq', true, '0', '1000')

      const [, receiveAddress, changeAddress, , , , lockClass] = generateDepositAllTxMock.mock.calls[0]
      expect(lockClass).toMatchObject(expectedLockClass)
      expect(lockClass.cellDep.outPoint.txHash).toBe(SLH_DSA_CELL_DEP_TX)
      expect(receiveAddress).toBe(PQ_ADDRESS)
      expect(changeAddress).toBe(PQ_ADDRESS)
    })
  })

  describe('withdraw, phase one', () => {
    const depositOutPoint = new OutPoint(`0x${'ab'.repeat(32)}`, '0')
    beforeEach(() => {
      getLiveCellMock.mockResolvedValue({ capacity: '10200000000', lock: {}, type: {}, data: '0x' })
      getTransactionMock.mockResolvedValue({ txStatus: { isCommitted: () => true, blockHash: `0x${'cc'.repeat(32)}` } })
      getHeaderMock.mockResolvedValue({ number: '100', hash: `0x${'cc'.repeat(32)}` })
    })

    it('does not refuse the wallet', async () => {
      await expect(sender.startWithdrawFromDao('pq', depositOutPoint, '0', '1000')).resolves.toBeDefined()
    })

    it("builds against the provider's lock rather than secp", async () => {
      await sender.startWithdrawFromDao('pq', depositOutPoint, '0', '1000')

      const call = startWithdrawFromDaoMock.mock.calls[0]
      const lockClass = call.find(
        (arg: unknown) => typeof arg === 'object' && arg !== null && 'codeHash' in (arg as object)
      )
      expect(lockClass).toMatchObject(expectedLockClass)
      expect(call).toContain(PQ_ADDRESS)
    })
  })

  describe('a wallet with no lock provider', () => {
    it('is left on the original path', async () => {
      getWalletMock.mockReturnValue({
        isHardware: () => false,
        getLockProviderId: () => undefined,
        getNextAddress: async () => ({ address: 'ckt1q-legacy' }),
        getNextChangeAddress: async () => ({ address: 'ckt1q-legacy-change' }),
      })

      await sender.generateDepositTx('legacy', '10200000000', '0', '1000')

      const [, , receiveAddress, , , , lockClass] = generateDepositTxMock.mock.calls[0]
      expect(receiveAddress).toBe('ckt1q-legacy')
      expect(lockClass).toBeUndefined()
      expect(getByWalletIdMock).not.toHaveBeenCalled()
    })
  })
})
