import 'dotenv/config'
import { bytes } from '@ckb-lumos/lumos/codec'
import SlhDsaLockProvider from '../../../src/services/lock-providers/slh-dsa/provider'
import {
  deriveLockArgs,
  estimateWitnessSize,
  getParameterSet,
  parseWitnessLock,
  witnessLockLength,
  SlhDsaParameterSetName,
} from '../../../src/services/lock-providers/slh-dsa/parameter-sets'
import { SLH_DSA_PROVIDER_ID } from '../../../src/models/script-deployments'
import { ResolvedInput } from '../../../src/models/ckb-tx-message-all'
import Script, { ScriptHashType } from '../../../src/models/chain/script'
import { serializeWitnessArgs } from '../../../src/utils/serialization'
import { Network, NetworkType, MAINNET_GENESIS_HASH, TESTNET_GENESIS_HASH } from '../../../src/models/network'
import { SLH_DSA_VECTORS } from '../../fixtures/slh-dsa-vectors'

const networkWith = (genesisHash: string, chain: string): Network => ({
  id: 'n',
  name: 'n',
  remote: 'http://127.0.0.1:8114',
  type: NetworkType.Normal,
  genesisHash,
  chain,
  readonly: false,
})

const mainnet = networkWith(MAINNET_GENESIS_HASH, 'ckb')
const testnet = networkWith(TESTNET_GENESIS_HASH, 'ckb_testnet')
const devnet = networkWith(`0x${'ee'.repeat(32)}`, 'ckb_dev')

const TESTNET_CODE_HASH = '0x147ecbb5c5127d982ee1362d2c2bb4267803da2eb006d150e88af6caaa0a7eaf'
const MAINNET_CODE_HASH = '0x302d35982f865ebcbedb9a9360e40530ed32adb8e10b42fbbe70d8312ff7cedf'

const PARAM: SlhDsaParameterSetName = 'SLH-DSA-SHA2-128s'
const keyVector = SLH_DSA_VECTORS.keyPairs.find(k => k.paramSet === PARAM)!

