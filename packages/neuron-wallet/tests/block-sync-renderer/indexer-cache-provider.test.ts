import 'dotenv/config'
import { when } from 'jest-when'
import ScriptIdentity from '../../src/models/script-identity'
import { ScriptHashType } from '../../src/models/chain/script'
import { hd } from '@ckb-lumos/lumos'
import SyncInfoEntity from '../../src/database/chain/entities/sync-info'
import { closeConnection, getConnection, initConnection } from '../setupAndTeardown'

const stubbedTransactionCollectorConstructor = jest.fn()
const stubbedCellCollectorConstructor = jest.fn().mockImplementation(() => ({
  collect: () => ({ [Symbol.asyncIterator]: async function* () {} }),
}))
const stubbedIndexerConstructor = jest.fn().mockImplementation(() => ({ uri: 'http://127.0.0.1:8114' }))
const stubbedGetTipBlockNumberFn = jest.fn()
const stubbedGetTransactionFn = jest.fn()
const stubbedGetHeaderFn = jest.fn()

const rpcService = {
  url: 'http://127.0.0.1:8114',
  getTipBlockNumber: stubbedGetTipBlockNumberFn,
  getTransaction: stubbedGetTransactionFn,
  getHeader: stubbedGetHeaderFn,
}

const WALLET = 'pq'
const PQ_ARGS = `0x${'11'.repeat(32)}`
const PQ_CODE_HASH = `0x${'a1'.repeat(32)}`

const identity = ScriptIdentity.fromObject({
  walletId: WALLET,
  providerId: 'slh-dsa-fips205',
  addressType: hd.AddressType.Receiving,
  addressIndex: 0,
  address: 'ckt1qq-pq',
  lockCodeHash: PQ_CODE_HASH,
  lockHashType: ScriptHashType.Data1,
  lockArgs: PQ_ARGS,
  derivationPath: `vault:${WALLET}`,
  publicKey: `0x${'cd'.repeat(32)}`,
  metadata: { parameterSet: 'SLH-DSA-SHA2-128s' },
})

let IndexerCacheService: any

describe('indexer cache for provider-backed identities', () => {
  beforeAll(async () => {
    await initConnection()
  })

  afterAll(async () => {
    await closeConnection()
  })

  beforeEach(async () => {
    await getConnection().synchronize(true)
    jest.clearAllMocks()
    stubbedGetTipBlockNumberFn.mockResolvedValue('0x100')
    stubbedTransactionCollectorConstructor.mockReturnValue({ getTransactionHashes: jest.fn().mockReturnValue([]) })

    jest.doMock('@ckb-lumos/ckb-indexer', () => ({
      Indexer: stubbedIndexerConstructor,
      TransactionCollector: stubbedTransactionCollectorConstructor,
      CellCollector: stubbedCellCollectorConstructor,
    }))
    IndexerCacheService = require('../../src/block-sync-renderer/sync/indexer-cache-service').default
  })

  it('watches the identity lock script', async () => {
    const service = new IndexerCacheService(WALLET, [], rpcService, stubbedIndexerConstructor(), [identity])

    await service.upsertTxHashes()

    expect(stubbedTransactionCollectorConstructor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lock: expect.objectContaining({ codeHash: PQ_CODE_HASH, hashType: 'data1', args: PQ_ARGS }),
      }),
      rpcService.url,
      { includeStatus: false }
    )
  })

  it('does not derive secp, ACP or cheque variants from a provider lock', async () => {
    // Those are expansions of a blake160. A FIPS 205 lock has none, and asking the indexer for
    // scripts that cannot exist is wasted work at best.
    const service = new IndexerCacheService(WALLET, [], rpcService, stubbedIndexerConstructor(), [identity])

    await service.upsertTxHashes()

    expect(stubbedTransactionCollectorConstructor).toHaveBeenCalledTimes(1)
    expect(stubbedCellCollectorConstructor).not.toHaveBeenCalled()
  })

  it('records tx hashes it finds against the identity address', async () => {
    when(stubbedTransactionCollectorConstructor)
      .calledWith(
        expect.anything(),
        expect.objectContaining({ lock: expect.objectContaining({ args: PQ_ARGS }) }),
        rpcService.url,
        { includeStatus: false }
      )
      .mockReturnValue({ getTransactionHashes: jest.fn().mockReturnValue(['0xtx1']) })
    stubbedGetTransactionFn.mockResolvedValue({
      transaction: { hash: '0xtx1', blockNumber: '1' },
      txStatus: { status: 'committed', blockHash: '0xb1' },
    })
    stubbedGetHeaderFn.mockResolvedValue({ number: '1', hash: '0xb1', timestamp: '1' })

    const service = new IndexerCacheService(WALLET, [], rpcService, stubbedIndexerConstructor(), [identity])
    const hashes = await service.upsertTxHashes()

    expect(hashes).toEqual(['0xtx1'])
  })

  it('keeps a sync cursor per identity, keyed by its lock args', async () => {
    // The HD path keys the cursor on blake160; an identity has none, so its args stand in. Without
    // a cursor every sync would rescan from genesis.
    const service = new IndexerCacheService(WALLET, [], rpcService, stubbedIndexerConstructor(), [identity])

    await service.upsertTxHashes()

    const cursor = await getConnection()
      .getRepository(SyncInfoEntity)
      .findOneBy({ name: SyncInfoEntity.getLastCachedKey(PQ_ARGS) })
    expect(cursor).not.toBeNull()
  })

  it('is inert when a wallet has no identities', async () => {
    const service = new IndexerCacheService(WALLET, [], rpcService, stubbedIndexerConstructor(), [])

    await expect(service.upsertTxHashes()).resolves.toEqual([])
    expect(stubbedTransactionCollectorConstructor).not.toHaveBeenCalled()
  })

  it('rejects an identity belonging to another wallet', async () => {
    // Mirrors the existing guard for addresses: a cache keyed by the wrong wallet would attribute
    // someone else's transactions to this one.
    const foreign = ScriptIdentity.fromObject({ ...identity, walletId: 'someone-else' })

    expect(() => new IndexerCacheService(WALLET, [], rpcService, stubbedIndexerConstructor(), [foreign])).toThrow(
      /does not belong/i
    )
  })
})
