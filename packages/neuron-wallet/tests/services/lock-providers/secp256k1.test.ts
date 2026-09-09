import 'dotenv/config'
import { hd } from '@ckb-lumos/lumos'
// Import order matters here. Pulling the provider module in before anything else reproduces the
// module-evaluation order that exposed a load-time cycle
// (secp256k1 -> system-script-info -> networks -> ckb-runner -> block-sync-renderer -> ... ->
// transaction-sender -> lock-providers). If the lock-providers barrel ever constructs a provider at
// module scope again, this suite fails to run at all. Do not reorder these imports.
import Secp256k1LockProvider from '../../../src/services/lock-providers/secp256k1'
import { SigningContext } from '../../../src/services/lock-providers/types'
import Script, { ScriptHashType } from '../../../src/models/chain/script'
import SystemScriptInfo from '../../../src/models/system-script-info'
import TransactionSize from '../../../src/models/transaction-size'
import CellDep, { DepType } from '../../../src/models/chain/cell-dep'
import OutPoint from '../../../src/models/chain/out-point'
import { Network, NetworkType } from '../../../src/models/network'

/**
 * Golden vectors captured from the pre-refactor implementation of
 * `src/utils/signWitnesses.ts` at upstream develop 9bca6e7d, before any provider code existed.
 * They are the independent oracle for this refactor: if the provider ever stops reproducing them
 * byte-for-byte, the extraction changed transaction bytes and the branch is not behaviour
 * preserving. Do not regenerate these from the provider itself.
 */
const PRIVATE_KEY = '0xe79f3207ea4980b7fed79956d5934249ceac4751a4fae01a0f7c4a96884bc4e3'
const PUBLIC_KEY = '0x024a501efd328e062c8675f2365970728c859c592beeefd6be8ead3d901330bc01'
const BLAKE160 = '0x36c329ed630d6ce750712a477543672adab57f4c'
const TX_HASH = '0x00f5f31941964004d665a8762df8eb4fab53b5ef8437b7d34a38e018b1409054'

const GOLDEN = {
  singleEmpty: {
    witnesses: [{ lock: undefined, inputType: undefined, outputType: undefined }],
    message: '0xc37116fb8c730523572cbb3cda4388478f84c7da09c1c83db99a8b6be43f7a2d',
    signature:
      '0xaa6de884b0dd0378383cedddc39790b5cad66e42d5dc7655de728ee7eb3a53be071605d76641ad26766c6ed4864e67dbc2cd1526e006c9be7ccfa9b8cbf9e7c701',
    finalized:
      '0x5500000010000000550000005500000041000000aa6de884b0dd0378383cedddc39790b5cad66e42d5dc7655de728ee7eb3a53be071605d76641ad26766c6ed4864e67dbc2cd1526e006c9be7ccfa9b8cbf9e7c701',
  },
  multiWithEmptyStrings: {
    witnesses: [{ lock: undefined, inputType: undefined, outputType: undefined }, '0x', '0x'],
    message: '0x5899d9478701e1997d8e3af6b615b5a65aadda894007ba5cd4d63d73c1c03883',
    signature:
      '0x1725ee74297a05957c6f311f045ab66a7dcdee9949be8cc1bb0a6bbd52dca6fe739b7eddac41544ab2d768b67bb836ef033761f70b847a9bdb20c1708ce005a500',
    finalized:
      '0x55000000100000005500000055000000410000001725ee74297a05957c6f311f045ab66a7dcdee9949be8cc1bb0a6bbd52dca6fe739b7eddac41544ab2d768b67bb836ef033761f70b847a9bdb20c1708ce005a500',
  },
  firstHasInputType: {
    witnesses: [
      { lock: undefined, inputType: '0x0000000000000000', outputType: undefined },
      '0x',
      '0x1800000010000000100000001000000004000000deadbeef',
    ],
    message: '0xc25242e1a2966ef2b8db72f8c9395c4c8aca655eb0abd999548e3dba8127c557',
    signature:
      '0x71249fac7fcfd9ba238a03a639f36ddb21308b1eba9a78eb1ee3c69742f8090b1fcc7d569920507bd2cc7b14bb78a40aa4aa6a0f3d07d32f144f3a2e631a335501',
    finalized:
      '0x610000001000000055000000610000004100000071249fac7fcfd9ba238a03a639f36ddb21308b1eba9a78eb1ee3c69742f8090b1fcc7d569920507bd2cc7b14bb78a40aa4aa6a0f3d07d32f144f3a2e631a335501080000000000000000000000',
  },
} as const

const network: Network = {
  id: 'test',
  name: 'test',
  remote: 'http://127.0.0.1:8114',
  type: NetworkType.Normal,
  genesisHash: '0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606',
  chain: 'ckb_testnet',
  readonly: false,
}

const lockScript = SystemScriptInfo.generateSecpScript(BLAKE160)

const contextFor = (name: keyof typeof GOLDEN): SigningContext => ({
  transactionHash: TX_HASH,
  lockScript,
  witnesses: [...GOLDEN[name].witnesses],
})

