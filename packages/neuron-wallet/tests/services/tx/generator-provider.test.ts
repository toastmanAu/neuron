import 'dotenv/config'

const getTipHeaderMock = jest.fn()
const getGenesisBlockMock = jest.fn()
const getTransactionMock = jest.fn()
jest.mock('../../../src/services/rpc-service', () => {
  return jest.fn().mockImplementation(() => ({
    getTipHeader: getTipHeaderMock,
    getGenesisBlock: getGenesisBlockMock,
    getTransaction: getTransactionMock,
  }))
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
import Output from '../../../src/models/chain/output'
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

describe('depositing the whole balance from a provider-backed lock', () => {
  const gatherAllSpy = jest.spyOn(CellsService, 'gatherAllInputs')

  beforeEach(() => {
    jest.clearAllMocks()
    getTipHeaderMock.mockResolvedValue({ epoch: '0x0', timestamp: '0x0', number: '0x0' })
    gatherAllSpy.mockResolvedValue([
      Input.fromObject({
        previousOutput: new OutPoint(`0x${'ee'.repeat(32)}`, '0'),
        since: '0',
        capacity: '100000000000',
        lock: PQ_LOCK,
      }),
    ])
  })

  const generate = () =>
    TransactionGenerator.generateDepositAllTx('w', PQ_ADDRESS, PQ_ADDRESS, true, '0', '1000', {
      lockArgs: [PQ_LOCK.args],
      codeHash: PQ_LOCK.codeHash,
      hashType: PQ_LOCK.hashType,
      cellDep: PQ_DEP,
      witnessSize: SLH_DSA_128S_WITNESS,
    })

  it("gathers the provider's cells, not secp cells", async () => {
    // Without this the generator asks for cells under the secp code hash, finds none, and reports
    // "capacity not enough" for a wallet that is holding plenty.
    await generate().catch(() => {})

    // On the argument rather than the whole call: gatherAllInputs takes trailing optionals whose
    // values are not what this test is about.
    expect(gatherAllSpy.mock.calls[0][0]).toBe('w')
    expect(gatherAllSpy.mock.calls[0][1]).toMatchObject({
      codeHash: PQ_LOCK.codeHash,
      hashType: PQ_LOCK.hashType,
    })
    // And NO args. This assertion used to require args and so encoded the bug it was meant to
    // catch: gatherAllInputs sends any lock class carrying args to the multisig_output table, where
    // a provider wallet has no cells, and the user is told their balance is insufficient.
    expect(gatherAllSpy.mock.calls[0][1]).not.toHaveProperty('args')
  })

  it("uses the provider's cell dep", async () => {
    const tx = await generate()

    expect(tx.cellDeps.map(dep => dep.outPoint!.txHash)).toContain(PQ_DEP.outPoint!.txHash)
  })

  it('reserves enough for a cell under this lock, not for a secp cell', async () => {
    // The reserve exists so the wallet can still hold a cell afterwards. An SLH-DSA lock needs
    // 73 CKB where secp needs 61, so reserving the secp figure leaves an amount that cannot
    // become a cell.
    const tx = await generate()

    const deposited = BigInt(tx.outputs[0].capacity)
    const gathered = BigInt('100000000000')
    expect(gathered - deposited).toBeGreaterThanOrEqual(BigInt(73_00_000_000))
  })
})

describe('sending the whole balance from a provider-backed lock', () => {
  const gatherAllSpy = jest.spyOn(CellsService, 'gatherAllInputs')

  beforeEach(() => {
    jest.clearAllMocks()
    getTipHeaderMock.mockResolvedValue({ epoch: '0x0', timestamp: '0x0', number: '0x0' })
    gatherAllSpy.mockResolvedValue([
      Input.fromObject({
        previousOutput: new OutPoint(`0x${'ee'.repeat(32)}`, '0'),
        since: '0',
        capacity: '100000000000',
        lock: PQ_LOCK,
        lockHash: PQ_LOCK.computeHash(),
      }),
    ])
  })

  const generate = () =>
    TransactionGenerator.generateSendingAllTx({
      walletID: 'w',
      targetOutputs: [{ address: PQ_ADDRESS, capacity: '0' }],
      fee: '0',
      feeRate: '1000',
      lockClass: {
        lockArgs: [PQ_LOCK.args],
        codeHash: PQ_LOCK.codeHash,
        hashType: PQ_LOCK.hashType,
        cellDep: PQ_DEP,
        witnessSize: SLH_DSA_128S_WITNESS,
      },
    })

  it("gathers the provider's cells, not secp cells", async () => {
    // Without this it asks for cells under the secp code hash, finds none, and reports that the
    // wallet has nothing to send.
    await generate().catch(() => {})

    // On the argument rather than the whole call: gatherAllInputs takes trailing optionals whose
    // values are not what this test is about.
    expect(gatherAllSpy.mock.calls[0][0]).toBe('w')
    expect(gatherAllSpy.mock.calls[0][1]).toMatchObject({
      codeHash: PQ_LOCK.codeHash,
      hashType: PQ_LOCK.hashType,
    })
    // And NO args: a lock class carrying args is routed to the multisig_output table, where a
    // provider wallet has no cells, and the user is told their balance is insufficient.
    expect(gatherAllSpy.mock.calls[0][1]).not.toHaveProperty('args')
  })

  it("uses the provider's cell dep", async () => {
    const tx = await generate()

    expect(tx.cellDeps.map(dep => dep.outPoint!.txHash)).toContain(PQ_DEP.outPoint!.txHash)
  })

  it('prices the transaction with the provider witness, not a 93 byte secp one', async () => {
    // Send-max puts the entire balance in the output and subtracts the fee, so an under-counted fee
    // is not merely cheap: the transaction is rejected by the pool for underpaying.
    const tx = await generate()

    const sent = BigInt(tx.outputs[0].capacity)
    const gathered = BigInt('100000000000')
    const fee = gathered - sent
    // A 7.9 KB witness at 1000 shannons/KB is ~8000 shannons; a 93 byte one is ~200.
    expect(fee).toBeGreaterThan(BigInt(5000))
  })
})

describe('transferring an NFT held under a provider-backed lock', () => {
  const gatherSpy2 = jest.spyOn(CellsService, 'gatherInputs')
  const getLiveCellSpy = jest.spyOn(CellsService, 'getLiveCell')

  // 133 CKB is exactly MIN_NFT_CELL_SIZE, so paying the fee from the NFT cell itself would take it
  // below the floor and the generator falls through to gathering fee inputs — which is the branch
  // that builds a change output, and the one that used to build it as a secp script.
  const NFT_CAPACITY = (BigInt(133) * BigInt(10) ** BigInt(8)).toString()
  const nftOutPoint = new OutPoint(`0x${'77'.repeat(32)}`, '0')

  const lockClass = {
    lockArgs: [PQ_LOCK.args],
    codeHash: PQ_LOCK.codeHash,
    hashType: PQ_LOCK.hashType,
    cellDep: PQ_DEP,
    witnessSize: SLH_DSA_128S_WITNESS,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    getTipHeaderMock.mockResolvedValue({ epoch: '0x0', timestamp: '0x0', number: '0x0' })
    getTransactionMock.mockResolvedValue({ transaction: { outputsData: ['0x1234'] } })
    const nftCell = Output.fromObject({
      capacity: NFT_CAPACITY,
      lock: PQ_LOCK,
      type: new Script(`0x${'bb'.repeat(32)}`, '0x', ScriptHashType.Type),
      data: '0x1234',
    })
    getLiveCellSpy.mockResolvedValue(nftCell)
    gatherSpy2.mockResolvedValue({
      inputs: [
        Input.fromObject({
          previousOutput: new OutPoint(`0x${'ee'.repeat(32)}`, '0'),
          since: '0',
          capacity: '50000000000',
          lock: PQ_LOCK,
        }),
      ],
      capacities: '50000000000',
      finalFee: '1000000',
      hasChangeOutput: true,
      totalSize: 0,
    })
  })

  const generate = () =>
    TransactionGenerator.generateTransferNftTx(
      'w',
      nftOutPoint,
      Output.fromObject({ capacity: NFT_CAPACITY, lock: PQ_LOCK }),
      PQ_ADDRESS,
      PQ_ADDRESS,
      '0',
      '1000',
      undefined,
      lockClass
    )

  it("carries the provider's cell dep, without which the lock cannot run", async () => {
    const tx = await generate()

    expect(tx.cellDeps.map(d => d.outPoint!.txHash)).toContain(PQ_DEP.outPoint!.txHash)
  })

  it("prices the fee inputs with the provider's witness", async () => {
    await generate()

    // gatherInputs takes the witness size as its 13th argument; secp's 93 bytes would underpay by
    // the whole size of an SLH-DSA witness and the pool would reject the transaction.
    expect(gatherSpy2.mock.calls[0][12]).toBe(SLH_DSA_128S_WITNESS)
  })

  it('pays change back to the provider lock, not a secp script built from its args', async () => {
    // The change output used to be `SystemScriptInfo.generateSecpScript(toBlake160(changeAddress))`.
    // For a provider address `toBlake160` throws rather than allowing it, so this path reported
    // "not short address"; had it not thrown, the change would have gone somewhere unspendable.
    const tx = await generate()

    const change = tx.outputs[tx.outputs.length - 1]
    expect(change.lock.codeHash).toBe(PQ_LOCK.codeHash)
    expect(change.lock.hashType).toBe(PQ_LOCK.hashType)
    expect(change.lock.args).toBe(PQ_LOCK.args)
  })
})
