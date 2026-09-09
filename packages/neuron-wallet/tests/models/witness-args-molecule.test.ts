import 'dotenv/config'
import { bytes } from '@ckb-lumos/lumos/codec'
import {
  buildWitnessArgs,
  readWitnessArgsSlices,
  replaceWitnessArgsLock,
} from '../../src/models/chain/witness-args-molecule'
import { serializeWitnessArgs } from '../../src/utils/serialization'

describe('WitnessArgs molecule helpers', () => {
  it('reads back the field slices of a witness with all three fields set', () => {
    const witness = serializeWitnessArgs({ lock: '0xaabb', inputType: '0xcc', outputType: '0xddee' })

    const slices = readWitnessArgsSlices(witness)

    // Each slice is the field's own molecule encoding: u32le length followed by the bytes.
    expect(bytes.hexify(slices.lock)).toBe('0x02000000aabb')
    expect(bytes.hexify(slices.inputType)).toBe('0x01000000cc')
    expect(bytes.hexify(slices.outputType)).toBe('0x02000000ddee')
  })

  it('represents an absent field as zero bytes, not as an empty one', () => {
    const witness = serializeWitnessArgs({ lock: '0xaabb', inputType: undefined, outputType: undefined })

    const slices = readWitnessArgsSlices(witness)

    expect(slices.inputType.byteLength).toBe(0)
    expect(slices.outputType.byteLength).toBe(0)
  })

  it('distinguishes an absent field from a present but empty one', () => {
    // These hash differently in CKB_TX_MESSAGE_ALL, so collapsing them would change a signing
    // message. Neuron's WitnessArgs.deserialize cannot tell them apart, which is why this exists.
    const absent = buildWitnessArgs({ lock: undefined, inputType: undefined, outputType: undefined })
    const emptyPresent = buildWitnessArgs({ lock: undefined, inputType: '0x', outputType: undefined })

    expect(absent).not.toBe(emptyPresent)
    expect(readWitnessArgsSlices(absent).inputType.byteLength).toBe(0)
    expect(readWitnessArgsSlices(emptyPresent).inputType.byteLength).toBe(4)
  })

  it('builds bytes identical to the standard serializer for ordinary witnesses', () => {
    const fields = { lock: `0x${'11'.repeat(65)}`, inputType: '0xabcd', outputType: undefined }

    expect(buildWitnessArgs(fields)).toBe(serializeWitnessArgs(fields))
  })

  it('replaces only the lock, leaving the other field bytes untouched', () => {
    const original = serializeWitnessArgs({ lock: '0x0000', inputType: '0xcc', outputType: '0xddee' })

    const replaced = replaceWitnessArgsLock(original, `0x${'7f'.repeat(40)}`)
    const slices = readWitnessArgsSlices(replaced)

    expect(bytes.hexify(slices.inputType)).toBe('0x01000000cc')
    expect(bytes.hexify(slices.outputType)).toBe('0x02000000ddee')
    expect(bytes.hexify(slices.lock)).toBe(`0x28000000${'7f'.repeat(40)}`)
  })

  it('preserves a present but empty field across a lock replacement', () => {
    const original = buildWitnessArgs({ lock: undefined, inputType: '0x', outputType: undefined })

    const replaced = replaceWitnessArgsLock(original, '0xaa')

    expect(readWitnessArgsSlices(replaced).inputType.byteLength).toBe(4)
  })

  it('rejects a buffer whose declared size disagrees with its length', () => {
    expect(() => readWitnessArgsSlices('0xdeadbeef')).toThrow(/WitnessArgs/i)
  })

  it('rejects a buffer with a malformed offset table', () => {
    // full size 16, offsets 16/12/16 — the second offset moves backwards.
    expect(() => readWitnessArgsSlices('0x100000001000000000c0000010000000')).toThrow(/WitnessArgs/i)
  })
})
