import { ScriptHashType } from '../chain/script'
import { DepType } from '../chain/cell-dep'
import { Network, MAINNET_GENESIS_HASH, TESTNET_GENESIS_HASH } from '../network'

/**
 * The networks a bundled deployment record can describe.
 *
 * Deliberately not open ended. A deployment is a statement about a specific chain, and there is no
 * safe default for a chain we do not recognise.
 */
export const DEPLOYMENT_NETWORKS = ['mainnet', 'testnet'] as const
export type DeploymentNetwork = (typeof DEPLOYMENT_NETWORKS)[number]

/**
 * Provenance of a record, not permission to use it.
 *
 * `verified` means the values were checked against the upstream project that published the
 * deployment. Whether a wallet may create or spend with a given script on a given network is a
 * separate, feature level decision and does not belong here.
 */
export const DEPLOYMENT_STATUSES = ['verified', 'unverified', 'deprecated'] as const
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number]

export interface ScriptDeploymentCellDep {
  readonly txHash: string
  readonly index: string
  readonly depType: DepType
}

/**
 * One externally deployed script, on one network.
 *
 * Genesis scripts (secp, DAO, multisig) are not described here: they are derived from the genesis
 * block by `SystemScriptInfo` and have no deployment transaction to record.
 */
export interface ScriptDeployment {
  /** Stable record id, unique across the registry. Convention: `<providerId>/<network>`. */
  readonly id: string
  /** The lock provider that owns this script. */
  readonly providerId: string
  readonly network: DeploymentNetwork
  readonly codeHash: string
  readonly hashType: ScriptHashType
  readonly cellDep: ScriptDeploymentCellDep
  readonly status: DeploymentStatus
  /**
   * Data hash of the dep cell's binary, as read from the live chain when this record was verified.
   *
   * Separate from `codeHash` because on mainnet they are not the same thing. Mainnet is deployed
   * under a Type ID, so `codeHash` is stable *by construction* while the binary behind it is
   * replaceable by the publisher. Comparing code hashes can therefore never detect a redeploy: it
   * is guaranteed to match afterwards. Only the binary's own hash changes.
   *
   * On testnet the two coincide — `data1` means the code hash is the data hash — so a testnet
   * record is structurally immune and this field merely restates `codeHash`.
   */
  readonly verifiedBinaryHash?: string
  /** Where these values came from, ideally a URL pinned to a commit. */
  readonly source?: string
}

/**
 * Whether the binary deployed at a record's cell dep is still the one that was verified.
 *
 * `unpinned` is not a pass. It means the record never recorded which binary it was checked
 * against, so nothing can be concluded — reported distinctly so a caller cannot read a missing
 * pin as agreement.
 */
export type DeployedBinaryVerification =
  | { readonly result: 'match' }
  | { readonly result: 'unpinned' }
  | { readonly result: 'changed'; readonly expected: string; readonly actual: string }

/**
 * Compare the binary now at a deployment's cell dep against the one that was verified.
 *
 * Takes the live data hash rather than fetching it: this stays a pure comparison, and the caller
 * decides when a node round trip is worth making.
 */
export const verifyDeployedBinary = (
  deployment: ScriptDeployment,
  liveBinaryHash: string
): DeployedBinaryVerification => {
  const expected = deployment.verifiedBinaryHash
  if (!expected) return { result: 'unpinned' }
  return expected.toLowerCase() === liveBinaryHash.toLowerCase()
    ? { result: 'match' }
    : { result: 'changed', expected, actual: liveBinaryHash }
}

/**
 * Map a configured Neuron network onto a deployment network, by genesis hash only.
 *
 * This fails closed on purpose. `Network.chain` is a label that can come from user settings, and a
 * node that has not reported its genesis hash yet has not proven which chain it is on — neither is
 * a safe basis for handing out mainnet cell deps. An unrecognised chain simply has no deployments.
 */
export const deploymentNetworkOf = (network: Network): DeploymentNetwork | undefined => {
  switch (network.genesisHash) {
    case MAINNET_GENESIS_HASH:
      return 'mainnet'
    case TESTNET_GENESIS_HASH:
      return 'testnet'
    default:
      return undefined
  }
}
