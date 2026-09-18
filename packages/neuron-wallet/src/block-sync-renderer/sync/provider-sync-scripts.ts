import ScriptIdentityService from '../../services/script-identities'
import ScriptIdentity from '../../models/script-identity'

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
/**
 * Stored identities, or none if the chain database is not ready yet.
 *
 * The wallet store cannot be used to decide whether to look: this runs inside the block-sync
 * renderer, where `electron.app` is undefined, `env` falls back to a temp directory, and
 * `WalletService.getAll()` therefore returns nothing however many wallets exist. Gating on it meant
 * a provider-backed lock was never watched and its cells were scanned straight past.
 *
 * So the identity table decides — but it is read defensively, because these functions are reached
 * from sync paths that also run before a connection is established. "No connection yet" means
 * "nothing known to watch yet", which is true, and sync asks again on the next tick. An existing
 * installation has no rows here and so is unaffected either way, which is what the previous
 * wallet-store gate was protecting and this preserves.
 */
const storedIdentities = async (): Promise<ScriptIdentity[]> => {
  try {
    return await ScriptIdentityService.getAll()
  } catch {
    return []
  }
}

const providerSyncScripts = async (walletIds?: string[]): Promise<ProviderSyncScript[]> => {
  // The stored identities are the source of truth here, not the wallet list.
  //
  // This runs inside the block-sync renderer, where `electron.app` is undefined, so `env` falls back
  // to a temp directory and the wallet store reads an empty file: `WalletService.getAll()` returns
  // nothing no matter how many wallets exist. Gating on it meant a provider-backed lock was never
  // watched and its cells were scanned straight past.
  //
  // Reading the table directly costs existing installations nothing — it is empty unless a
  // provider-backed wallet has been created, which is what the gate was protecting against.
  const identities = await storedIdentities()
  return identities
    .filter(identity => !walletIds || walletIds.includes(identity.walletId))
    .map(identity => ({
      script: identity.lockScript().toSDK(),
      scriptType: 'lock' as CKBRPC.ScriptType,
      walletId: identity.walletId,
    }))
}

/**
 * Provider-backed identities grouped by wallet.
 *
 * The full-node sync path drives its indexer cache per wallet from address metadata. A
 * provider-backed wallet has none, so it never appears in that loop and needs its own pass.
 */
export const providerIdentitiesByWallet = async (): Promise<Map<string, ScriptIdentity[]>> => {
  // Same reasoning as above: the wallet store is unreadable from this process, so the identity
  // table decides. It has a row only when a provider-backed wallet exists.
  const grouped = new Map<string, ScriptIdentity[]>()
  for (const identity of await storedIdentities()) {
    grouped.set(identity.walletId, [...(grouped.get(identity.walletId) ?? []), identity])
  }
  return grouped
}

export default providerSyncScripts
