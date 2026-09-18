import 'dotenv/config'

// The sync layer asks the wallet store which wallets are provider backed before touching the
// database, so this stands in for that store.
const walletsMock = jest.fn()
jest.mock('../../src/services/wallets', () => ({
  __esModule: true,
  default: { getInstance: () => ({ getAll: () => walletsMock() }) },
}))

import providerSyncScripts from '../../src/block-sync-renderer/sync/provider-sync-scripts'
import ScriptIdentityService from '../../src/services/script-identities'
import ScriptIdentityModel from '../../src/models/script-identity'
import ScriptIdentityEntity from '../../src/database/chain/entities/script-identity'
import { ScriptHashType } from '../../src/models/chain/script'
import { hd } from '@ckb-lumos/lumos'
import { closeConnection, getConnection, initConnection } from '../setupAndTeardown'

const identity = (walletId: string, args: string) =>
  ScriptIdentityModel.fromObject({
    walletId,
    providerId: 'slh-dsa-fips205',
    addressType: hd.AddressType.Receiving,
    addressIndex: 0,
    address: 'ckt1qq',
    lockCodeHash: `0x${'a1'.repeat(32)}`,
    lockHashType: ScriptHashType.Data1,
    lockArgs: args,
    derivationPath: `vault:${walletId}`,
    publicKey: `0x${'cd'.repeat(32)}`,
    metadata: { parameterSet: 'SLH-DSA-SHA2-128s' },
  })

describe('providerSyncScripts', () => {
  beforeAll(async () => {
    await initConnection()
  })

  afterAll(async () => {
    await closeConnection()
  })

  beforeEach(async () => {
    await getConnection().createQueryBuilder().delete().from(ScriptIdentityEntity).execute()
    walletsMock.mockReturnValue([
      { id: 'pq', lockProviderId: 'slh-dsa-fips205' },
      { id: 'pq2', lockProviderId: 'slh-dsa-fips205' },
      { id: 'legacy' },
    ])
  })

  it('ignores the wallet store, which is unreadable from the sync process', async () => {
    // This assertion replaces one that required the wallet store to be consulted *before* the
    // database, to keep the sync path unchanged for installations with no provider-backed wallet.
    // The intent was right and the mechanism was wrong: the block-sync renderer has no
    // `electron.app`, so `env` falls back to a temp directory and `WalletService.getAll()` returns
    // nothing however many wallets exist. A funded SLH-DSA lock was never watched, and its cell was
    // scanned straight past on a real testnet sync.
    //
    // The identity table is the source of truth instead. It is empty unless a provider-backed
    // wallet has been created, so an existing installation is still unaffected — which is what the
    // old assertion was actually protecting.
    walletsMock.mockReturnValue([{ id: 'legacy' }])
    await ScriptIdentityService.save([identity('pq', `0x${'22'.repeat(32)}`)])

    const scripts = await providerSyncScripts()

    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toEqual(expect.objectContaining({ walletId: 'pq', scriptType: 'lock' }))
  })

  it('watches nothing, rather than throwing, before the database is ready', async () => {
    // Reached from sync paths that also run before a connection exists. Throwing there would break
    // syncing for every installation, provider-backed or not.
    const spy = jest.spyOn(ScriptIdentityService, 'getAll').mockRejectedValue(new Error('no connection'))

    await expect(providerSyncScripts()).resolves.toEqual([])

    spy.mockRestore()
  })

  it('returns nothing when a provider wallet has no identities yet', async () => {
    await expect(providerSyncScripts()).resolves.toEqual([])
  })

  it('returns a lock-type sync script per identity', async () => {
    await ScriptIdentityService.save([identity('pq', `0x${'11'.repeat(32)}`)])

    const scripts = await providerSyncScripts()

    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toMatchObject({
      walletId: 'pq',
      scriptType: 'lock',
      script: { codeHash: `0x${'a1'.repeat(32)}`, hashType: 'data1', args: `0x${'11'.repeat(32)}` },
    })
  })

  it('watches every identity of every provider-backed wallet', async () => {
    await ScriptIdentityService.save([
      identity('pq', `0x${'11'.repeat(32)}`),
      identity('pq', `0x${'22'.repeat(32)}`),
      identity('pq2', `0x${'33'.repeat(32)}`),
    ])

    const scripts = await providerSyncScripts()

    expect(scripts).toHaveLength(3)
    expect(new Set(scripts.map(s => s.walletId))).toEqual(new Set(['pq', 'pq2']))
  })

  it('watches the whole lock script, not just its args', async () => {
    // The args of a FIPS 205 lock are a hash; watching by args alone would miss the code hash that
    // makes the script what it is, and could match an unrelated lock on another network.
    await ScriptIdentityService.save([identity('pq', `0x${'11'.repeat(32)}`)])

    const [entry] = await providerSyncScripts()

    expect(entry.script.codeHash).toBeTruthy()
    expect(entry.script.hashType).toBeTruthy()
  })

  it('can be filtered to one wallet', async () => {
    await ScriptIdentityService.save([identity('pq', `0x${'11'.repeat(32)}`), identity('pq2', `0x${'33'.repeat(32)}`)])

    const scripts = await providerSyncScripts(['pq2'])

    expect(scripts.map(s => s.walletId)).toEqual(['pq2'])
  })
})
