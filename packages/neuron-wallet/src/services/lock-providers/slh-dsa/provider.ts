import { bytes } from '@ckb-lumos/lumos/codec'
import ckbTxMessageAll from '../../../models/ckb-tx-message-all'
import Script from '../../../models/chain/script'
import CellDep from '../../../models/chain/cell-dep'
import { serializeWitnessArgs } from '../../../utils/serialization'
import { readWitnessArgsSlices, replaceWitnessArgsLock } from '../../../models/chain/witness-args-molecule'
import { Network } from '../../../models/network'
import {
  getDefaultScriptDeploymentRegistry,
  ScriptDeploymentRegistry,
  SLH_DSA_PROVIDER_ID,
} from '../../../models/script-deployments'
import {
  LockProvider,
  PublicIdentity,
  SecretMaterial,
  SigningContext,
  StructuredWitness,
  WitnessSizeContext,
} from '../types'
import {
  buildWitnessLock,
  deriveLockArgs,
  estimateWitnessSize,
  getParameterSet,
  SlhDsaParameterSetName,
  witnessLockLength,
} from './parameter-sets'

/**
 * Secret material for this lock: a FIPS 205 private key bound to its parameter set.
 *
 * The parameter set travels with the key so that a key can never be used under a set it was not
 * generated for — that would produce a signature the lock cannot verify, with no local error.
 */
export interface SlhDsaSecret extends SecretMaterial {
  readonly type: 'slh-dsa-secret-key'
  readonly secretKey: string
  readonly parameterSet: SlhDsaParameterSetName
}

const isSlhDsaSecret = (secret: SecretMaterial): secret is SlhDsaSecret =>
  secret?.type === 'slh-dsa-secret-key' &&
  typeof secret.secretKey === 'string' &&
  typeof secret.parameterSet === 'string'

/**
 * Read the parameter set out of a context's provider metadata.
 *
 * It cannot be recovered from the script: the args are a hash of the prefix and public key, and the
 * prefix is what encodes the parameter set. So this is a hard requirement, not a default.
 */
const requireParameterSet = (metadata?: Readonly<Record<string, unknown>>): SlhDsaParameterSetName => {
  const parameterSet = metadata?.parameterSet
  if (typeof parameterSet !== 'string') {
    throw new Error(
      'An SLH-DSA identity must carry its parameter set: it is hashed into the lock args and cannot be recovered from the script'
    )
  }
  return parameterSet as SlhDsaParameterSetName
}

/**
 * Lock provider for the Nervos FIPS 205 all-in-one lock.
 *
 * Script identity, cell deps and hash type all come from the bundled deployment registry rather
 * than from constants here, so mainnet and testnet differences — mainnet is a Type ID, testnet is
 * `data1` — are data rather than branches, and a chain with no recorded deployment yields nothing.
 */
export default class SlhDsaLockProvider implements LockProvider {
  public readonly id = SLH_DSA_PROVIDER_ID

  private readonly deployments: ScriptDeploymentRegistry

  constructor(deployments: ScriptDeploymentRegistry = getDefaultScriptDeploymentRegistry()) {
    this.deployments = deployments
  }

  public supports(script: Script, network: Network): boolean {
    return this.deployments.forScript(script, network)?.providerId === this.id
  }

  public async deriveScript(identity: PublicIdentity, network: Network): Promise<Script> {
    const parameterSet = requireParameterSet(identity.metadata)
    if (!identity.publicKey) {
      throw new Error('Cannot derive an SLH-DSA script without a public key')
    }

    const deployment = this.requireDeployment(network)
    return new Script(deployment.codeHash, deriveLockArgs(parameterSet, identity.publicKey), deployment.hashType)
  }

  public async getCellDeps(network: Network): Promise<CellDep[]> {
    this.requireDeployment(network)
    return [this.deployments.cellDepFor(this.id, network)!]
  }

  /**
   * Index of this group's first witness within the transaction's witness list.
   *
   * A transaction can carry several script groups, and a group need not start at input 0. Its
   * signature belongs in the witness at the index of its own first input; writing it to
   * `witnesses[0]` would sign into another group's witness and leave this one unsigned.
   *
   * Falls back to 0 when inputs are not resolved, which is the single-group case.
   */
  private groupFirstIndex(context: SigningContext): number {
    if (!context.resolvedInputs?.length) {
      return 0
    }
    const index = context.resolvedInputs.findIndex(
      input =>
        input.lock.codeHash === context.lockScript.codeHash &&
        input.lock.hashType === context.lockScript.hashType &&
        input.lock.args === context.lockScript.args
    )
    return index < 0 ? 0 : index
  }

