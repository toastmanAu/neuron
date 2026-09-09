import ScriptDeploymentRegistry from './registry'
import { BUNDLED_SCRIPT_DEPLOYMENTS } from './deployments'

export * from './types'
export * from './deployments'
export { default as ScriptDeploymentRegistry } from './registry'

let defaultRegistry: ScriptDeploymentRegistry | undefined

/**
 * The externally deployed scripts this build knows about.
 *
 * Built lazily and memoised, matching the `getInstance()` convention used elsewhere in the wallet
 * process and avoiding validation work at module-evaluation time.
 */
export const getDefaultScriptDeploymentRegistry = (): ScriptDeploymentRegistry => {
  if (!defaultRegistry) {
    defaultRegistry = new ScriptDeploymentRegistry(BUNDLED_SCRIPT_DEPLOYMENTS)
  }
  return defaultRegistry
}
