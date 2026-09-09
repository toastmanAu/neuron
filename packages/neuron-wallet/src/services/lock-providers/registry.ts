import { LockProvider } from './types'
import Script from '../../models/chain/script'
import { Network } from '../../models/network'

/**
 * Registry of the lock providers compiled into this build.
 *
 * Providers are added by `register()` from bundled code at startup. There is no dynamic discovery,
 * no runtime load path and no way for a wallet, a network response or a user file to introduce a
 * provider — this is a lookup table, not a plugin host.
 */
export default class LockProviderRegistry {
  private readonly providers = new Map<string, LockProvider>()

  public register(provider: LockProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Lock provider "${provider.id}" is already registered`)
    }
    this.providers.set(provider.id, provider)
  }

  public get(id: string): LockProvider | undefined {
    return this.providers.get(id)
  }

  public getOrThrow(id: string): LockProvider {
    const provider = this.get(id)
    if (!provider) {
      throw new Error(`No lock provider registered with id "${id}"`)
    }
    return provider
  }

  /**
   * Find the provider that positively identifies `script`.
   *
   * Returns `undefined` rather than a default when nothing claims the script: an unidentified lock
   * must never fall through to some other provider's signing routine.
   */
  public resolve(script: Script, network: Network): LockProvider | undefined {
    return this.list().find(provider => provider.supports(script, network))
  }

  public resolveOrThrow(script: Script, network: Network): LockProvider {
    const provider = this.resolve(script, network)
    if (!provider) {
      throw new Error(
        `No lock provider recognises the script with code hash ${script.codeHash} (hash type ${script.hashType})`
      )
    }
    return provider
  }

  /** Registered providers, in registration order. */
  public list(): LockProvider[] {
    return [...this.providers.values()]
  }
}
