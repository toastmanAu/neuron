import { bytes } from '@ckb-lumos/lumos/codec'

/**
 * Byte-level access to a serialized `WitnessArgs`.
 *
 * `WitnessArgs.deserialize` maps an empty field to `undefined`, which erases the difference between
 * a `BytesOpt` that is absent (0 bytes on the wire) and one that is present but empty (4 bytes).
 * Those two hash differently in `CKB_TX_MESSAGE_ALL`, so anything that has to preserve a witness
 * exactly — signing it, or replacing only its lock — must work with the raw field slices instead.
 *
 * That matters wherever a transaction arrives already serialized: offline signing, and Fiber
 * external funding, where the negotiated structure must survive untouched apart from the witnesses
 * this wallet is entitled to fill in.
 */

const FIELD_COUNT = 3
const HEADER_SIZE = 4 + FIELD_COUNT * 4

export interface WitnessArgsSlices {
  /** Each slice is the field's own molecule encoding, or empty when the field is absent. */
  lock: Uint8Array
  inputType: Uint8Array
  outputType: Uint8Array
}

const uint32LE = (value: number): Uint8Array => {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, true)
  return out
}

export const readWitnessArgsSlices = (witness: string | Uint8Array): WitnessArgsSlices => {
  const buffer = typeof witness === 'string' ? bytes.bytify(witness) : witness
  if (buffer.byteLength < HEADER_SIZE) {
    throw new Error('Not a valid WitnessArgs: shorter than its own header')
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const fullSize = view.getUint32(0, true)
  const offsets = [view.getUint32(4, true), view.getUint32(8, true), view.getUint32(12, true)]

  if (fullSize !== buffer.byteLength) {
    throw new Error(`Not a valid WitnessArgs: declares ${fullSize} bytes but is ${buffer.byteLength}`)
  }
  if (offsets[0] !== HEADER_SIZE) {
    throw new Error('Not a valid WitnessArgs: first field does not start after the offset table')
  }
  if (offsets[1] < offsets[0] || offsets[2] < offsets[1] || fullSize < offsets[2]) {
    throw new Error('Not a valid WitnessArgs: offset table is not monotonic')
  }

  return {
    lock: buffer.slice(offsets[0], offsets[1]),
    inputType: buffer.slice(offsets[1], offsets[2]),
    outputType: buffer.slice(offsets[2], fullSize),
  }
}

/** Encode one `BytesOpt` field: nothing when absent, `u32le(len) || bytes` when present. */
const bytesOptSlice = (value: string | Uint8Array | undefined | null): Uint8Array => {
  if (value === undefined || value === null) {
    return new Uint8Array(0)
  }
  const raw = typeof value === 'string' ? bytes.bytify(value) : value
  return bytes.concat(uint32LE(raw.byteLength), raw)
}

const assemble = (slices: WitnessArgsSlices): string => {
  const offset0 = HEADER_SIZE
  const offset1 = offset0 + slices.lock.byteLength
  const offset2 = offset1 + slices.inputType.byteLength
  const fullSize = offset2 + slices.outputType.byteLength

  return bytes.hexify(
    bytes.concat(
      uint32LE(fullSize),
      uint32LE(offset0),
      uint32LE(offset1),
      uint32LE(offset2),
      slices.lock,
      slices.inputType,
      slices.outputType
    )
  )
}

/**
 * Serialize a `WitnessArgs` from field values, keeping `undefined` (absent) and `'0x'` (present but
 * empty) distinct.
 */
export const buildWitnessArgs = (fields: {
  lock?: string | null
  inputType?: string | null
  outputType?: string | null
}): string =>
  assemble({
    lock: bytesOptSlice(fields.lock),
    inputType: bytesOptSlice(fields.inputType),
    outputType: bytesOptSlice(fields.outputType),
  })

/**
 * Replace the lock of a serialized `WitnessArgs`, copying every other field's bytes verbatim.
 *
 * Nothing is decoded and re-encoded, so a field that was present but empty stays present but empty.
 */
export const replaceWitnessArgsLock = (witness: string | Uint8Array, lock: string): string => {
  const slices = readWitnessArgsSlices(witness)
  return assemble({ ...slices, lock: bytesOptSlice(lock) })
}
