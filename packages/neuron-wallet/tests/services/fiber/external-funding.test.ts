import 'dotenv/config'
import FiberExternalFundingService, {
  ownedInputIndices,
  withFundingTxWitnesses,
} from '../../../src/services/fiber/external-funding'
import { FundingStructureChanged } from '../../../src/services/fiber/funding-structure'
import Script, { ScriptHashType } from '../../../src/models/chain/script'

const OURS = { code_hash: `0x${'bb'.repeat(32)}`, hash_type: 'type', args: '0x1234' }
const THEIRS = { code_hash: `0x${'cc'.repeat(32)}`, hash_type: 'data1', args: '0x5678' }

const unsignedTx = () => ({
  version: '0x0',
  cell_deps: [{ out_point: { tx_hash: `0x${'aa'.repeat(32)}`, index: '0x0' }, dep_type: 'dep_group' }],
  header_deps: [] as string[],
  inputs: [
    { since: '0x0', previous_output: { tx_hash: `0x${'11'.repeat(32)}`, index: '0x0' } },
    { since: '0x0', previous_output: { tx_hash: `0x${'22'.repeat(32)}`, index: '0x0' } },
    { since: '0x0', previous_output: { tx_hash: `0x${'33'.repeat(32)}`, index: '0x0' } },
  ],
  outputs: [{ capacity: '0x2540be400', lock: OURS, type: null }],
  outputs_data: ['0x'],
  witnesses: ['0x', '0x', '0x'],
})

// Input 0 and 2 are ours, input 1 belongs to the peer.
const resolvedLocks = [OURS, THEIRS, OURS].map(s => new Script(s.code_hash, s.args, s.hash_type as ScriptHashType))
const ourLock = new Script(OURS.code_hash, OURS.args, OURS.hash_type as ScriptHashType)

describe('ownedInputIndices', () => {
  it('selects only the inputs guarded by a lock we own', () => {
    expect(ownedInputIndices(resolvedLocks, [ourLock])).toEqual([0, 2])
  })

  it('selects nothing when none of the inputs are ours', () => {
    const theirLock = new Script(THEIRS.code_hash, THEIRS.args, THEIRS.hash_type as ScriptHashType)

    expect(ownedInputIndices([theirLock], [ourLock])).toEqual([])
  })

  it('does not match on code hash alone', () => {
    // Same lock script code, different owner. Signing it would be signing someone else's cell.
    const sameCodeDifferentArgs = new Script(OURS.code_hash, '0xdead', ScriptHashType.Type)

    expect(ownedInputIndices([sameCodeDifferentArgs], [ourLock])).toEqual([])
  })
})

describe('withFundingTxWitnesses', () => {
  it('replaces only the witnesses it is given', () => {
    const signed = withFundingTxWitnesses(
      unsignedTx(),
      new Map([
        [0, '0xaaaa'],
        [2, '0xbbbb'],
      ])
    )

    expect(signed.witnesses).toEqual(['0xaaaa', '0x', '0xbbbb'])
  })

  it('leaves the peer witness byte-identical', () => {
    const original = unsignedTx()
    original.witnesses[1] = '0xpeerwitness'

    const signed = withFundingTxWitnesses(original, new Map([[0, '0xaaaa']]))

    expect(signed.witnesses[1]).toBe('0xpeerwitness')
  })

  it('does not mutate the transaction it was given', () => {
    const original = unsignedTx()

    withFundingTxWitnesses(original, new Map([[0, '0xaaaa']]))

    expect(original.witnesses[0]).toBe('0x')
  })

  it('carries every frozen field through untouched', () => {
    const original = unsignedTx()

    const signed = withFundingTxWitnesses(original, new Map([[0, '0xaaaa']]))

    expect(signed.inputs).toEqual(original.inputs)
    expect(signed.outputs).toEqual(original.outputs)
    expect(signed.outputs_data).toEqual(original.outputs_data)
    expect(signed.cell_deps).toEqual(original.cell_deps)
    expect(signed.version).toBe(original.version)
  })

  it('refuses a witness index the transaction does not have', () => {
    expect(() => withFundingTxWitnesses(unsignedTx(), new Map([[9, '0xaaaa']]))).toThrow(/index/i)
  })
})

