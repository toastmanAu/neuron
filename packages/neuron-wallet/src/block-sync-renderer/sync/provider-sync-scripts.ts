import ScriptIdentityService from '../../services/script-identities'
import WalletService from '../../services/wallets'

export interface ProviderSyncScript {
  script: CKBComponents.Script
  scriptType: CKBRPC.ScriptType
  walletId: string
}

/**
 * Lock scripts the sync layer must watch on behalf of provider-backed wallets.
 *
 * These cannot be derived the way HD addresses are. An SLH-DSA lock's args are a hash of its
 * parameter set and public key, so there is no blake160 to expand into the usual family of scripts —
 * the stored identity *is* the script, and it is watched whole. Watching by args alone would drop
 * the code hash that distinguishes the lock, and would match an unrelated script on another network.
 *
 * Returns an empty list when no wallet is provider-backed, which is every existing installation, so
 * the sync path is unchanged for them.
 */
const providerSyncScripts = async (walletIds?: string[]): Promise<ProviderSyncScript[]> => {
  // Gate on the in-memory wallet list before touching the database. Every existing installation has
  // no provider-backed wallet, and the sync path must not gain a database dependency — nor a new
  // failure mode — on their account.
  const ids =
    walletIds ??
    WalletService.getInstance()
      .getAll()
      .filter(wallet => wallet.lockProviderId)
      .map(wallet => wallet.id)
  if (ids.length === 0) {
    return []
  }

  const identities = await ScriptIdentityService.getAll()
  return identities
    .filter(identity => ids.includes(identity.walletId))
    .map(identity => ({
      script: identity.lockScript().toSDK(),
      scriptType: 'lock' as CKBRPC.ScriptType,
      walletId: identity.walletId,
    }))
}

export default providerSyncScripts
