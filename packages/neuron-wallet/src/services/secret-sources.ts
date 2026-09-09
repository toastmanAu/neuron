import { SecretMaterial } from './lock-providers/types'
import SlhDsaWalletService from './slh-dsa-wallets'
import { SLH_DSA_PROVIDER_ID } from '../models/script-deployments'

/**
 * How to obtain secret material for a wallet, per lock provider.
 *
 * A lock provider says how a lock works; where its secret lives is a separate question, and the two
 * should not be conflated. Keeping this in its own registry means the transaction sender does not
 * have to know that SLH-DSA keys live in a vault while secp keys live in a Lumos keystore, and a
 * future hardware-backed PQ signer can be added without touching the sender.
 *
 * Secret material is produced inside the wallet process and never returned to the renderer.
 */
export type SecretSource = (walletId: string, password: string) => Promise<SecretMaterial>

export class SecretSourceRegistry {
  private readonly sources = new Map<string, SecretSource>()

  public register(providerId: string, source: SecretSource): void {
    if (this.sources.has(providerId)) {
      throw new Error(`A secret source is already registered for provider "${providerId}"`)
    }
    this.sources.set(providerId, source)
  }

  public get(providerId: string): SecretSource | undefined {
    return this.sources.get(providerId)
  }

  public getOrThrow(providerId: string): SecretSource {
    const source = this.get(providerId)
    if (!source) {
      throw new Error(`No secret source is registered for provider "${providerId}", so it cannot sign`)
    }
    return source
  }
}

let defaultRegistry: SecretSourceRegistry | undefined

/** Built lazily, so nothing is constructed at module-evaluation time. */
export const getDefaultSecretSourceRegistry = (): SecretSourceRegistry => {
  if (!defaultRegistry) {
    defaultRegistry = new SecretSourceRegistry()
    defaultRegistry.register(SLH_DSA_PROVIDER_ID, (walletId: string, password: string) =>
      SlhDsaWalletService.getSecret(walletId, password)
    )
  }
  return defaultRegistry
}
