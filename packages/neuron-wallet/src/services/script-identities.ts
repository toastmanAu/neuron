import ScriptIdentityEntity from '../database/chain/entities/script-identity'
import ScriptIdentityModel from '../models/script-identity'
import Script from '../models/chain/script'
import { getConnection } from '../database/chain/connection'

/**
 * Persistence for provider-backed identities.
 *
 * Separate from `AddressService`, which owns legacy HD secp addresses and their gap-limit
 * behaviour. Nothing here changes that behaviour.
 */
export default class ScriptIdentityService {
  /**
   * Persist identities, ignoring ones whose lock this wallet already tracks.
   *
   * Re-deriving the same identity must not create a second row, or balances would be counted twice
   * once the lock is watched.
   */
  public static async save(identities: ScriptIdentityModel[]): Promise<void> {
    if (identities.length === 0) {
      return
    }

    const repository = getConnection().getRepository(ScriptIdentityEntity)

    for (const identity of identities) {
      const existing = await repository.findOne({
        where: {
          walletId: identity.walletId,
          lockCodeHash: identity.lockCodeHash,
          lockHashType: identity.lockHashType,
          lockArgs: identity.lockArgs,
        },
      })
      if (existing) {
        continue
      }
      await repository.save(ScriptIdentityEntity.fromModel(identity))
    }
  }

  public static async getByWalletId(walletId: string): Promise<ScriptIdentityModel[]> {
    const entities = await getConnection()
      .getRepository(ScriptIdentityEntity)
      .find({
        where: { walletId },
        order: { addressType: 'ASC', addressIndex: 'ASC' },
      })
    return entities.map(entity => entity.toModel())
  }

  /**
   * Look up an identity by its complete lock script.
   *
   * Matching on the whole script rather than on args is the point of this table: two locks can share
   * args and differ in code hash or hash type, and treating them as the same identity would attribute
   * cells — and eventually signatures — to the wrong lock.
   */
  public static async getByLockScript(script: Script): Promise<ScriptIdentityModel | undefined> {
    const entity = await getConnection()
      .getRepository(ScriptIdentityEntity)
      .findOne({
        where: {
          lockCodeHash: script.codeHash,
          lockHashType: script.hashType,
          lockArgs: script.args,
        },
      })
    return entity?.toModel()
  }

  public static async getLockScriptsByWalletId(walletId: string): Promise<Script[]> {
    const identities = await ScriptIdentityService.getByWalletId(walletId)
    return identities.map(identity => identity.lockScript())
  }

  public static async deleteByWalletId(walletId: string): Promise<void> {
    await getConnection().getRepository(ScriptIdentityEntity).delete({ walletId })
  }
}
