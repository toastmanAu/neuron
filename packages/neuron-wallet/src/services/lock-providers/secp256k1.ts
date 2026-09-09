import { hd } from '@ckb-lumos/lumos'
import { bytes, Uint64LE } from '@ckb-lumos/lumos/codec'
import { CKBHasher } from '@ckb-lumos/lumos/utils'
import { serializeWitnessArgs } from '../../utils/serialization'
import { prefixWith0x } from '../../utils/scriptAndAddress'
import SystemScriptInfo from '../../models/system-script-info'
import TransactionSize from '../../models/transaction-size'
import WitnessArgs from '../../models/chain/witness-args'
import Script from '../../models/chain/script'
import CellDep from '../../models/chain/cell-dep'
import { Network } from '../../models/network'
import {
  LockProvider,
  PrivateKeySecret,
  PublicIdentity,
  SecretMaterial,
  SigningContext,
  StructuredWitness,
  WitnessSizeContext,
} from './types'

const isPrivateKeySecret = (secret: SecretMaterial): secret is PrivateKeySecret =>
  secret?.type === 'private-key' && typeof (secret as PrivateKeySecret).privateKey === 'string'

/**
 * The secp256k1 sighash-all lock provider.
 *
 * This carries Neuron's existing software signing behaviour unchanged, moved behind the provider
 * boundary: a 65-byte zero-filled signature placeholder, the sighash-all message defined in
 * https://github.com/nervosnetwork/ckb-system-scripts/wiki/How-to-sign-transaction#signing, a
 * recoverable secp256k1 signature, and that signature written back into `WitnessArgs.lock`.
 *
 * The id says "sighash-all" rather than "blake160" on purpose. The *algorithm* implemented here is
 * shared by several CKB locks that are not the system secp script — anyone-can-pay, cheque and
 * sUDT-ACP all use the same witness convention with different code hashes, and Neuron's software
 * signer signs all of them with this routine today. `supports()`, by contrast, only claims the
 * system script, because a provider must never claim a script it is not certain it can unlock.
 * Those two facts are why `TransactionSender` selects this provider explicitly rather than by
 * script resolution; see the note in that file.
 */
export default class Secp256k1LockProvider implements LockProvider {
  public static readonly ID = 'secp256k1-sighash-all'

  public readonly id = Secp256k1LockProvider.ID

  public supports(script: Script, _network: Network): boolean {
    return SystemScriptInfo.isSecpScript(script)
  }

  public async deriveScript(identity: PublicIdentity, _network: Network): Promise<Script> {
    const args =
      identity.args ?? (identity.publicKey ? hd.key.publicKeyToBlake160(prefixWith0x(identity.publicKey)) : undefined)
    if (!args) {
      throw new Error(`Cannot derive a ${this.id} script: identity carries neither a public key nor args`)
    }
    return SystemScriptInfo.generateSecpScript(args)
  }

  public async getCellDeps(network: Network): Promise<CellDep[]> {
    return [await SystemScriptInfo.getInstance().getSecpCellDep(network)]
  }

  public async prepareWitness(context: SigningContext): Promise<CKBComponents.WitnessArgs> {
    const first: StructuredWitness | undefined = context.witnesses[0]
    if (first === undefined) {
      throw new Error(`Cannot prepare a ${this.id} witness for an empty lock group`)
    }
    if (typeof first === 'string') {
      throw new Error(`The first witness of a ${this.id} lock group must be a structured WitnessArgs`)
    }
    return { ...first, lock: WitnessArgs.EMPTY_LOCK }
  }

  public estimateWitnessSize(_context: WitnessSizeContext): number {
    return TransactionSize.secpLockWitness()
  }

  public async getSigningMessage(context: SigningContext): Promise<string> {
    const emptyWitness = await this.prepareWitness(context)
    const serializedEmptyWitnessBytes = bytes.bytify(serializeWitnessArgs(emptyWitness))

    const hasher = new CKBHasher()
    hasher.update(context.transactionHash)
    hasher.update(Uint64LE.pack(serializedEmptyWitnessBytes.byteLength))
    hasher.update(serializedEmptyWitnessBytes)

    context.witnesses.slice(1).forEach(witness => {
      const witnessBytes = bytes.bytify(typeof witness === 'string' ? witness : serializeWitnessArgs(witness))
      hasher.update(Uint64LE.pack(witnessBytes.byteLength))
      hasher.update(witnessBytes)
    })

    return hasher.digestHex()
  }

  public async sign(context: SigningContext, secret: SecretMaterial): Promise<string> {
    if (!isPrivateKeySecret(secret)) {
      throw new Error(`The ${this.id} lock provider requires "private-key" secret material`)
    }
    const message = await this.getSigningMessage(context)
    return hd.key.signRecoverable(message, secret.privateKey)
  }

  public async finalizeWitness(context: SigningContext, signature: string): Promise<string> {
    const witness = await this.prepareWitness(context)
    return serializeWitnessArgs({ ...witness, lock: signature })
  }
}
