import { hd } from '@ckb-lumos/lumos'
import Script, { ScriptHashType } from './chain/script'

export interface ScriptIdentityProps {
  walletId: string
  providerId: string
  addressType: hd.AddressType
  addressIndex: number
  address: string
  lockCodeHash: string
  lockHashType: ScriptHashType
  lockArgs: string
  /** BIP44 path when the identity is derived from a seed; null for imported or watch-only ones. */
  derivationPath?: string | null
  publicKey?: string | null
  /**
   * Provider-specific data that cannot be recovered from the script.
   *
   * An SLH-DSA lock's args are a hash, so its parameter set is unrecoverable from the script alone.
   * Without it a restored wallet cannot size a witness or produce a signature.
   */
  metadata?: Record<string, unknown> | null
  description?: string | null
}

/**
 * One address of a wallet, described by its complete lock script rather than by a blake160.
 *
 * This exists alongside `HdPublicKeyInfo`, which stays in place for legacy HD secp wallets. Storing
 * a non-secp lock's args in a field named `publicKeyInBlake160` would be a lie about the data, and
 * the code that reads that field reconstructs a secp script from it.
 */
export default class ScriptIdentity implements ScriptIdentityProps {
  public walletId: string
  public providerId: string
  public addressType: hd.AddressType
  public addressIndex: number
  public address: string
  public lockCodeHash: string
  public lockHashType: ScriptHashType
  public lockArgs: string
  public derivationPath: string | null
  public publicKey: string | null
  public metadata: Record<string, unknown> | null
  public description: string | null

  constructor(props: ScriptIdentityProps) {
    this.walletId = props.walletId
    this.providerId = props.providerId
    this.addressType = props.addressType
    this.addressIndex = props.addressIndex
    this.address = props.address
    this.lockCodeHash = props.lockCodeHash
    this.lockHashType = props.lockHashType
    this.lockArgs = props.lockArgs
    this.derivationPath = props.derivationPath ?? null
    this.publicKey = props.publicKey ?? null
    this.metadata = props.metadata ?? null
    this.description = props.description ?? null
  }

  public static fromObject(props: ScriptIdentityProps): ScriptIdentity {
    return new ScriptIdentity(props)
  }

  public lockScript(): Script {
    return new Script(this.lockCodeHash, this.lockArgs, this.lockHashType)
  }

  public lockHash(): string {
    return this.lockScript().computeHash()
  }

  /**
   * Whether this identity can only be observed.
   *
   * An identity with no derivation path was not derived from a seed this wallet holds, so nothing
   * here can produce a signature for it. Whether secret material exists for a derived identity is a
   * separate question owned by the wallet's keystore or vault.
   */
  public isWatchOnly(): boolean {
    return this.derivationPath === null
  }
}
