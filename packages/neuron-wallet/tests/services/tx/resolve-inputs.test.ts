import 'dotenv/config'

const getLiveCellMock = jest.fn()
jest.mock('../../../src/utils/ckb-rpc', () => ({
  generateRPC: () => ({ getLiveCell: getLiveCellMock }),
}))

import resolveInputsForSigning from '../../../src/services/tx/resolve-inputs'
import Transaction from '../../../src/models/chain/transaction'
import Input from '../../../src/models/chain/input'
import OutPoint from '../../../src/models/chain/out-point'
import Script, { ScriptHashType } from '../../../src/models/chain/script'
import { Network, NetworkType, TESTNET_GENESIS_HASH } from '../../../src/models/network'

const network: Network = {
  id: 'n',
  name: 'n',
  remote: 'http://127.0.0.1:8114',
  type: NetworkType.Normal,
  genesisHash: TESTNET_GENESIS_HASH,
  chain: 'ckb_testnet',
  readonly: false,
}

const LOCK = new Script(`0x${'aa'.repeat(32)}`, `0x${'11'.repeat(32)}`, ScriptHashType.Data1)
const TYPE = new Script(`0x${'cc'.repeat(32)}`, '0x33', ScriptHashType.Type)

const txWith = (inputs: Input[]) =>
  Transaction.fromObject({ version: '0', inputs, outputs: [], outputsData: [], witnesses: [] })

const input = (index: string, lock = LOCK) =>
  Input.fromObject({ previousOutput: OutPoint.fromObject({ txHash: `0x${'01'.repeat(32)}`, index }), since: '0', lock })

const liveCell = (capacity: string, lock: Script, type: Script | null, data: string) => ({
  status: 'live',
  cell: {
    output: { capacity, lock: lock.toSDK(), type: type ? type.toSDK() : null },
    data: { content: data, hash: `0x${'00'.repeat(32)}` },
  },
})

describe('resolveInputsForSigning', () => {
  beforeEach(() => {
    getLiveCellMock.mockReset()
  })

  it('resolves every input from the chain, in transaction order', async () => {
    getLiveCellMock
      .mockResolvedValueOnce(liveCell('0x100', LOCK, null, '0x'))
      .mockResolvedValueOnce(liveCell('0x200', LOCK, TYPE, '0xdeadbeef'))

    const resolved = await resolveInputsForSigning(txWith([input('0x0'), input('0x1')]), network)

    expect(resolved).toHaveLength(2)
    expect(resolved[0].capacity).toBe('0x100')
    expect(resolved[0].type).toBeNull()
    expect(resolved[1].data).toBe('0xdeadbeef')
    expect(resolved[1].type?.codeHash).toBe(TYPE.codeHash)
  })

  it('asks the node for cell data, since the local index truncates it', async () => {
    // Neuron's transaction persistor stores only the first 65 bytes of a cell's data. The signing
    // message hashes the whole thing, so resolving from the local index would silently produce a
    // wrong signature for any cell with more data than that.
    getLiveCellMock.mockResolvedValue(liveCell('0x100', LOCK, null, '0x'))

    await resolveInputsForSigning(txWith([input('0x0')]), network)

    expect(getLiveCellMock).toHaveBeenCalledWith(expect.objectContaining({ index: '0x0' }), true)
  })

  it('preserves long cell data rather than truncating it', async () => {
    const longData = `0x${'ab'.repeat(200)}`
    getLiveCellMock.mockResolvedValue(liveCell('0x100', LOCK, null, longData))

    const [resolved] = await resolveInputsForSigning(txWith([input('0x0')]), network)

    expect(resolved.data).toBe(longData)
  })

  it('refuses to sign when a cell is not live', async () => {
    getLiveCellMock.mockResolvedValue({ status: 'dead', cell: null })

    await expect(resolveInputsForSigning(txWith([input('0x0')]), network)).rejects.toThrow(/live/i)
  })

  it('refuses to sign when the node returns nothing for an input', async () => {
    getLiveCellMock.mockResolvedValue(undefined)

    await expect(resolveInputsForSigning(txWith([input('0x0')]), network)).rejects.toThrow(/live|resolve/i)
  })

  it('refuses to sign when the resolved lock disagrees with the transaction', async () => {
    // A mismatch means the transaction was built against different chain state than we are signing
    // over. Signing anyway would commit to a cell the builder never intended to spend.
    const otherLock = new Script(`0x${'bb'.repeat(32)}`, '0x22', ScriptHashType.Type)
    getLiveCellMock.mockResolvedValue(liveCell('0x100', otherLock, null, '0x'))

    await expect(resolveInputsForSigning(txWith([input('0x0')]), network)).rejects.toThrow(/lock/i)
  })

  it('treats a missing data field as empty rather than failing', async () => {
    getLiveCellMock.mockResolvedValue({
      status: 'live',
      cell: { output: { capacity: '0x100', lock: LOCK.toSDK(), type: null }, data: null },
    })

    const [resolved] = await resolveInputsForSigning(txWith([input('0x0')]), network)

    expect(resolved.data).toBe('0x')
  })

  it('rejects an input with no previous output', async () => {
    const tx = txWith([Input.fromObject({ previousOutput: null, since: '0' })])

    await expect(resolveInputsForSigning(tx, network)).rejects.toThrow(/previous output/i)
  })
})

