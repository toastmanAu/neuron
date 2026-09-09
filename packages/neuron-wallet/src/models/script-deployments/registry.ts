import CellDep, { DepType } from '../chain/cell-dep'
import OutPoint from '../chain/out-point'
import Script, { ScriptHashType } from '../chain/script'
import { Network } from '../network'
import {
  DeploymentNetwork,
  DEPLOYMENT_NETWORKS,
  DEPLOYMENT_STATUSES,
  ScriptDeployment,
  deploymentNetworkOf,
} from './types'

const HASH_256 = /^0x[0-9a-f]{64}$/
const HEX_QUANTITY = /^0x(0|[1-9a-f][0-9a-f]*)$/

const validate = (deployments: readonly ScriptDeployment[]): void => {
  const seenIds = new Set<string>()
  const seenProviderNetworks = new Set<string>()

  deployments.forEach(deployment => {
    const where = `script deployment "${deployment.id || '(missing id)'}"`

    if (!deployment.id) {
      throw new Error(`A ${where} is missing an id`)
    }
    if (seenIds.has(deployment.id)) {
      throw new Error(`Duplicate id in script deployment registry: "${deployment.id}"`)
    }
    seenIds.add(deployment.id)

    if (!deployment.providerId) {
      throw new Error(`${where} is missing a provider id`)
    }
    if (!DEPLOYMENT_NETWORKS.includes(deployment.network)) {
      throw new Error(`${where} names an unknown network "${deployment.network}"`)
    }
    if (!DEPLOYMENT_STATUSES.includes(deployment.status)) {
      throw new Error(`${where} has an unknown status "${deployment.status}"`)
    }
    if (!HASH_256.test(deployment.codeHash)) {
      throw new Error(`${where} has a malformed code hash "${deployment.codeHash}"`)
    }
    if (!Object.values(ScriptHashType).includes(deployment.hashType)) {
      throw new Error(`${where} has an unknown hash type "${deployment.hashType}"`)
    }
    if (!HASH_256.test(deployment.cellDep.txHash)) {
      throw new Error(`${where} has a malformed cell dep tx hash "${deployment.cellDep.txHash}"`)
    }
    if (!HEX_QUANTITY.test(deployment.cellDep.index)) {
      throw new Error(`${where} has a malformed cell dep index "${deployment.cellDep.index}"`)
    }
    if (!Object.values(DepType).includes(deployment.cellDep.depType)) {
      throw new Error(`${where} has an unknown dep type "${deployment.cellDep.depType}"`)
    }

    const providerNetwork = `${deployment.providerId}@${deployment.network}`
    if (seenProviderNetworks.has(providerNetwork)) {
      throw new Error(
        `More than one script deployment for provider "${deployment.providerId}" on ${deployment.network}`
      )
    }
    seenProviderNetworks.add(providerNetwork)
  })
}

/**
 * Central registry of externally deployed scripts.
 *
 * Bundled and versioned with the build. There is no remote manifest and no runtime substitution:
 * changing a deployment means shipping a Neuron release. Records are validated on construction, so
 * malformed bundled data fails at startup rather than producing a wrong cell dep at signing time.
 */
export default class ScriptDeploymentRegistry {
  private readonly deployments: readonly ScriptDeployment[]

  constructor(deployments: readonly ScriptDeployment[]) {
    validate(deployments)
    this.deployments = [...deployments]
  }

  public forProvider(providerId: string, network: Network): ScriptDeployment | undefined {
    const deploymentNetwork = deploymentNetworkOf(network)
    if (!deploymentNetwork) {
      return undefined
    }
    return this.onNetwork(deploymentNetwork).find(d => d.providerId === providerId)
  }

  public forScript(script: Script, network: Network): ScriptDeployment | undefined {
    const deploymentNetwork = deploymentNetworkOf(network)
    if (!deploymentNetwork) {
      return undefined
    }
    return this.onNetwork(deploymentNetwork).find(d => d.codeHash === script.codeHash && d.hashType === script.hashType)
  }

  public cellDepFor(providerId: string, network: Network): CellDep | undefined {
    const deployment = this.forProvider(providerId, network)
    if (!deployment) {
      return undefined
    }
    return new CellDep(new OutPoint(deployment.cellDep.txHash, deployment.cellDep.index), deployment.cellDep.depType)
  }

  public list(): ScriptDeployment[] {
    return [...this.deployments]
  }

  private onNetwork(network: DeploymentNetwork): readonly ScriptDeployment[] {
    return this.deployments.filter(d => d.network === network)
  }
}
