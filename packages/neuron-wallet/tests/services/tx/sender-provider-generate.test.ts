import 'dotenv/config'

const generateTxMock = jest.fn()
const getByWalletIdMock = jest.fn()
const getWalletMock = jest.fn()
const getCurrentNetworkMock = jest.fn()

jest.mock('../../../src/services/tx/transaction-generator', () => ({
  TransactionGenerator: { generateTx: (...a: unknown[]) => generateTxMock(...a) },
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

import TransactionSender from '../../../src/services/transaction-sender'
import ScriptIdentity from '../../../src/models/script-identity'
import { ScriptHashType } from '../../../src/models/chain/script'
import { hd } from '@ckb-lumos/lumos'
import { estimateWitnessSize } from '../../../src/services/lock-providers/slh-dsa/parameter-sets'

const TESTNET_CODE_HASH = '0x147ecbb5c5127d982ee1362d2c2bb4267803da2eb006d150e88af6caaa0a7eaf'
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
  address: 'ckt1qq-pq-address',
  lockCodeHash: TESTNET_CODE_HASH,
  lockHashType: ScriptHashType.Data1,
  lockArgs: `0x${'11'.repeat(32)}`,
  derivationPath: 'vault:pq',
  publicKey: `0x${'cd'.repeat(32)}`,
  metadata: { parameterSet: 'SLH-DSA-SHA2-128s', publicKey: `0x${'cd'.repeat(32)}` },
})

describe('TransactionSender.generateTx for a provider-backed wallet', () => {
  const sender = new TransactionSender()

  beforeEach(() => {
    jest.clearAllMocks()
    getCurrentNetworkMock.mockReturnValue(network)
    getWalletMock.mockReturnValue({ isHardware: () => false, getLockProviderId: () => 'slh-dsa-fips205' })
    getByWalletIdMock.mockResolvedValue([identity])
    generateTxMock.mockResolvedValue({ hash: '0xdead' })
  })

  const generate = () =>
    sender.generateTx({
      walletID: 'pq',
      items: [{ address: 'ckt1qq-target', capacity: '10000000000' }],
      fee: '0',
      feeRate: '1000',
    })

  it("passes the provider's lock, cell dep and witness size to the generator", async () => {
    await generate()

    const args = generateTxMock.mock.calls[0][0]
    expect(args.lockClass).toMatchObject({
      codeHash: TESTNET_CODE_HASH,
      hashType: ScriptHashType.Data1,
      lockArgs: [`0x${'11'.repeat(32)}`],
      witnessSize: estimateWitnessSize('SLH-DSA-SHA2-128s'),
    })
    expect(args.lockClass.cellDep.outPoint.txHash).toBe(
      '0x631d9a6049fb1fc3790e89d9daf35abe535b5e754cd8c3404319319710f0b106'
    )
  })

  it('sends change to the wallet own address, not an HD change address', async () => {
    // getNextChangeAddress throws for a provider-backed wallet; there is no HD chain to walk.
    await generate()

    expect(generateTxMock.mock.calls[0][0].changeAddress).toBe('ckt1qq-pq-address')
  })

  it('refuses when the wallet has no identity on this network', async () => {
    // The lock is deployed per network, so an identity derived on testnet is not usable on mainnet.
    getByWalletIdMock.mockResolvedValue([])

    await expect(generate()).rejects.toThrow(/identit/i)
  })

  it('refuses when the identity does not match the deployment on this network', async () => {
    getByWalletIdMock.mockResolvedValue([
      ScriptIdentity.fromObject({ ...identity, lockCodeHash: `0x${'99'.repeat(32)}` }),
    ])

    await expect(generate()).rejects.toThrow(/identit|network/i)
  })

  it('leaves a legacy wallet on the original path', async () => {
    getWalletMock.mockReturnValue({
      isHardware: () => false,
      getLockProviderId: () => undefined,
      getNextChangeAddress: async () => ({ address: 'ckt1q-legacy-change' }),
    })

    await generate()

    expect(generateTxMock.mock.calls[0][0].lockClass).toBeUndefined()
    expect(getByWalletIdMock).not.toHaveBeenCalled()
  })
})
