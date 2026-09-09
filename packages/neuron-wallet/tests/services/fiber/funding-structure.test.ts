import 'dotenv/config'
import {
  assertOnlyWitnessesChanged,
  snapshotFundingStructure,
  structuralSnapshot,
  FundingStructureChanged,
} from '../../../src/services/fiber/funding-structure'

/** Shape of a funding transaction as a Fiber node returns it (snake_case, hex quantities). */
const baseTx = () => ({
  version: '0x0',
  cell_deps: [{ out_point: { tx_hash: `0x${'aa'.repeat(32)}`, index: '0x0' }, dep_type: 'dep_group' }],
  header_deps: [] as string[],
  inputs: [
    { since: '0x0', previous_output: { tx_hash: `0x${'11'.repeat(32)}`, index: '0x0' } },
    { since: '0x0', previous_output: { tx_hash: `0x${'22'.repeat(32)}`, index: '0x1' } },
  ],
  outputs: [
    {
      capacity: '0x2540be400',
      lock: { code_hash: `0x${'bb'.repeat(32)}`, hash_type: 'type', args: '0x1234' },
      type: null,
    },
  ],
  outputs_data: ['0x'],
  witnesses: ['0x', '0x'],
})

describe('funding transaction structure', () => {
  describe('assertOnlyWitnessesChanged', () => {
    it('accepts a transaction whose witnesses were filled in', () => {
      const before = baseTx()
      const after = { ...baseTx(), witnesses: [`0x${'55'.repeat(85)}`, '0x'] }

      expect(() => assertOnlyWitnessesChanged(snapshotFundingStructure(before), after)).not.toThrow()
    })

    it('accepts an unchanged transaction', () => {
      expect(() => assertOnlyWitnessesChanged(snapshotFundingStructure(baseTx()), baseTx())).not.toThrow()
    })

    it.each([
      ['an input was added', (tx: ReturnType<typeof baseTx>) => tx.inputs.push(tx.inputs[0])],
      ['an input was removed', (tx: ReturnType<typeof baseTx>) => tx.inputs.pop()],
      [
        'an input outpoint changed',
        (tx: ReturnType<typeof baseTx>) => {
          tx.inputs[0].previous_output.tx_hash = `0x${'99'.repeat(32)}`
        },
      ],
      [
        'an input since changed',
        (tx: ReturnType<typeof baseTx>) => {
          tx.inputs[0].since = '0x1'
        },
      ],
      [
        'an output capacity changed',
        (tx: ReturnType<typeof baseTx>) => {
          tx.outputs[0].capacity = '0x1'
        },
      ],
      [
        'an output lock changed',
        (tx: ReturnType<typeof baseTx>) => {
          tx.outputs[0].lock.args = '0xdead'
        },
      ],
      ['an output was added', (tx: ReturnType<typeof baseTx>) => tx.outputs.push(tx.outputs[0])],
      [
        'output data changed',
        (tx: ReturnType<typeof baseTx>) => {
          tx.outputs_data[0] = '0xbeef'
        },
      ],
      ['a cell dep was added', (tx: ReturnType<typeof baseTx>) => tx.cell_deps.push(tx.cell_deps[0])],
      [
        'a cell dep changed',
        (tx: ReturnType<typeof baseTx>) => {
          tx.cell_deps[0].dep_type = 'code'
        },
      ],
      ['a header dep was added', (tx: ReturnType<typeof baseTx>) => tx.header_deps.push(`0x${'77'.repeat(32)}`)],
      [
        'the version changed',
        (tx: ReturnType<typeof baseTx>) => {
          tx.version = '0x1'
        },
      ],
    ])('rejects a transaction where %s', (_name, mutate) => {
      const before = snapshotFundingStructure(baseTx())
      const after = baseTx()
      mutate(after)

      expect(() => assertOnlyWitnessesChanged(before, after)).toThrow(FundingStructureChanged)
    })

    it('rejects a change in the number of witnesses', () => {
      // The witness count is tied to the input count, so adding one is a structural change even
      // though witnesses are the field we are allowed to fill.
      const before = snapshotFundingStructure(baseTx())
      const after = { ...baseTx(), witnesses: ['0x', '0x', '0x'] }

      expect(() => assertOnlyWitnessesChanged(before, after)).toThrow(FundingStructureChanged)
    })

    it('names the field that changed', () => {
      const before = snapshotFundingStructure(baseTx())
      const after = baseTx()
      after.outputs[0].capacity = '0x1'

      expect(() => assertOnlyWitnessesChanged(before, after)).toThrow(/output/i)
    })
  })

  describe('structuralSnapshot', () => {
    it('is insensitive to key order, which JSON round trips do not preserve', () => {
      const reordered = {
        witnesses: ['0x', '0x'],
        outputs_data: ['0x'],
        outputs: [
          {
            type: null,
            lock: { args: '0x1234', hash_type: 'type', code_hash: `0x${'bb'.repeat(32)}` },
            capacity: '0x2540be400',
          },
        ],
        inputs: baseTx().inputs,
        header_deps: [] as string[],
        cell_deps: baseTx().cell_deps,
        version: '0x0',
      }

      expect(structuralSnapshot(reordered as never)).toBe(structuralSnapshot(baseTx()))
    })

    it('ignores witnesses entirely', () => {
      const withWitnesses = { ...baseTx(), witnesses: [`0x${'55'.repeat(85)}`, `0x${'66'.repeat(85)}`] }

      expect(structuralSnapshot(withWitnesses)).toBe(structuralSnapshot(baseTx()))
    })

    it('normalises hex quantities so 0x00 and 0x0 are not treated as different structures', () => {
      const padded = { ...baseTx(), version: '0x00' }

      expect(structuralSnapshot(padded)).toBe(structuralSnapshot(baseTx()))
    })
  })
})
