import 'dotenv/config'
import FiberExternalFundingService, {
  ownedInputIndices,
  withFundingTxWitnesses,
  fundingFeeRateForWitnessSize,
  MIN_ASSUMED_FUNDING_TX_SIZE,
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

    it('prices the funding transaction for the witness this wallet will supply', async () => {
      // Left to the node's own estimate, a large-witness lock produces a transaction the node
      // believes is paid for and the pool rejects. Supplying the witness size is enough for the
      // service to raise the one lever the protocol offers.
      const client = clientFor({
        open_channel_with_external_funding: { channel_id: '0xchan', unsigned_funding_tx: unsignedTx() },
      })
      const service = new FiberExternalFundingService(client as never)

      await service.openChannel({
        peerPubkey: '0xpeer',
        fundingAmount: '0x2540be400',
        shutdownScript: OURS as never,
        fundingLockScript: OURS as never,
        fundingWitnessSize: 7921,
      })

      expect(client.call).toHaveBeenCalledWith('open_channel_with_external_funding', [
        expect.objectContaining({ funding_fee_rate: fundingFeeRateForWitnessSize(7921) }),
      ])
    })

    it('lets an explicit fee rate override the computed one', async () => {
      const client = clientFor({
        open_channel_with_external_funding: { channel_id: '0xchan', unsigned_funding_tx: unsignedTx() },
      })
      const service = new FiberExternalFundingService(client as never)

      await service.openChannel({
        peerPubkey: '0xpeer',
        fundingAmount: '0x2540be400',
        shutdownScript: OURS as never,
        fundingLockScript: OURS as never,
        fundingWitnessSize: 7921,
        fundingFeeRate: '0x123',
      })

      expect(client.call).toHaveBeenCalledWith('open_channel_with_external_funding', [
        expect.objectContaining({ funding_fee_rate: '0x123' }),
      ])
    })

    it('leaves the fee rate to the node when no witness size is given', async () => {
      // The existing secp path says nothing about witness size and must keep deferring to the
      // node, whose estimate is correct for the lock it assumes.
      const client = clientFor({
        open_channel_with_external_funding: { channel_id: '0xchan', unsigned_funding_tx: unsignedTx() },
      })
      const service = new FiberExternalFundingService(client as never)

      await service.openChannel({
        peerPubkey: '0xpeer',
        fundingAmount: '0x2540be400',
        shutdownScript: OURS as never,
        fundingLockScript: OURS as never,
      })

      expect(client.call).toHaveBeenCalledWith('open_channel_with_external_funding', [
        expect.objectContaining({ funding_fee_rate: undefined }),
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

describe('fundingFeeRateForWitnessSize', () => {
  // Numbers observed on testnet, 2026-09-10, opening an SLH-DSA-funded channel against a peer.
  // The node sized the funding transaction against its own secp-shaped placeholder witness and
  // budgeted 759 shannons; the transaction actually carrying our 7,913-byte SLH-DSA witness needed
  // 8,587. Chain said: LowFeeRate, "requiring a transaction fee of at least 8587 shannons, but the
  // fee provided is only 759". Those two numbers are what this function has to bridge.
  const NODE_BUDGETED_AT_FLOOR = 759
  const CHAIN_REQUIRED = 8587
  const SLH_DSA_SHA2_128S_WITNESS = 7921

  const feeTheNodeWouldBudget = (rateHex: string) =>
    Math.floor((NODE_BUDGETED_AT_FLOOR * Number(BigInt(rateHex))) / 1000)

  it('produces a rate that clears the fee the chain actually demanded', () => {
    const rate = fundingFeeRateForWitnessSize(SLH_DSA_SHA2_128S_WITNESS)
    expect(feeTheNodeWouldBudget(rate)).toBeGreaterThanOrEqual(CHAIN_REQUIRED)
  })

  it('leaves the rate at the floor when the witness costs nothing', () => {
    expect(fundingFeeRateForWitnessSize(0)).toEqual('0x3e8')
  })

  it('barely moves for a secp-sized witness', () => {
    // A 93-byte witness against the assumed floor size is a fraction of the transaction, so a
    // secp-funded channel is not made materially more expensive by going through this path.
    const rate = Number(BigInt(fundingFeeRateForWitnessSize(93)))
    expect(rate).toBeGreaterThan(1000)
    expect(rate).toBeLessThan(1000 * 1.2)
  })

  it('grows with the witness, so slower parameter sets pay for their size', () => {
    const small = BigInt(fundingFeeRateForWitnessSize(7921))
    const large = BigInt(fundingFeeRateForWitnessSize(50000))
    expect(large).toBeGreaterThan(small)
  })

  it('honours a caller-supplied floor', () => {
    const atDefault = BigInt(fundingFeeRateForWitnessSize(7921))
    const atDouble = BigInt(fundingFeeRateForWitnessSize(7921, 2000))
    expect(atDouble).toEqual(atDefault * BigInt(2))
  })

  it('returns 0x-prefixed hex, as the Fiber RPC expects', () => {
    expect(fundingFeeRateForWitnessSize(7921)).toMatch(/^0x[0-9a-f]+$/)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])('rejects %p as a witness size', bad => {
    expect(() => fundingFeeRateForWitnessSize(bad)).toThrow(/witness size/i)
  })

  it('rejects a fee floor that is not a positive integer', () => {
    expect(() => fundingFeeRateForWitnessSize(7921, 0)).toThrow(/fee rate/i)
  })

  it('assumes a funding transaction no smaller than the floor it documents', () => {
    // The compensation is deliberately computed against a LOWER bound on transaction size: a
    // smaller assumed base makes the resulting rate larger, so the error is always in the
    // direction of overpaying by a fraction of a shannon-per-byte rather than under-paying.
    expect(MIN_ASSUMED_FUNDING_TX_SIZE).toBeLessThanOrEqual(759)
  })
})
