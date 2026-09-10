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

  it('does not touch the database when no wallet is provider backed', async () => {
    // Every existing installation is in this state; the sync path must be exactly as it was.
    walletsMock.mockReturnValue([{ id: 'legacy' }])
    const spy = jest.spyOn(ScriptIdentityService, 'getAll')

    await expect(providerSyncScripts()).resolves.toEqual([])
    expect(spy).not.toHaveBeenCalled()
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
