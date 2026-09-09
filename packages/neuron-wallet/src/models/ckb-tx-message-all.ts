import { blake2b } from '@noble/hashes/blake2.js'
import { bytes } from '@ckb-lumos/lumos/codec'
import { serializeOutput } from '../utils/serialization'
import Script from './chain/script'
import { readWitnessArgsSlices } from './chain/witness-args-molecule'

/** Blake2b personalisation the FIPS 205 lock hashes its signing message under. */
export const CKB_TX_MESSAGE_ALL_PERSONAL = 'ckb-sphincs+-msg'

/**
 * A transaction input together with the cell it spends.
 *
 * `CKB_TX_MESSAGE_ALL` commits to the *content* of every input cell, not just to the outpoint, so
 * this message cannot be produced from an unresolved transaction. That is a real difference from
 * secp sighash-all, which needs only the transaction hash.
 */
export interface ResolvedInput {
  capacity: string
  lock: Script
  type?: Script | null
  data: string
}

export interface CkbTxMessageAllParams {
  txHash: string
  resolvedInputs: readonly ResolvedInput[]
  /** Serialized witnesses, in transaction order. */
  witnesses: readonly string[]
  /** Index of any input belonging to the script group being signed. */
  scriptGroupIndex: number
}

const uint32LE = (value: number): Uint8Array => {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, true)
  return out
}

const cellOutputBytes = (input: ResolvedInput): Uint8Array =>
  bytes.bytify(
    serializeOutput({
      capacity: input.capacity,
      lock: input.lock.toSDK(),
      type: input.type ? input.type.toSDK() : null,
    })
  )

const sameScript = (a: Script, b: Script): boolean =>
  a.codeHash === b.codeHash && a.hashType === b.hashType && a.args === b.args

/**
 * Compute the `CKB_TX_MESSAGE_ALL` signing message for one script group.
 *
 * Mirrors `generate_ckb_tx_message_all` in nervosnetwork/quantum-resistant-lock-script's
 * `ckb-fips205-utils`, which is what the deployed lock verifies against. Hashed, in order:
 *
 * 1. the transaction hash;
 * 2. for every input, the spent cell's `CellOutput` molecule followed by `u32le(len) || data`;
 * 3. the group's first witness, contributing only its `input_type` and `output_type` molecule
 *    slices, each length prefixed — the `lock` field is **not** hashed, which is why a signature can
 *    be written into the witness afterwards without invalidating the message;
 * 4. the group's remaining witnesses, length prefixed;
 * 5. any witnesses beyond the input count, length prefixed.
 */
const ckbTxMessageAll = ({ txHash, resolvedInputs, witnesses, scriptGroupIndex }: CkbTxMessageAllParams): string => {
  const groupLock = resolvedInputs[scriptGroupIndex]?.lock
  if (!groupLock) {
    throw new Error(`No input at script group index ${scriptGroupIndex}`)
  }

  const groupIndices = resolvedInputs.reduce<number[]>((indices, input, index) => {
    if (sameScript(input.lock, groupLock)) {
      indices.push(index)
    }
    return indices
  }, [])

  const firstGroupWitness = witnesses[groupIndices[0]]
  if (firstGroupWitness === undefined) {
    throw new Error(`No witness at index ${groupIndices[0]} for the script group being signed`)
  }
  const firstWitnessSlices = readWitnessArgsSlices(firstGroupWitness)

  const hasher = blake2b.create({
    dkLen: 32,
    personalization: new TextEncoder().encode(CKB_TX_MESSAGE_ALL_PERSONAL),
  })

  hasher.update(bytes.bytify(txHash))

  resolvedInputs.forEach(input => {
    hasher.update(cellOutputBytes(input))
    const data = bytes.bytify(input.data)
    hasher.update(uint32LE(data.byteLength))
    hasher.update(data)
  })

  hasher.update(uint32LE(firstWitnessSlices.inputType.byteLength))
  hasher.update(firstWitnessSlices.inputType)
  hasher.update(uint32LE(firstWitnessSlices.outputType.byteLength))
  hasher.update(firstWitnessSlices.outputType)

  groupIndices.slice(1).forEach(index => {
    const witness = witnesses[index]
    if (witness === undefined) {
      return
    }
    const witnessBytes = bytes.bytify(witness)
    hasher.update(uint32LE(witnessBytes.byteLength))
    hasher.update(witnessBytes)
  })

  witnesses.slice(resolvedInputs.length).forEach(witness => {
    const witnessBytes = bytes.bytify(witness)
    hasher.update(uint32LE(witnessBytes.byteLength))
    hasher.update(witnessBytes)
  })

  return bytes.hexify(hasher.digest())
}

export default ckbTxMessageAll