  public async prepareWitness(context: SigningContext): Promise<CKBComponents.WitnessArgs> {
    const parameterSet = requireParameterSet(context.metadata)
    const first: StructuredWitness | undefined = context.witnesses[this.groupFirstIndex(context)]
    if (first === undefined) {
      throw new Error('Cannot prepare an SLH-DSA witness for an empty lock group')
    }
    if (typeof first === 'string') {
      // Already-serialized witnesses are read at the molecule level so their other fields survive.
      const slices = readWitnessArgsSlices(first)
      return {
        lock: bytes.hexify(new Uint8Array(witnessLockLength(parameterSet))),
        inputType: slices.inputType.byteLength ? bytes.hexify(slices.inputType.slice(4)) : undefined,
        outputType: slices.outputType.byteLength ? bytes.hexify(slices.outputType.slice(4)) : undefined,
      }
    }

    // The placeholder is sized, not meaningful: the lock field is excluded from
    // CKB_TX_MESSAGE_ALL, so it exists only to make fee estimation match the finished transaction.
    return { ...first, lock: bytes.hexify(new Uint8Array(witnessLockLength(parameterSet))) }
  }

  public estimateWitnessSize(context: WitnessSizeContext): number {
    return estimateWitnessSize(requireParameterSet(context.metadata))
  }

  public async getSigningMessage(context: SigningContext): Promise<string> {
    if (!context.resolvedInputs || context.resolvedInputs.length === 0) {
      throw new Error(
        'SLH-DSA signing needs every input cell resolved: CKB_TX_MESSAGE_ALL commits to input cell contents, not just the transaction hash'
      )
    }

    const scriptGroupIndex = context.resolvedInputs.findIndex(
      input =>
        input.lock.codeHash === context.lockScript.codeHash &&
        input.lock.hashType === context.lockScript.hashType &&
        input.lock.args === context.lockScript.args
    )
    if (scriptGroupIndex < 0) {
      throw new Error('No resolved input carries the lock script being signed')
    }

    return ckbTxMessageAll({
      txHash: context.transactionHash,
      resolvedInputs: context.resolvedInputs,
      witnesses: context.witnesses.map(witness =>
        typeof witness === 'string' ? witness : serializeWitnessArgs(witness)
      ),
      scriptGroupIndex,
    })
  }

  public async sign(context: SigningContext, secret: SecretMaterial): Promise<string> {
    if (!isSlhDsaSecret(secret)) {
      throw new Error('The SLH-DSA lock provider requires "slh-dsa-secret-key" secret material')
    }

    const parameterSet = requireParameterSet(context.metadata)
    if (secret.parameterSet !== parameterSet) {
      throw new Error(
        `Secret material is for parameter set ${secret.parameterSet} but the identity uses ${parameterSet}`
      )
    }

    const message = await this.getSigningMessage(context)
    const signature = getParameterSet(parameterSet).signer.sign(bytes.bytify(secret.secretKey), bytes.bytify(message))
    return bytes.hexify(signature)
  }

  public async finalizeWitness(context: SigningContext, signature: string): Promise<string> {
    const parameterSet = requireParameterSet(context.metadata)
    const publicKey = context.metadata?.publicKey
    if (typeof publicKey !== 'string') {
      throw new Error('Finalising an SLH-DSA witness needs the public key: the lock carries it alongside the signature')
    }

    const first: StructuredWitness | undefined = context.witnesses[this.groupFirstIndex(context)]
    if (first === undefined) {
      throw new Error('Cannot finalise an SLH-DSA witness for an empty lock group')
    }

    const lock = buildWitnessLock(parameterSet, publicKey, signature)

    // An already-serialized witness has its lock spliced in at the molecule level rather than being
    // decoded and rebuilt. Round-tripping would collapse a present-but-empty input_type or
    // output_type into an absent one, and those bytes are part of the message that was just signed.
    return typeof first === 'string' ? replaceWitnessArgsLock(first, lock) : serializeWitnessArgs({ ...first, lock })
  }

  private requireDeployment(network: Network) {
    const deployment = this.deployments.forProvider(this.id, network)
    if (!deployment) {
      throw new Error(
        `No SLH-DSA script deployment is recorded for this network (genesis ${network.genesisHash}); the lock is only deployed on mainnet and testnet`
      )
    }
    return deployment
  }
}
