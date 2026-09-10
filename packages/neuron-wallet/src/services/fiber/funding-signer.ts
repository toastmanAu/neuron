import Transaction from '../../models/chain/transaction'
import Script from '../../models/chain/script'
import WitnessArgs from '../../models/chain/witness-args'
import { serializeWitnessArgs } from '../../utils/serialization'
import { deepCamelizeKeys, snakeToCamel } from '../../utils/deep-camelize-keys'
import { ResolvedInput } from '../../models/ckb-tx-message-all'
import { Network } from '../../models/network'
import {
  getDefaultLockProviderRegistry,
  LockProviderRegistry,
  SecretMaterial,
  SigningContext,
  StructuredWitness,
} from '../lock-providers'
import { ExternallyFundedChannel, ownedInputIndices, withFundingTxWitnesses } from './external-funding'
import { assertOnlyWitnessesChanged, FundingTransactionJson } from './funding-structure'

/** One lock this wallet can sign for, with whatever its provider needs to do so. */
export interface OwnedFundingIdentity {
  lockScript: Script
  providerId: string
  /** Provider-specific data, e.g. an SLH-DSA parameter set and public key. */
  metadata?: Readonly<Record<string, unknown>>
}

export interface SignFundingParams {
  channel: ExternallyFundedChannel
  /** The spent cell for every input, in transaction order. */
  resolvedInputs: readonly ResolvedInput[]
  ownedIdentities: readonly OwnedFundingIdentity[]
  network: Network
  providers?: LockProviderRegistry
  secretFor: (providerId: string, lockScript: Script) => Promise<SecretMaterial>
}

/**
 * Hash of the negotiated funding transaction.
 *
 * Witnesses are excluded, as they are from any CKB transaction hash, which is what lets a signature
 * commit to a transaction it is about to become part of.
 */
export const fundingTransactionHash = (tx: FundingTransactionJson): string => {
  const camel = deepCamelizeKeys({ ...tx, witnesses: [] }) as CKBComponents.RawTransaction
  return Transaction.fromSDK({
    ...camel,
    // deepCamelizeKeys rewrites keys, not values, and `dep_type` carries one: the node sends
    // "dep_group" where the codec expects "depGroup".
    cellDeps: camel.cellDeps.map((dep: CKBComponents.CellDep) => ({
      ...dep,
      depType: snakeToCamel(dep.depType) as CKBComponents.DepType,
    })),
  }).computeHash()
}

/**
 * Sign the inputs this wallet contributed to an externally funded channel.
 *
 * Only our own script groups are signed, and only their witnesses are written back; the negotiated
 * structure is carried across untouched and re-asserted before returning. Inputs contributed by the
 * peer are not ours to sign, and are left exactly as they arrived.
 */
const signFundingTransaction = async ({
  channel,
  resolvedInputs,
  ownedIdentities,
  network,
  providers = getDefaultLockProviderRegistry(),
  secretFor,
}: SignFundingParams): Promise<FundingTransactionJson> => {
  const tx = channel.unsignedFundingTx

  if (resolvedInputs.length !== tx.inputs.length) {
    throw new Error(
      `Cannot sign the funding transaction: it has ${tx.inputs.length} inputs but ${resolvedInputs.length} were resolved`
    )
  }

  const inputLocks = resolvedInputs.map(input => input.lock)
  const owned = ownedInputIndices(
    inputLocks,
    ownedIdentities.map(identity => identity.lockScript)
  )
  if (owned.length === 0) {
    throw new Error(
      'None of the funding transaction inputs are guarded by a lock this wallet owns, so there is nothing for it to sign'
    )
  }

  const txHash = fundingTransactionHash(tx)
  const signedWitnesses = new Map<number, string>()

  // Inputs sharing a lock form one script group: the signature goes in the group's first witness.
  const groups = new Map<string, number[]>()
  owned.forEach(index => {
    const lockHash = inputLocks[index].computeHash()
    groups.set(lockHash, [...(groups.get(lockHash) ?? []), index])
  })

  for (const indices of groups.values()) {
    const lockScript = inputLocks[indices[0]]
    const identity = ownedIdentities.find(
      candidate =>
        candidate.lockScript.codeHash === lockScript.codeHash &&
        candidate.lockScript.hashType === lockScript.hashType &&
        candidate.lockScript.args === lockScript.args
    )!
    const provider = providers.getOrThrow(identity.providerId)

    // A provider must positively identify a script before signing it. This is a funding
    // transaction built by someone else, so the check is not a formality: if the provider does not
    // recognise the lock on this network, we do not know that we can unlock it and must not sign.
    if (!provider.supports(lockScript, network)) {
      throw new Error(
        `The ${identity.providerId} provider does not recognise the funding lock ${lockScript.codeHash} on this network, so it will not sign for it`
      )
    }

    const groupWitnesses: StructuredWitness[] = indices.map((index, position) => {
      const witness = tx.witnesses[index] ?? '0x'
      if (position === 0) {
        // The group's first witness must be structured so a lock field can be written into it.
        return witness === '0x' ? WitnessArgs.generateEmpty().toSDK() : WitnessArgs.deserialize(witness).toSDK()
      }
      return witness
    })

    const context: SigningContext = {
      transactionHash: txHash,
      lockScript,
      metadata: identity.metadata,
      witnesses: groupWitnesses,
      resolvedInputs,
    }

    const placeholder = await provider.prepareWitness(context)
    const withPlaceholder: SigningContext = {
      ...context,
      witnesses: [serializeWitnessArgs(placeholder), ...groupWitnesses.slice(1)].map((witness, position) =>
        position === 0 ? placeholder : (witness as StructuredWitness)
      ),
    }

    const signature = await provider.sign(withPlaceholder, await secretFor(identity.providerId, lockScript))
    signedWitnesses.set(indices[0], await provider.finalizeWitness(withPlaceholder, signature))
  }

  const signed = withFundingTxWitnesses(tx, signedWitnesses)

  // Belt and braces: the structure is checked again at submission, but a failure here points at
  // this function rather than at whatever ran in between.
  assertOnlyWitnessesChanged(channel.structure, signed)

  return signed
}

export default signFundingTransaction