describe('SlhDsaLockProvider', () => {
  const provider = new SlhDsaLockProvider()

  describe('identity', () => {
    it('uses the provider id the deployment registry records', () => {
      expect(provider.id).toBe(SLH_DSA_PROVIDER_ID)
    })
  })

  describe('supports', () => {
    it('accepts the deployed testnet script when on testnet', () => {
      const script = new Script(TESTNET_CODE_HASH, `0x${'11'.repeat(32)}`, ScriptHashType.Data1)

      expect(provider.supports(script, testnet)).toBe(true)
    })

    it('accepts the deployed mainnet script when on mainnet', () => {
      const script = new Script(MAINNET_CODE_HASH, `0x${'11'.repeat(32)}`, ScriptHashType.Type)

      expect(provider.supports(script, mainnet)).toBe(true)
    })

    it('rejects the mainnet script while connected to testnet', () => {
      const script = new Script(MAINNET_CODE_HASH, `0x${'11'.repeat(32)}`, ScriptHashType.Type)

      expect(provider.supports(script, testnet)).toBe(false)
    })

    it('rejects the right code hash under the wrong hash type', () => {
      const script = new Script(TESTNET_CODE_HASH, `0x${'11'.repeat(32)}`, ScriptHashType.Type)

      expect(provider.supports(script, testnet)).toBe(false)
    })

    it('claims nothing on a chain with no recorded deployment', () => {
      const script = new Script(TESTNET_CODE_HASH, `0x${'11'.repeat(32)}`, ScriptHashType.Data1)

      expect(provider.supports(script, devnet)).toBe(false)
    })
  })

  describe('deriveScript', () => {
    const identity = {
      providerId: SLH_DSA_PROVIDER_ID,
      publicKey: keyVector.publicKey,
      metadata: { parameterSet: PARAM },
    }

    it('builds the deployed script with args derived from the public key', async () => {
      const script = await provider.deriveScript(identity, testnet)

      expect(script.codeHash).toBe(TESTNET_CODE_HASH)
      expect(script.hashType).toBe(ScriptHashType.Data1)
      expect(script.args).toBe(deriveLockArgs(PARAM, keyVector.publicKey))
    })

    it('produces a different script on mainnet for the same key', async () => {
      const script = await provider.deriveScript(identity, mainnet)

      expect(script.codeHash).toBe(MAINNET_CODE_HASH)
      expect(script.hashType).toBe(ScriptHashType.Type)
      expect(script.args).toBe(deriveLockArgs(PARAM, keyVector.publicKey))
    })

    it('refuses to derive without a parameter set, which args cannot reveal', async () => {
      await expect(
        provider.deriveScript({ providerId: SLH_DSA_PROVIDER_ID, publicKey: keyVector.publicKey }, testnet)
      ).rejects.toThrow(/parameter set/i)
    })

    it('refuses to derive without a public key', async () => {
      await expect(
        provider.deriveScript({ providerId: SLH_DSA_PROVIDER_ID, metadata: { parameterSet: PARAM } }, testnet)
      ).rejects.toThrow(/public key/i)
    })

    it('refuses to derive on a chain with no recorded deployment', async () => {
      await expect(provider.deriveScript(identity, devnet)).rejects.toThrow(/deployment|network/i)
    })
  })

  describe('getCellDeps', () => {
    it('returns the deployed cell dep for the network', async () => {
      const [dep] = await provider.getCellDeps(testnet)

      expect(dep.outPoint.txHash).toBe('0x631d9a6049fb1fc3790e89d9daf35abe535b5e754cd8c3404319319710f0b106')
      expect(dep.depType).toBe('code')
    })

    it('refuses to hand out a cell dep on a chain with no recorded deployment', async () => {
      await expect(provider.getCellDeps(devnet)).rejects.toThrow(/deployment|network/i)
    })
  })

  describe('witness sizing and placeholder', () => {
    const lockScript = new Script(TESTNET_CODE_HASH, `0x${'11'.repeat(32)}`, ScriptHashType.Data1)

    it('sizes the witness for the identity parameter set', () => {
      expect(provider.estimateWitnessSize({ lockScript, metadata: { parameterSet: PARAM } })).toBe(
        estimateWitnessSize(PARAM)
      )
    })

    it('sizes a 256f witness far larger than a 128s one, as the parameter set demands', () => {
      const big = provider.estimateWitnessSize({ lockScript, metadata: { parameterSet: 'SLH-DSA-SHA2-256f' } })
      const small = provider.estimateWitnessSize({ lockScript, metadata: { parameterSet: PARAM } })

      expect(big - small).toBe(49953 - 7921)
    })

    it('refuses to guess a size without a parameter set', () => {
      expect(() => provider.estimateWitnessSize({ lockScript })).toThrow(/parameter set/i)
    })

    it('fills the placeholder to the exact signed witness length', async () => {
      const witness = await provider.prepareWitness({
        transactionHash: `0x${'00'.repeat(32)}`,
        lockScript,
        metadata: { parameterSet: PARAM },
        witnesses: [{ lock: undefined, inputType: undefined, outputType: undefined }],
      })

      expect(bytes.bytify(witness.lock!).byteLength).toBe(witnessLockLength(PARAM))
    })
  })

  describe('signing', () => {
    const vector = SLH_DSA_VECTORS.messageAll.find(v => v.name === 'two-inputs-in-group')!
    const groupLock = vector.resolvedInputs[0].lock
    const lockScript = new Script(groupLock.codeHash, groupLock.args, groupLock.hashType as ScriptHashType)
    const resolvedInputs: ResolvedInput[] = vector.resolvedInputs.map(i => ({
      capacity: i.capacity,
      lock: new Script(i.lock.codeHash, i.lock.args, i.lock.hashType as ScriptHashType),
      type: null,
      data: i.data,
    }))
    const context = {
      transactionHash: vector.txHash,
      lockScript,
      metadata: { parameterSet: PARAM },
      witnesses: [...vector.tx.witnesses] as string[],
      resolvedInputs,
    }

    it('signs the CKB_TX_MESSAGE_ALL digest upstream computes for the same transaction', async () => {
      expect(await provider.getSigningMessage(context)).toBe(vector.messageDigest)
    })

    it('refuses to sign a transaction whose input cells are not resolved', async () => {
      // The message commits to the content of every input cell, so an unresolved transaction cannot
      // be signed at all — it must fail loudly rather than hash something incomplete.
      await expect(provider.getSigningMessage({ ...context, resolvedInputs: undefined })).rejects.toThrow(
        /resolved|input cell/i
      )
    })

    it('produces a signature the reference implementation would accept', async () => {
      const signature = await provider.sign(context, {
        type: 'slh-dsa-secret-key',
        secretKey: keyVector.secretKey,
        parameterSet: PARAM,
      })
      const message = await provider.getSigningMessage(context)

      expect(
        getParameterSet(PARAM).signer.verify(
          bytes.bytify(keyVector.publicKey),
          bytes.bytify(message),
          bytes.bytify(signature)
        )
      ).toBe(true)
    }, 120000)

    it('refuses secret material belonging to another provider', async () => {
      await expect(provider.sign(context, { type: 'private-key', privateKey: `0x${'11'.repeat(32)}` })).rejects.toThrow(
        /slh-dsa|secret/i
      )
    })

    it('refuses secret material whose parameter set disagrees with the identity', async () => {
      await expect(
        provider.sign(context, {
          type: 'slh-dsa-secret-key',
          secretKey: keyVector.secretKey,
          parameterSet: 'SLH-DSA-SHA2-256s',
        })
      ).rejects.toThrow(/parameter set/i)
    })

    it('finalises a witness whose lock parses back to the same key and signature', async () => {
      const signature = `0x${'7f'.repeat(getParameterSet(PARAM).signatureLength)}`
      const finalized = await provider.finalizeWitness(
        { ...context, metadata: { parameterSet: PARAM, publicKey: keyVector.publicKey } },
        signature
      )

      const witnessArgs = require('../../../src/models/chain/witness-args').default.deserialize(finalized)
      const parsed = parseWitnessLock(witnessArgs.lock)

      expect(parsed.parameterSet.name).toBe(PARAM)
      expect(parsed.publicKey).toBe(keyVector.publicKey)
      expect(parsed.signature).toBe(signature)
    })

    it('keeps the other witness fields intact when finalising', async () => {
      const signature = `0x${'7f'.repeat(getParameterSet(PARAM).signatureLength)}`
      const withFields = {
        ...context,
        metadata: { parameterSet: PARAM, publicKey: keyVector.publicKey },
        witnesses: [
          serializeWitnessArgs({ lock: undefined, inputType: '0xaabb', outputType: '0xccdd' }),
          ...context.witnesses.slice(1),
        ],
      }

      const finalized = await provider.finalizeWitness(withFields, signature)
      const witnessArgs = require('../../../src/models/chain/witness-args').default.deserialize(finalized)

      expect(witnessArgs.inputType).toBe('0xaabb')
      expect(witnessArgs.outputType).toBe('0xccdd')
    })

    it('refuses to finalise without knowing which public key to embed', async () => {
      const signature = `0x${'7f'.repeat(getParameterSet(PARAM).signatureLength)}`

      await expect(provider.finalizeWitness(context, signature)).rejects.toThrow(/public key/i)
    })
  })
})