describe('FiberExternalFundingService', () => {
  const clientFor = (results: Record<string, unknown>) => ({
    url: 'http://node.invalid:8227',
    call: jest.fn().mockImplementation((method: string) => Promise.resolve(results[method])),
    isHealthy: jest.fn().mockResolvedValue(true),
  })

  describe('openChannel', () => {
    it('returns the channel id and the negotiated transaction', async () => {
      const client = clientFor({
        open_channel_with_external_funding: { channel_id: '0xchan', unsigned_funding_tx: unsignedTx() },
      })
      const service = new FiberExternalFundingService(client as never)

      const opened = await service.openChannel({
        peerPubkey: '0xpeer',
        fundingAmount: '0x2540be400',
        shutdownScript: OURS as never,
        fundingLockScript: OURS as never,
      })

      expect(opened.channelId).toBe('0xchan')
      expect(opened.unsignedFundingTx.inputs).toHaveLength(3)
    })

    it('passes the funding lock cell deps through, which custom locks need', async () => {
      // A lock deployed outside the genesis defaults — the SLH-DSA lock among them — is unusable
      // for funding unless its cell dep travels with the request.
      const client = clientFor({
        open_channel_with_external_funding: { channel_id: '0xchan', unsigned_funding_tx: unsignedTx() },
      })
      const service = new FiberExternalFundingService(client as never)
      const deps = [{ out_point: { tx_hash: `0x${'ee'.repeat(32)}`, index: '0x0' }, dep_type: 'code' }]

      await service.openChannel({
        peerPubkey: '0xpeer',
        fundingAmount: '0x2540be400',
        shutdownScript: OURS as never,
        fundingLockScript: OURS as never,
        fundingLockScriptCellDeps: deps as never,
      })

      expect(client.call).toHaveBeenCalledWith('open_channel_with_external_funding', [
        expect.objectContaining({ funding_lock_script_cell_deps: deps }),
      ])
    })

    it('rejects a response without a negotiated transaction', async () => {
      const service = new FiberExternalFundingService(
        clientFor({ open_channel_with_external_funding: { channel_id: '0xchan' } }) as never
      )

      await expect(
        service.openChannel({
          peerPubkey: '0xpeer',
          fundingAmount: '0x1',
          shutdownScript: OURS as never,
          fundingLockScript: OURS as never,
        })
      ).rejects.toThrow(/unsigned_funding_tx|transaction/i)
    })
  })

  describe('submitSigned', () => {
    it('submits a transaction whose structure is unchanged', async () => {
      const client = clientFor({
        open_channel_with_external_funding: { channel_id: '0xchan', unsigned_funding_tx: unsignedTx() },
        submit_signed_funding_tx: { channel_id: '0xchan', funding_tx_hash: '0xfund' },
      })
      const service = new FiberExternalFundingService(client as never)
      const opened = await service.openChannel({
        peerPubkey: '0xpeer',
        fundingAmount: '0x1',
        shutdownScript: OURS as never,
        fundingLockScript: OURS as never,
      })

      const signed = withFundingTxWitnesses(opened.unsignedFundingTx, new Map([[0, '0xaaaa']]))
      const result = await service.submitSigned(opened, signed)

      expect(result.fundingTxHash).toBe('0xfund')
      expect(client.call).toHaveBeenCalledWith('submit_signed_funding_tx', [
        { channel_id: '0xchan', signed_funding_tx: signed },
      ])
    })

    it('refuses to submit a transaction whose structure changed', async () => {
      // The last line of defence: whatever happened between negotiation and submission, a mutated
      // structure never reaches the peer.
      const client = clientFor({
        open_channel_with_external_funding: { channel_id: '0xchan', unsigned_funding_tx: unsignedTx() },
        submit_signed_funding_tx: { channel_id: '0xchan', funding_tx_hash: '0xfund' },
      })
      const service = new FiberExternalFundingService(client as never)
      const opened = await service.openChannel({
        peerPubkey: '0xpeer',
        fundingAmount: '0x1',
        shutdownScript: OURS as never,
        fundingLockScript: OURS as never,
      })

      const tampered = withFundingTxWitnesses(opened.unsignedFundingTx, new Map([[0, '0xaaaa']]))
      ;(tampered.outputs[0] as { capacity: string }).capacity = '0x1'

      await expect(service.submitSigned(opened, tampered)).rejects.toThrow(FundingStructureChanged)
      expect(client.call).not.toHaveBeenCalledWith('submit_signed_funding_tx', expect.anything())
    })

    it('refuses to submit when an input was added after negotiation', async () => {
      const client = clientFor({
        open_channel_with_external_funding: { channel_id: '0xchan', unsigned_funding_tx: unsignedTx() },
        submit_signed_funding_tx: { channel_id: '0xchan', funding_tx_hash: '0xfund' },
      })
      const service = new FiberExternalFundingService(client as never)
      const opened = await service.openChannel({
        peerPubkey: '0xpeer',
        fundingAmount: '0x1',
        shutdownScript: OURS as never,
        fundingLockScript: OURS as never,
      })

      const tampered = { ...opened.unsignedFundingTx }
      tampered.inputs = [...tampered.inputs, tampered.inputs[0]]

      await expect(service.submitSigned(opened, tampered)).rejects.toThrow(FundingStructureChanged)
    })
  })
})
