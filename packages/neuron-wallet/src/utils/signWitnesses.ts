import Secp256k1LockProvider from '../services/lock-providers/secp256k1'
import { StructuredWitness } from '../services/lock-providers/types'
import SystemScriptInfo from '../models/system-script-info'

/**
 * Sign a lock group with the secp256k1 sighash-all convention.
 *
 * The algorithm itself now lives in {@link Secp256k1LockProvider}; this remains as a thin wrapper so
 * that there is exactly one implementation of the signing message and witness layout in the tree.
 *
 * https://github.com/nervosnetwork/ckb-system-scripts/wiki/How-to-sign-transaction#signing
 */
export const signWitnesses = async ({
  witnesses,
  transactionHash,
  privateKey,
}: {
  witnesses: StructuredWitness[]
  transactionHash: string
  privateKey: string
}): Promise<StructuredWitness[]> => {
  if (witnesses.length === 0) {
    throw new Error('witnesses cannot be empty')
  }
  if (typeof witnesses[0] !== 'object') {
    throw new Error('The first witness in the group should be type of WitnessArgs')
  }

  const provider = new Secp256k1LockProvider()
  // The group's lock script is not part of the secp signing message; a representative script is
  // enough to satisfy the provider's context. Callers that know the real lock should use the
  // provider directly.
  const context = {
    transactionHash,
    lockScript: SystemScriptInfo.generateSecpScript('0x'),
    witnesses,
  }
  const signature = await provider.sign(context, { type: 'private-key', privateKey })
  return [await provider.finalizeWitness(context, signature), ...witnesses.slice(1)]
}
