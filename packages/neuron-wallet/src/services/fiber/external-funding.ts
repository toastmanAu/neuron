import Script from '../../models/chain/script'
import FiberRpcClient from './rpc-client'
import { FiberScript } from './types'
import { asRecord, requireString } from './validate'
import {
  assertOnlyWitnessesChanged,
  FundingStructure,
  FundingTransactionJson,
  snapshotFundingStructure,
} from './funding-structure'

export interface OpenExternalFundingParams {
  peerPubkey: string
  fundingAmount: string
  /** Where the channel balance goes when the channel closes. Required for external funding. */
  shutdownScript: FiberScript
  /** The lock the node collects funding cells under. This wallet must be able to sign for it. */
  fundingLockScript: FiberScript
  /**
   * Cell deps the funding lock needs.
   *
   * Required for any lock deployed outside the genesis defaults — the FIPS 205 lock among them —
   * because the node builds the funding transaction and would otherwise omit the dep, leaving a
   * transaction that cannot be validated.
   */
  fundingLockScriptCellDeps?: unknown[]
  fundingUdtTypeScript?: FiberScript | null
  commitmentFeeRate?: string
  fundingFeeRate?: string
  /**
   * Serialized size of the witness this wallet will supply, in bytes.
   *
   * Given it, the funding fee rate is raised to cover a witness the node does not size for — see
   * {@link fundingFeeRateForWitnessSize}. Omit it for locks whose witness the node already prices
   * correctly, and the node's own estimate is left alone. An explicit `fundingFeeRate` wins.
   */
  fundingWitnessSize?: number
}

export interface ExternallyFundedChannel {
  channelId: string
  unsignedFundingTx: FundingTransactionJson
  /** Snapshot of the frozen fields, taken the moment the node handed the transaction over. */
  structure: FundingStructure
}

export interface SubmittedFundingTx {
  channelId: string
  fundingTxHash: string
}

/**
 * Lower bound on the serialized size of a funding transaction, in bytes.
 *
 * Deliberately an under-estimate. The compensation below divides by this number, so assuming a
 * smaller transaction yields a larger fee rate: the error always falls on the side of overpaying
 * by a fraction of a shannon per byte rather than under-paying and being rejected.
 */
export const MIN_ASSUMED_FUNDING_TX_SIZE = 500

const DEFAULT_MIN_FEE_RATE = 1000

/**
 * A funding fee rate that covers a witness the Fiber node has not budgeted for.
 *
 * The node builds and prices the funding transaction itself, sizing it against a fixed,
 * secp256k1-shaped placeholder witness. A lock whose witness is larger than that placeholder — the
 * FIPS 205 lock's runs to several kilobytes — therefore yields a transaction the node considers
 * adequately paid and the pool does not. Observed on testnet: the node budgeted 759 shannons for a
 * transaction the chain then rejected for wanting 8,587.
 *
 * `funding_fee_rate` is the one lever the caller has over that estimate, and the fee scales
 * linearly with it, so raising the rate by the ratio the missing witness represents brings the
 * budgeted fee back above the real cost. The transaction structure is untouched: the node still
 * negotiates it, and this only changes what the node sets aside for the fee before doing so.
 *
 * The witness is priced as if the node had budgeted nothing for it. That is more conservative than
 * subtracting the node's placeholder size, and it avoids depending on an internal constant of the
 * node that this wallet cannot see and does not control.
 *
 * This compensates for an upstream gap rather than fixing it — see IMPLEMENTATION_LOG.md. The
 * fix belongs in the node, which knows the funding lock (it is already given it, alongside its
 * cell deps) and could size the placeholder from it.
 *
 * @param witnessSize serialized size in bytes of the witness this wallet will supply
 * @param minFeeRate the fee rate floor to scale up from, in shannons per KB
 * @returns the fee rate as 0x-prefixed hex, for `funding_fee_rate`
 */
export const fundingFeeRateForWitnessSize = (witnessSize: number, minFeeRate = DEFAULT_MIN_FEE_RATE): string => {
  if (!Number.isInteger(witnessSize) || witnessSize < 0) {
    throw new Error(`A witness size must be a whole number of bytes, not ${witnessSize}`)
  }
  if (!Number.isInteger(minFeeRate) || minFeeRate <= 0) {
    throw new Error(`A fee rate must be a positive whole number, not ${minFeeRate}`)
  }

  const scaled = Math.ceil((minFeeRate * (MIN_ASSUMED_FUNDING_TX_SIZE + witnessSize)) / MIN_ASSUMED_FUNDING_TX_SIZE)
  return `0x${scaled.toString(16)}`
}

