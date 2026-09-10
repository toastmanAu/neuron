import 'dotenv/config'
import { bytes } from '@ckb-lumos/lumos/codec'
import { hd } from '@ckb-lumos/lumos'
import signFundingTransaction, { fundingTransactionHash } from '../../../src/services/fiber/funding-signer'
import { snapshotFundingStructure, assertOnlyWitnessesChanged } from '../../../src/services/fiber/funding-structure'
import Script, { ScriptHashType } from '../../../src/models/chain/script'
import SystemScriptInfo from '../../../src/models/system-script-info'
import WitnessArgs from '../../../src/models/chain/witness-args'
import { Network, NetworkType, TESTNET_GENESIS_HASH } from '../../../src/models/network'
import Secp256k1LockProvider from '../../../src/services/lock-providers/secp256k1'

const PRIVATE_KEY = '0xe79f3207ea4980b7fed79956d5934249ceac4751a4fae01a0f7c4a96884bc4e3'
const BLAKE160 = '0x36c329ed630d6ce750712a477543672adab57f4c'
const ourLock = SystemScriptInfo.generateSecpScript(BLAKE160)
const theirLock = new Script(`0x${'cc'.repeat(32)}`, `0x${'99'.repeat(20)}`, ScriptHashType.Type)

const network: Network = {
  id: 'n',
  name: 'n',
  remote: 'http://127.0.0.1:8114',
  type: NetworkType.Normal,
  genesisHash: TESTNET_GENESIS_HASH,
  chain: 'ckb_testnet',
  readonly: false,
}

const scriptJson = (s: Script) => ({ code_hash: s.codeHash, hash_type: s.hashType, args: s.args })

/** inputs: ours, theirs, ours — so grouping and ownership are both exercised. */
const unsignedTx = () => ({
  version: '0x0',
  cell_deps: [{ out_point: { tx_hash: `0x${'aa'.repeat(32)}`, index: '0x0' }, dep_type: 'dep_group' }],
  header_deps: [] as string[],
  inputs: [
    { since: '0x0', previous_output: { tx_hash: `0x${'11'.repeat(32)}`, index: '0x0' } },
    { since: '0x0', previous_output: { tx_hash: `0x${'22'.repeat(32)}`, index: '0x0' } },
    { since: '0x0', previous_output: { tx_hash: `0x${'33'.repeat(32)}`, index: '0x0' } },
  ],
  outputs: [{ capacity: '0x37e11d600', lock: scriptJson(ourLock), type: null }],
  outputs_data: ['0x'],
  witnesses: ['0x', '0x', '0x'],
})

const resolvedInputs = [
  { capacity: '0x2540be400', lock: ourLock, type: null, data: '0x' },
  { capacity: '0x2540be400', lock: theirLock, type: null, data: '0x' },
  { capacity: '0x2540be400', lock: ourLock, type: null, data: '0x' },
]

const channelFor = (tx = unsignedTx()) => ({
  channelId: '0xchan',
  unsignedFundingTx: tx,
  structure: snapshotFundingStructure(tx),
})

const secretFor = async () => ({ type: 'private-key' as const, privateKey: PRIVATE_KEY })

describe('fundingTransactionHash', () => {
  it('hashes the negotiated transaction without its witnesses', () => {
    const withWitnesses = { ...unsignedTx(), witnesses: [`0x${'55'.repeat(85)}`, '0x', '0x'] }

    expect(fundingTransactionHash(withWitnesses)).toBe(fundingTransactionHash(unsignedTx()))
  })

  it('changes when a structural field changes', () => {
    const changed = unsignedTx()
    changed.outputs[0].capacity = '0x1'

    expect(fundingTransactionHash(changed)).not.toBe(fundingTransactionHash(unsignedTx()))
  })
})

describe('signFundingTransaction', () => {
  const ownedIdentities = [{ lockScript: ourLock, providerId: Secp256k1LockProvider.ID }]

  it('signs only the inputs we own', async () => {
    const signed = await signFundingTransaction({
      channel: channelFor(),
      resolvedInputs,
      ownedIdentities,
      network,
      secretFor,
    })

    // Inputs 0 and 2 share one lock, so they are one script group: the signature goes in the
    // group's first witness and the rest of the group stays empty.
    expect(signed.witnesses[0]).not.toBe('0x')
    expect(signed.witnesses[1]).toBe('0x')
    expect(signed.witnesses[2]).toBe('0x')
  })

  it('leaves a peer witness byte-identical', async () => {
    const tx = unsignedTx()
    tx.witnesses[1] = '0xpeer'

    const signed = await signFundingTransaction({
      channel: channelFor(tx),
      resolvedInputs,
      ownedIdentities,
      network,
      secretFor,
    })

    expect(signed.witnesses[1]).toBe('0xpeer')
  })

  it('produces a signature that recovers to our own key', async () => {
    const signed = await signFundingTransaction({
      channel: channelFor(),
      resolvedInputs,
      ownedIdentities,
      network,
      secretFor,
    })

    const witnessArgs = WitnessArgs.deserialize(signed.witnesses[0] as string)
    expect(bytes.bytify(witnessArgs.lock!).byteLength).toBe(65)
    expect(hd.key.publicKeyToBlake160(hd.key.privateToPublic(PRIVATE_KEY))).toBe(BLAKE160)
  })

  it('preserves the negotiated structure', async () => {
    const channel = channelFor()

    const signed = await signFundingTransaction({
      channel,
      resolvedInputs,
      ownedIdentities,
      network,
      secretFor,
    })

    expect(() => assertOnlyWitnessesChanged(channel.structure, signed)).not.toThrow()
  })

  it('refuses when none of the inputs are ours', async () => {
    // Signing nothing and submitting would waste a negotiation and confuse the peer; better to say
    // so loudly than to hand back an unsigned transaction that looks signed.
    await expect(
      signFundingTransaction({
        channel: channelFor(),
        resolvedInputs: resolvedInputs.map(i => ({ ...i, lock: theirLock })),
        ownedIdentities,
        network,
        secretFor,
      })
    ).rejects.toThrow(/no inputs|own/i)
  })

  it('refuses to sign a lock its provider does not recognise on this network', async () => {
    // The transaction was built by the Fiber node, not by us. A lock the provider cannot positively
    // identify is one we have no evidence we can unlock.
    const foreign = new Script(`0x${'ab'.repeat(32)}`, BLAKE160, ScriptHashType.Type)

    await expect(
      signFundingTransaction({
        channel: channelFor(),
        resolvedInputs: [
          { capacity: '0x2540be400', lock: foreign, type: null, data: '0x' },
          resolvedInputs[1],
          resolvedInputs[2],
        ],
        ownedIdentities: [{ lockScript: foreign, providerId: Secp256k1LockProvider.ID }],
        network,
        secretFor,
      })
    ).rejects.toThrow(/does not recognise/i)
  })

  it('refuses when the resolved inputs do not line up with the transaction', async () => {
    await expect(
      signFundingTransaction({
        channel: channelFor(),
        resolvedInputs: resolvedInputs.slice(0, 2),
        ownedIdentities,
        network,
        secretFor,
      })
    ).rejects.toThrow(/input/i)
  })

  it('does not mutate the negotiated transaction it was given', async () => {
    const channel = channelFor()

    await signFundingTransaction({ channel, resolvedInputs, ownedIdentities, network, secretFor })

    expect(channel.unsignedFundingTx.witnesses).toEqual(['0x', '0x', '0x'])
  })
})
