import { Network } from '../models/network'
import {
  DeployedBinaryVerification,
  ScriptDeployment,
  ScriptDeploymentRegistry,
  getDefaultScriptDeploymentRegistry,
  verifyDeployedBinary,
} from '../models/script-deployments'
import { generateRPC } from '../utils/ckb-rpc'

/**
 * What a live check of a deployment's cell dep can conclude.
 *
 * `missing` and `unavailable` are separate from the pure comparison's answers because neither is a
 * statement about the binary: one says the code is gone, the other says we could not look.
 */
export type DeploymentCheck =
  | DeployedBinaryVerification
  | { readonly result: 'missing' }
  | { readonly result: 'unavailable'; readonly reason: string }

const keyFor = (deployment: ScriptDeployment): string =>
  `${deployment.id}@${deployment.cellDep.txHash}:${deployment.cellDep.index}`

/**
 * Checks that the script a deployment record points at is still the one it was verified against.
 *
 * This exists because of how the lock is deployed on mainnet. There it lives behind a Type ID, so
 * its code hash — and therefore every lock script already derived from it — stays identical while
 * the publisher is free to replace the binary underneath. Comparing code hashes cannot detect that
 * by construction; only the dep cell's data hash moves. On testnet the script is pinned with
 * `data1` and a replacement would simply be a different lock, so the check is a formality there.
 */
export default class ScriptDeploymentChecker {
  /** Only definitive answers are kept. A failure to reach the node is not an answer. */
  private readonly settled = new Map<string, DeploymentCheck>()

  private readonly deployments: ScriptDeploymentRegistry

  constructor(deployments: ScriptDeploymentRegistry = getDefaultScriptDeploymentRegistry()) {
    this.deployments = deployments
  }

  public async check(deployment: ScriptDeployment, network: Network): Promise<DeploymentCheck> {
    // Nothing to compare against, so there is no reason to ask the node.
    if (!deployment.verifiedBinaryHash) {
      return { result: 'unpinned' }
    }

    const key = keyFor(deployment)
    const settled = this.settled.get(key)
    if (settled) {
      return settled
    }

    let outcome: DeploymentCheck
    try {
      const rpc = generateRPC(network.remote, network.type)
      const cell = await rpc.getLiveCell({ txHash: deployment.cellDep.txHash, index: deployment.cellDep.index }, true)

      outcome =
        !cell || cell.status !== 'live' || !cell.cell
          ? { result: 'missing' }
          : verifyDeployedBinary(deployment, cell.cell.data?.hash ?? '')
    } catch (error) {
      // Deliberately not cached: one dropped connection should not stop the wallet checking for
      // the rest of the session.
      return { result: 'unavailable', reason: error instanceof Error ? error.message : String(error) }
    }

    this.settled.set(key, outcome)
    return outcome
  }

  /**
   * Throw unless the deployed script is safe to build a transaction against.
   *
   * Fails open when the node cannot be reached. The check is here to notice that the publisher
   * replaced the binary, not to defend against an attacker on the wire — someone who can block the
   * RPC cannot change what is deployed — and failing closed would make an unreachable node enough
   * to stop a user spending their own coins.
   */
  public async assertUsable(deployment: ScriptDeployment, network: Network): Promise<void> {
    const outcome = await this.check(deployment, network)

    if (outcome.result === 'changed') {
      throw new Error(
        `The ${deployment.id} script deployed on chain is not the one this build was verified against. ` +
          `Expected the binary ${outcome.expected} but the cell dep now holds ${outcome.actual}. ` +
          'The lock is deployed behind a Type ID, so its code hash is unchanged and existing cells are now ' +
          'validated by different code. Refusing to sign until this build is checked against the new script.'
      )
    }

    if (outcome.result === 'missing') {
      throw new Error(
        `The cell dep for ${deployment.id} (${deployment.cellDep.txHash}:${deployment.cellDep.index}) is no longer a ` +
          'live cell, so the script it provides cannot be loaded and any transaction using it would fail to validate.'
      )
    }
  }

  /**
   * The same check, for whichever script a provider uses on this network.
   *
   * A provider the registry does not describe here is not this check's business: that fails later,
   * in the code that needs a cell dep and cannot find one, with an error about that.
   */
  public async assertUsableFor(providerId: string, network: Network): Promise<void> {
    const deployment = this.deployments.forProvider(providerId, network)
    if (deployment) {
      await this.assertUsable(deployment, network)
    }
  }

  /** Drop what has been checked, so the next call asks the node again. */
  public forget(): void {
    this.settled.clear()
  }
}
