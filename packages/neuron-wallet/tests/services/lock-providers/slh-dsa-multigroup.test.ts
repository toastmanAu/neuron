import 'dotenv/config'
import SlhDsaLockProvider from '../../../src/services/lock-providers/slh-dsa/provider'
import ckbTxMessageAll from '../../../src/models/ckb-tx-message-all'
import Script, { ScriptHashType } from '../../../src/models/chain/script'
import WitnessArgs from '../../../src/models/chain/witness-args'
import { serializeWitnessArgs } from '../../../src/utils/serialization'

const CODE = '0x147ecbb5c5127d982ee1362d2c2bb4267803da2eb006d150e88af6caaa0a7eaf'
const lockA = new Script(CODE, `0x${'11'.repeat(32)}`, ScriptHashType.Data1)
const lockB = new Script(CODE, `0x${'22'.repeat(32)}`, ScriptHashType.Data1)
const PARAM = 'SLH-DSA-SHA2-128s'

// inputs: A, B, A — so group A is {0,2} and group B is {1}. Neither group is contiguous from 0.
const resolvedInputs = [
  { capacity: '0x2540be400', lock: lockA, type: null, data: '0x' },
  { capacity: '0x2540be400', lock: lockB, type: null, data: '0x' },
  { capacity: '0x2540be400', lock: lockA, type: null, data: '0x' },
]

const witnessA = serializeWitnessArgs({ lock: undefined, inputType: '0xaaaa', outputType: undefined })
const witnessB = serializeWitnessArgs({ lock: undefined, inputType: '0xbbbb', outputType: undefined })
const allWitnesses = [witnessA, witnessB, '0x']

const TX_HASH = `0x${'0f'.repeat(32)}`

describe('signing a transaction with two SLH-DSA script groups', () => {
  const provider = new SlhDsaLockProvider()

  it('hashes the second group first witness, not the transaction first witness', async () => {
    // Group B starts at input index 1. Its message must commit to witness[1]. Passing only the
    // group's own witnesses would make index 0 mean witness[1] to the caller but witness[0] to the
    // message builder, and the two disagree — silently, until the chain rejects the signature.
    const message = await provider.getSigningMessage({
      transactionHash: TX_HASH,
      lockScript: lockB,
      metadata: { parameterSet: PARAM },
      witnesses: allWitnesses,
      resolvedInputs,
    })

    const expected = ckbTxMessageAll({
      txHash: TX_HASH,
      resolvedInputs,
      witnesses: allWitnesses,
      scriptGroupIndex: 1,
    })

    expect(message).toBe(expected)
  })

  it('gives the two groups different messages', async () => {
    const messageA = await provider.getSigningMessage({
      transactionHash: TX_HASH,
      lockScript: lockA,
      metadata: { parameterSet: PARAM },
      witnesses: allWitnesses,
      resolvedInputs,
    })
    const messageB = await provider.getSigningMessage({
      transactionHash: TX_HASH,
      lockScript: lockB,
      metadata: { parameterSet: PARAM },
      witnesses: allWitnesses,
      resolvedInputs,
    })

    expect(messageA).not.toBe(messageB)
  })

  it('finalises into the group own first witness, keeping its fields', async () => {
    // Group B's witness carries inputType 0xbbbb. Writing the signature into witness[0] would put
    // it in group A's witness and leave B unsigned.
    const signature = `0x${'7f'.repeat(7856)}`
    const finalized = await provider.finalizeWitness(
      {
        transactionHash: TX_HASH,
        lockScript: lockB,
        metadata: { parameterSet: PARAM, publicKey: `0x${'cd'.repeat(32)}` },
        witnesses: allWitnesses,
        resolvedInputs,
      },
      signature
    )

    expect(WitnessArgs.deserialize(finalized).inputType).toBe('0xbbbb')
  })

  it('sizes the placeholder into the group own first witness', async () => {
    const prepared = await provider.prepareWitness({
      transactionHash: TX_HASH,
      lockScript: lockB,
      metadata: { parameterSet: PARAM },
      witnesses: allWitnesses,
      resolvedInputs,
    })

    expect(prepared.inputType).toBe('0xbbbb')
  })
})
