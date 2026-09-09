import LockProviderRegistry from './registry'
import Secp256k1LockProvider from './secp256k1'
import SlhDsaLockProvider from './slh-dsa/provider'

export * from './types'
export { default as LockProviderRegistry } from './registry'
export { default as Secp256k1LockProvider } from './secp256k1'
export { default as SlhDsaLockProvider } from './slh-dsa/provider'

let defaultRegistry: LockProviderRegistry | undefined

/**
 * The lock providers compiled into this build.
 *
 * This list is the whole extension surface: adding a lock means adding a bundled provider here and
 * shipping a new Neuron release. Nothing is registered from disk, network or user input.
 *
 * Built lazily on first use, following the `getInstance()` convention used elsewhere in the wallet
 * process. It must stay lazy: `services/transaction-sender` sits on a pre-existing import cycle
 * (`system-script-info` -> `networks` -> `ckb-runner` -> `block-sync-renderer` -> ... ->
 * `asset-account-service` -> `transaction-sender`), so constructing a provider at module-evaluation
 * time can run while `./secp256k1` is still initialising and its default export is undefined.
 */
export const getDefaultLockProviderRegistry = (): LockProviderRegistry => {
  if (!defaultRegistry) {
    defaultRegistry = new LockProviderRegistry()
    defaultRegistry.register(new Secp256k1LockProvider())
    defaultRegistry.register(new SlhDsaLockProvider())
  }
  return defaultRegistry
}