const fundingFeeRateFor = (witnessSize?: number): string | undefined =>
  witnessSize === undefined ? undefined : fundingFeeRateForWitnessSize(witnessSize)

const sameScript = (a: Script, b: Script): boolean =>
  a.codeHash === b.codeHash && a.hashType === b.hashType && a.args === b.args

/**
 * Which inputs this wallet is entitled to sign.
 *
 * Matched on the whole lock script, never on code hash alone: two cells can share lock code and
 * belong to different people, and signing one of those would be signing someone else's cell. Inputs
 * contributed by the peer are simply not ours to touch.
 */
export const ownedInputIndices = (inputLocks: readonly Script[], ownedLocks: readonly Script[]): number[] =>
  inputLocks.reduce<number[]>((indices, lock, index) => {
    if (ownedLocks.some(owned => sameScript(owned, lock))) {
      indices.push(index)
    }
    return indices
  }, [])

/**
 * Copy signed witnesses into the negotiated transaction.
 *
 * Returns a new object with the same frozen fields by reference and only the named witness slots
 * replaced. Nothing is rebuilt: the negotiated structure is carried across rather than
 * reconstructed, so it cannot drift even subtly.
 */
export const withFundingTxWitnesses = (
  original: FundingTransactionJson,
  signedWitnesses: ReadonlyMap<number, string>
): FundingTransactionJson => {
  signedWitnesses.forEach((_witness, index) => {
    if (index < 0 || index >= original.witnesses.length) {
      throw new Error(
        `Cannot write a witness at index ${index}: the funding transaction has ${original.witnesses.length} witnesses`
      )
    }
  })

  return {
    ...original,
    witnesses: original.witnesses.map((witness, index) => signedWitnesses.get(index) ?? witness),
  }
}

/**
 * Open and fund a Fiber channel from a wallet the node does not control.
 *
 * The node negotiates the channel and hands back a transaction whose structure both peers have
 * agreed on. This wallet fills in the witnesses for the cells it contributed and returns the same
 * transaction — never a rebuilt one — and the structure is re-checked immediately before
 * submission.
 */
export default class FiberExternalFundingService {
  private readonly client: FiberRpcClient

  constructor(client: FiberRpcClient) {
    this.client = client
  }

  public async openChannel(params: OpenExternalFundingParams): Promise<ExternallyFundedChannel> {
    const raw = asRecord(
      await this.client.call('open_channel_with_external_funding', [
        {
          pubkey: params.peerPubkey,
          funding_amount: params.fundingAmount,
          shutdown_script: params.shutdownScript,
          funding_lock_script: params.fundingLockScript,
          funding_lock_script_cell_deps: params.fundingLockScriptCellDeps,
          funding_udt_type_script: params.fundingUdtTypeScript ?? null,
          commitment_fee_rate: params.commitmentFeeRate,
          funding_fee_rate: params.fundingFeeRate ?? fundingFeeRateFor(params.fundingWitnessSize),
        },
      ]),
      'open_channel_with_external_funding'
    )

    const unsignedFundingTx = raw.unsigned_funding_tx as FundingTransactionJson | undefined
    if (!unsignedFundingTx || !Array.isArray(unsignedFundingTx.inputs)) {
      throw new Error(
        'Fiber node returned no unsigned_funding_tx from open_channel_with_external_funding, so there is nothing to sign'
      )
    }

    return {
      channelId: requireString(raw, 'channel_id', 'open_channel_with_external_funding'),
      unsignedFundingTx,
      structure: snapshotFundingStructure(unsignedFundingTx),
    }
  }

  public async submitSigned(
    channel: ExternallyFundedChannel,
    signedFundingTx: FundingTransactionJson
  ): Promise<SubmittedFundingTx> {
    // Checked here rather than only at signing time: this is the last point before the transaction
    // leaves for the peer, so anything that mutated it in between is caught by us and not by them.
    assertOnlyWitnessesChanged(channel.structure, signedFundingTx)

    const raw = asRecord(
      await this.client.call('submit_signed_funding_tx', [
        { channel_id: channel.channelId, signed_funding_tx: signedFundingTx },
      ]),
      'submit_signed_funding_tx'
    )

    return {
      channelId: requireString(raw, 'channel_id', 'submit_signed_funding_tx'),
      fundingTxHash: requireString(raw, 'funding_tx_hash', 'submit_signed_funding_tx'),
    }
  }
}