describe('Secp256k1LockProvider', () => {
  const provider = new Secp256k1LockProvider()

  describe('identity', () => {
    it('exposes a stable provider id', () => {
      expect(provider.id).toBe('secp256k1-sighash-all')
      expect(Secp256k1LockProvider.ID).toBe(provider.id)
    })
  })

  describe('supports', () => {
    it('accepts the system secp256k1_blake160_sighash_all script', () => {
      expect(provider.supports(SystemScriptInfo.generateSecpScript(BLAKE160), network)).toBe(true)
    })

    it('rejects a script with the same args but a foreign code hash', () => {
      const foreign = new Script(`0x${'11'.repeat(32)}`, BLAKE160, ScriptHashType.Type)

      expect(provider.supports(foreign, network)).toBe(false)
    })

    it('rejects the secp code hash used with the wrong hash type', () => {
      const wrongHashType = new Script(SystemScriptInfo.SECP_CODE_HASH, BLAKE160, ScriptHashType.Data)

      expect(provider.supports(wrongHashType, network)).toBe(false)
    })
  })

  describe('deriveScript', () => {
    it('derives the secp script from a public key', async () => {
      const script = await provider.deriveScript({ providerId: provider.id, publicKey: PUBLIC_KEY }, network)

      expect(script.codeHash).toBe(SystemScriptInfo.SECP_CODE_HASH)
      expect(script.hashType).toBe(SystemScriptInfo.SECP_HASH_TYPE)
      expect(script.args).toBe(hd.key.publicKeyToBlake160(PUBLIC_KEY))
      expect(script.args).toBe(BLAKE160)
    })

    it('derives the secp script from pre-computed args', async () => {
      const script = await provider.deriveScript({ providerId: provider.id, args: BLAKE160 }, network)

      expect(script.args).toBe(BLAKE160)
      expect(script.codeHash).toBe(SystemScriptInfo.SECP_CODE_HASH)
    })

    it('rejects an identity carrying neither a public key nor args', async () => {
      await expect(provider.deriveScript({ providerId: provider.id }, network)).rejects.toThrow(/public key|args/i)
    })
  })

  describe('getCellDeps', () => {
    it('returns the genesis secp dep group for the given network', async () => {
      const dep = new CellDep(new OutPoint(`0x${'cd'.repeat(32)}`, '0'), DepType.DepGroup)
      const spy = jest.spyOn(SystemScriptInfo.getInstance(), 'getSecpCellDep').mockResolvedValue(dep)

      await expect(provider.getCellDeps(network)).resolves.toEqual([dep])
      expect(spy).toHaveBeenCalledWith(network)

      spy.mockRestore()
    })
  })

  describe('estimateWitnessSize', () => {
    it('matches the size the fee estimator already uses for a secp lock witness', () => {
      expect(provider.estimateWitnessSize({ lockScript })).toBe(TransactionSize.secpLockWitness())
    })

    it('is 93 bytes — 85 serialized WitnessArgs plus the 8 byte fixvec overhead', () => {
      expect(provider.estimateWitnessSize({ lockScript })).toBe(93)
    })
  })

  describe('prepareWitness', () => {
    it('fills the lock field with a 65 byte zero placeholder', async () => {
      const witness = await provider.prepareWitness(contextFor('singleEmpty'))

      expect(witness.lock).toBe(`0x${'00'.repeat(65)}`)
    })

    it('preserves inputType and outputType while filling the placeholder', async () => {
      const witness = await provider.prepareWitness(contextFor('firstHasInputType'))

      expect(witness.inputType).toBe('0x0000000000000000')
      expect(witness.outputType).toBeUndefined()
    })

    it('does not mutate the witness passed in the context', async () => {
      const context = contextFor('singleEmpty')
      await provider.prepareWitness(context)

      expect((context.witnesses[0] as CKBComponents.WitnessArgs).lock).toBeUndefined()
    })

    it('rejects a group whose first witness is already serialized bytes', async () => {
      await expect(
        provider.prepareWitness({ transactionHash: TX_HASH, lockScript, witnesses: ['0x'] })
      ).rejects.toThrow(/first witness/i)
    })
  })

  describe('getSigningMessage', () => {
    it.each(Object.keys(GOLDEN) as (keyof typeof GOLDEN)[])(
      'reproduces the pre-refactor sighash-all message for %s',
      async name => {
        await expect(provider.getSigningMessage(contextFor(name))).resolves.toBe(GOLDEN[name].message)
      }
    )

    it('rejects an empty witness group', async () => {
      await expect(provider.getSigningMessage({ transactionHash: TX_HASH, lockScript, witnesses: [] })).rejects.toThrow(
        /empty/i
      )
    })
  })

  describe('sign', () => {
    it.each(Object.keys(GOLDEN) as (keyof typeof GOLDEN)[])(
      'reproduces the pre-refactor recoverable signature for %s',
      async name => {
        await expect(provider.sign(contextFor(name), { type: 'private-key', privateKey: PRIVATE_KEY })).resolves.toBe(
          GOLDEN[name].signature
        )
      }
    )

    it('refuses secret material that is not a private key', async () => {
      await expect(provider.sign(contextFor('singleEmpty'), { type: 'hardware-device' } as never)).rejects.toThrow(
        /private-key|secret/i
      )
    })
  })

  describe('finalizeWitness', () => {
    it.each(Object.keys(GOLDEN) as (keyof typeof GOLDEN)[])(
      'reproduces the pre-refactor serialized witness for %s',
      async name => {
        await expect(provider.finalizeWitness(contextFor(name), GOLDEN[name].signature)).resolves.toBe(
          GOLDEN[name].finalized
        )
      }
    )
  })

  describe('full signing pipeline', () => {
    it.each(Object.keys(GOLDEN) as (keyof typeof GOLDEN)[])(
      'produces the pre-refactor witness end to end for %s',
      async name => {
        const context = contextFor(name)
        const signature = await provider.sign(context, { type: 'private-key', privateKey: PRIVATE_KEY })
        const finalized = await provider.finalizeWitness(context, signature)

        expect(finalized).toBe(GOLDEN[name].finalized)
      }
    )
  })
})