describe('resolveInputsForSigning from an offline context', () => {
  beforeEach(() => {
    getLiveCellMock.mockReset()
  })

  // Shape produced by rpc.paramsFormatter.toRawTransaction, which is what Neuron already writes
  // into an exported offline-signing file as `context`.
  const previousTx = (outputs: unknown[], outputsData: string[]) => ({
    version: '0x0',
    cell_deps: [],
    header_deps: [],
    inputs: [{ since: '0x0', previous_output: { tx_hash: `0x${'99'.repeat(32)}`, index: '0x0' } }],
    outputs,
    outputs_data: outputsData,
  })

  const outputForLock = (capacity: string, lock: Script, type: Script | null = null) => ({
    capacity,
    lock: { code_hash: lock.codeHash, hash_type: lock.hashType, args: lock.args },
    type: type ? { code_hash: type.codeHash, hash_type: type.hashType, args: type.args } : null,
  })

  it('resolves inputs from the exported context without contacting a node', async () => {
    const context = [previousTx([outputForLock('0x2540be400', LOCK, TYPE)], ['0xdeadbeef'])]
    const txHash = require('../../../src/models/chain/transaction')
      .default.fromSDK(require('../../../src/utils/deep-camelize-keys').deepCamelizeKeys(context[0]) as never)
      .computeHash()

    const tx = txWith([
      Input.fromObject({
        previousOutput: OutPoint.fromObject({ txHash, index: '0x0' }),
        since: '0',
        lock: LOCK,
      }),
    ])

    const resolved = await resolveInputsForSigning(tx, network, context as never)

    expect(getLiveCellMock).not.toHaveBeenCalled()
    expect(resolved[0].data).toBe('0xdeadbeef')
    expect(resolved[0].type?.codeHash).toBe(TYPE.codeHash)
  })

  it('falls back to the node when the context does not cover an input', async () => {
    getLiveCellMock.mockResolvedValue(liveCell('0x100', LOCK, null, '0x'))

    const resolved = await resolveInputsForSigning(txWith([input('0x0')]), network, [] as never)

    expect(getLiveCellMock).toHaveBeenCalledTimes(1)
    expect(resolved).toHaveLength(1)
  })

  it('rejects a context entry that does not contain the referenced output index', async () => {
    const context = [previousTx([outputForLock('0x2540be400', LOCK)], ['0x'])]
    const txHash = require('../../../src/models/chain/transaction')
      .default.fromSDK(require('../../../src/utils/deep-camelize-keys').deepCamelizeKeys(context[0]) as never)
      .computeHash()

    const tx = txWith([
      Input.fromObject({
        previousOutput: OutPoint.fromObject({ txHash, index: '0x5' }),
        since: '0',
        lock: LOCK,
      }),
    ])

    await expect(resolveInputsForSigning(tx, network, context as never)).rejects.toThrow(/index|output/i)
  })
})
