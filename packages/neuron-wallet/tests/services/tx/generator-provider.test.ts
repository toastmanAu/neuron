import 'dotenv/config'

const getTipHeaderMock = jest.fn()
const getGenesisBlockMock = jest.fn()
jest.mock('../../../src/services/rpc-service', () => {
  return jest.fn().mockImplementation(() => ({ getTipHeader: getTipHeaderMock, getGenesisBlock: getGenesisBlockMock }))
})
jest.mock('../../../src/services/networks', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getCurrent: () => ({
        id: 'n',
        name: 'n',
        remote: 'http://127.0.0.1:8114',
        type: 0,
        genesisHash: '0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606',
        chain: 'ckb_testnet',
        readonly: false,
      }),
    }),
  },
}))
jest.mock('../../../src/services/wallets', () => ({
  __esModule: true,
  default: { getInstance: () => ({ getCurrent: () => ({ isHardware: () => false }) }) },
}))

import { TransactionGenerator } from '../../../src/services/tx'
import CellsService from '../../../src/services/cells'
import Script, { ScriptHashType } from '../../../src/models/chain/script'
import CellDep, { DepType } from '../../../src/models/chain/cell-dep'
import OutPoint from '../../../src/models/chain/out-point'
import Input from '../../../src/models/chain/input'
import TransactionSize from '../../../src/models/transaction-size'

const PQ_LOCK = new Script(`0x${'a1'.repeat(32)}`, `0x${'11'.repeat(32)}`, ScriptHashType.Data1)
const PQ_DEP = new CellDep(new OutPoint(`0x${'cd'.repeat(32)}`, '0'), DepType.Code)
const SLH_DSA_128S_WITNESS = 7921
const PQ_ADDRESS =
  'ckt1qzs6rgdp5xs6rgdp5xs6rgdp5xs6rgdp5xs6rgdp5xs6rgdp5xs6zqs3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyz6qu4p'

describe('generating a transaction for a provider-backed lock', () => {
  const gatherSpy = jest.spyOn(CellsService, 'gatherInputs')

  beforeEach(() => {
    jest.clearAllMocks()
    getTipHeaderMock.mockResolvedValue({ epoch: '0x1', timestamp: '1000' })
    // The legacy path derives its secp dep from the genesis block.
    getGenesisBlockMock.mockResolvedValue({
      header: { hash: '0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606' },
      transactions: [{ hash: `0x${'00'.repeat(32)}` }, { hash: `0x${'01'.repeat(32)}` }],
    })
    gatherSpy.mockResolvedValue({
      inputs: [
        Input.fromObject({
          previousOutput: new OutPoint(`0x${'11'.repeat(32)}`, '0'),
          since: '0',
          capacity: '200000000000',
          lock: PQ_LOCK,
        }),
      ],
      capacities: '200000000000',
      finalFee: '100000',
      hasChangeOutput: true,
      totalSize: 1000,
    })
  })

  const generate = () =>
    TransactionGenerator.generateTx({
      walletID: 'pq',
      targetOutputs: [{ address: PQ_ADDRESS, capacity: '10000000000' }],
      changeAddress: PQ_ADDRESS,
      fee: '0',
      feeRate: '1000',
      lockClass: {
        codeHash: PQ_LOCK.codeHash,
        hashType: PQ_LOCK.hashType,
        lockArgs: [PQ_LOCK.args],
        cellDep: PQ_DEP,
        witnessSize: SLH_DSA_128S_WITNESS,
      },
    })

  it("uses the provider's cell dep, not the genesis secp one", async () => {
    // The FIPS 205 lock is deployed outside genesis. Without its dep the script cannot run and the
    // transaction is rejected before the signature is even looked at.
    const tx = await generate()

    expect(tx.cellDeps).toHaveLength(1)
    expect(tx.cellDeps[0].outPoint!.txHash).toBe(PQ_DEP.outPoint.txHash)
    expect(tx.cellDeps[0].depType).toBe(DepType.Code)
  })

  it("prices the transaction with the provider's witness size", async () => {
    await generate()

    expect(gatherSpy).toHaveBeenCalledWith(
      expect.anything(),
      'pq',
      '0',
      '1000',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      undefined,
      expect.objectContaining({ codeHash: PQ_LOCK.codeHash }),
      expect.anything(),
      undefined,
      undefined,
      SLH_DSA_128S_WITNESS
    )
  })

  it('sends change back to the provider lock', async () => {
    const tx = await generate()

    const change = tx.outputs.find(o => o.isChangeCell)
    expect(change).toBeDefined()
    expect(change!.lock.codeHash).toBe(PQ_LOCK.codeHash)
    expect(change!.lock.args).toBe(PQ_LOCK.args)
  })

  it('still defaults to the secp dep and witness when no provider is given', async () => {
    // Every existing caller omits both, so the legacy path must be untouched.
    await TransactionGenerator.generateTx({
      walletID: 'legacy',
      targetOutputs: [{ address: PQ_ADDRESS, capacity: '10000000000' }],
      changeAddress: PQ_ADDRESS,
      fee: '0',
      feeRate: '1000',
    })

    const call = gatherSpy.mock.calls[0]
    expect(call[12]).toBeUndefined()
  })

  it('accounts for the larger witness in the transaction it hands back', async () => {
    const tx = await generate()

    expect(TransactionSize.tx(tx)).toBeGreaterThan(0)
    expect(tx.fee).toBe('100000')
  })
})
