import 'dotenv/config'
import ckbTxMessageAll, { ResolvedInput } from '../../src/models/ckb-tx-message-all'
import { serializeWitnessArgs } from '../../src/utils/serialization'
import Script, { ScriptHashType } from '../../src/models/chain/script'
import { SLH_DSA_VECTORS } from '../fixtures/slh-dsa-vectors'

const toScript = (s: { codeHash: string; hashType: string; args: string }) =>
  new Script(s.codeHash, s.args, s.hashType as ScriptHashType)

const toResolvedInput = (i: any): ResolvedInput => ({
  capacity: i.capacity,
  lock: toScript(i.lock),
  type: i.type ? toScript(i.type) : null,
  data: i.data,
})

describe('ckbTxMessageAll', () => {
  describe('against upstream Rust vectors', () => {
    SLH_DSA_VECTORS.messageAll.forEach(vector => {
      it(`reproduces the message digest for "${vector.name}"`, () => {
        const digest = ckbTxMessageAll({
          txHash: vector.txHash,
          resolvedInputs: vector.resolvedInputs.map(toResolvedInput),
          witnesses: [...vector.tx.witnesses] as string[],
          scriptGroupIndex: vector.scriptGroupIndex,
        })

        expect(digest).toBe(vector.messageDigest)
      })
    })
  })

  describe('script group selection', () => {
    const vector = SLH_DSA_VECTORS.messageAll.find(v => v.name === 'two-inputs-in-group')!
    const base = {
      txHash: vector.txHash,
      resolvedInputs: vector.resolvedInputs.map(toResolvedInput),
      witnesses: [...vector.tx.witnesses] as string[],
      scriptGroupIndex: vector.scriptGroupIndex,
    }

    it('produces a different digest when a later input in the group changes', () => {
      // Every input cell in the transaction is committed to, not just the ones in this group,
      // so a change anywhere in the resolved inputs must move the digest.
      const tampered = {
        ...base,
        resolvedInputs: base.resolvedInputs.map((input, i) => (i === 1 ? { ...input, capacity: '0x1' } : input)),
      }

      expect(ckbTxMessageAll(tampered)).not.toBe(vector.messageDigest)
    })

    it('produces a different digest when input cell data changes', () => {
      const tampered = {
        ...base,
        resolvedInputs: base.resolvedInputs.map((input, i) => (i === 0 ? { ...input, data: '0xff' } : input)),
      }

      expect(ckbTxMessageAll(tampered)).not.toBe(vector.messageDigest)
    })

    it('rejects a script group index outside the inputs', () => {
      expect(() => ckbTxMessageAll({ ...base, scriptGroupIndex: 9 })).toThrow(/script group|index/i)
    })

    it('rejects a witness count and input count that cannot be reconciled', () => {
      expect(() => ckbTxMessageAll({ ...base, witnesses: [] })).toThrow(/witness/i)
    })

    it('rejects a first group witness that is not a WitnessArgs', () => {
      expect(() => ckbTxMessageAll({ ...base, witnesses: ['0xdeadbeef', '0x'] })).toThrow(/witness/i)
    })
  })

  describe('what the digest does and does not cover', () => {
    const vector = SLH_DSA_VECTORS.messageAll.find(v => v.name === 'with-type-script-and-data')!
    const base = {
      txHash: vector.txHash,
      resolvedInputs: vector.resolvedInputs.map(toResolvedInput),
      witnesses: [...vector.tx.witnesses] as string[],
      scriptGroupIndex: vector.scriptGroupIndex,
    }

    it('ignores the lock field of the first group witness', () => {
      // The structural difference from secp sighash-all, where the zero-filled lock placeholder is
      // hashed. Here the lock is excluded, so a signature can be written into the witness without
      // invalidating the message it was made over.
      const withLock: string[] = [...base.witnesses]
      withLock[0] = serializeWitnessArgs({
        lock: `0x${'ab'.repeat(64)}`,
        inputType: `0x${'77'.repeat(8)}`,
        outputType: `0x${'88'.repeat(3)}`,
      })

      expect(ckbTxMessageAll({ ...base, witnesses: withLock })).toBe(vector.messageDigest)
    })

    it('covers the input_type field of the first group witness', () => {
      const changed: string[] = [...base.witnesses]
      changed[0] = serializeWitnessArgs({
        lock: undefined,
        inputType: `0x${'76'.repeat(8)}`,
        outputType: `0x${'88'.repeat(3)}`,
      })

      expect(ckbTxMessageAll({ ...base, witnesses: changed })).not.toBe(vector.messageDigest)
    })

    it('covers the transaction hash', () => {
      expect(ckbTxMessageAll({ ...base, txHash: `0x${'00'.repeat(32)}` })).not.toBe(vector.messageDigest)
    })
  })
})
