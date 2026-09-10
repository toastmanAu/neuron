import 'dotenv/config'
import CellsService from '../../src/services/cells'
import OutputEntity from '../../src/database/chain/entities/output'
import { OutputStatus } from '../../src/models/chain/output'
import Script, { ScriptHashType } from '../../src/models/chain/script'
import ScriptIdentityService from '../../src/services/script-identities'
import ScriptIdentityModel from '../../src/models/script-identity'
import ScriptIdentityEntity from '../../src/database/chain/entities/script-identity'
import { hd } from '@ckb-lumos/lumos'
import TransactionSize from '../../src/models/transaction-size'
import { closeConnection, getConnection, initConnection } from '../setupAndTeardown'

const WALLET = 'pq-wallet'
const PQ_LOCK = new Script(`0x${'a1'.repeat(32)}`, `0x${'11'.repeat(32)}`, ScriptHashType.Data1)

/** The 128s witness: 5-byte prefix + 32-byte key + 7,856-byte signature + 28 bytes of overhead. */
const SLH_DSA_128S_WITNESS = 7921

const randomHex = () => `0x${[...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`
const toShannon = (ckb: string) => `${ckb}00000000`

const createCell = async (capacity: string, lock: Script) => {
  const output = new OutputEntity()
  output.outPointTxHash = randomHex()
  output.outPointIndex = '0'
  output.capacity = capacity
  output.lockCodeHash = lock.codeHash
  output.lockArgs = lock.args
  output.lockHashType = lock.hashType
  output.lockHash = lock.computeHash()
  output.status = OutputStatus.Live
  output.hasData = false
  await getConnection().manager.save(output)
  return output
}

describe('gathering inputs for a provider-backed lock', () => {
  beforeAll(async () => {
    await initConnection()
  })

  afterAll(async () => {
    await closeConnection()
  })

  beforeEach(async () => {
    await getConnection().createQueryBuilder().delete().from(OutputEntity).execute()
    await getConnection().createQueryBuilder().delete().from(ScriptIdentityEntity).execute()
    // The wallet's cells are found through its identities, since it has no blake160 addresses.
    await ScriptIdentityService.save([
      ScriptIdentityModel.fromObject({
        walletId: WALLET,
        providerId: 'slh-dsa-fips205',
        addressType: hd.AddressType.Receiving,
        addressIndex: 0,
        address: 'ckt1qq',
        lockCodeHash: PQ_LOCK.codeHash,
        lockHashType: PQ_LOCK.hashType,
        lockArgs: PQ_LOCK.args,
        derivationPath: `vault:${WALLET}`,
        publicKey: `0x${'cd'.repeat(32)}`,
        metadata: { parameterSet: 'SLH-DSA-SHA2-128s' },
      }),
    ])
    await createCell(toShannon('2000'), PQ_LOCK)
  })

  const lockClass = { codeHash: PQ_LOCK.codeHash, hashType: PQ_LOCK.hashType, lockArgs: [PQ_LOCK.args] }

  it('finds cells guarded by the provider lock', async () => {
    const res = await CellsService.gatherInputs(toShannon('100'), WALLET, '0', '1000', 0, 0, 0, undefined, lockClass)

    expect(res.inputs).toHaveLength(1)
    expect(res.inputs[0].lock!.codeHash).toBe(PQ_LOCK.codeHash)
  })

  it('sizes the fee with the provider witness, not a secp one', async () => {
    // The whole point. A secp witness is 93 bytes; an SLH-DSA 128s witness is 7,921. Charging the
    // secp size under-prices the transaction by nearly 8KB and the pool rejects it for min fee.
    const secpSized = await CellsService.gatherInputs(
      toShannon('100'),
      WALLET,
      '0',
      '1000',
      0,
      0,
      0,
      undefined,
      lockClass
    )
    const providerSized = await CellsService.gatherInputs(
      toShannon('100'),
      WALLET,
      '0',
      '1000',
      0,
      0,
      0,
      undefined,
      lockClass,
      [],
      undefined,
      undefined,
      SLH_DSA_128S_WITNESS
    )

    expect(providerSized.totalSize - secpSized.totalSize).toBe(SLH_DSA_128S_WITNESS - TransactionSize.secpLockWitness())
  })

  it('charges a larger fee for the larger witness', async () => {
    const secpSized = await CellsService.gatherInputs(
      toShannon('100'),
      WALLET,
      '0',
      '1000',
      0,
      0,
      0,
      undefined,
      lockClass
    )
    const providerSized = await CellsService.gatherInputs(
      toShannon('100'),
      WALLET,
      '0',
      '1000',
      0,
      0,
      0,
      undefined,
      lockClass,
      [],
      undefined,
      undefined,
      SLH_DSA_128S_WITNESS
    )

    expect(BigInt(providerSized.finalFee)).toBeGreaterThan(BigInt(secpSized.finalFee))
  })

  it('keeps the existing secp behaviour when no witness size is given', async () => {
    // Every existing caller omits it, so the default must be exactly what it was.
    const res = await CellsService.gatherInputs(toShannon('100'), WALLET, '0', '1000', 0, 0, 0, undefined, lockClass)

    expect(res.totalSize).toBe(TransactionSize.input() + TransactionSize.secpLockWitness())
  })

  it('charges the big witness once per lock group, not per input', async () => {
    // CKB signs a script group once: only the group's first witness carries a signature. Charging
    // it per input would over-price a multi-input transaction by tens of kilobytes.
    await createCell(toShannon('2000'), PQ_LOCK)

    const res = await CellsService.gatherInputs(
      toShannon('2500'),
      WALLET,
      '0',
      '1000',
      0,
      0,
      0,
      undefined,
      lockClass,
      [],
      undefined,
      undefined,
      SLH_DSA_128S_WITNESS
    )

    expect(res.inputs.length).toBeGreaterThan(1)
    expect(res.totalSize).toBe(
      TransactionSize.input() * res.inputs.length + SLH_DSA_128S_WITNESS + TransactionSize.emptyWitness()
    )
  })
})
