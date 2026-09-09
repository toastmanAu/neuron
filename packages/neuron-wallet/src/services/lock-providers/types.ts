import Script from '../../models/chain/script'
import CellDep from '../../models/chain/cell-dep'
import { Network } from '../../models/network'
import { ResolvedInput } from '../../models/ckb-tx-message-all'

/**
 * One witness slot of a lock group, in the shape the transaction sender already uses: the first
 * witness of a group is a structured `WitnessArgs`, every later witness is already-serialized bytes
 * (`'0x'` when empty).
 */
export type StructuredWitness = CKBComponents.WitnessArgs | CKBComponents.Witness

/**
 * Public material identifying one address of a wallet, independent of how that address is derived
 * or persisted. Providers consume whichever field they can use:
 *
 * - `publicKey` for locks whose args are a function of a public key (secp256k1_blake160);
 * - `args` when the args are already known (watch-only, imported identities);
 * - `metadata` for provider-specific parameters that are not recoverable from the script itself.
 *   An SLH-DSA identity, for example, must carry its FIPS 205 parameter set here: the lock args are
 *   a hash, so the parameter set cannot be recovered from the script.
 */
export interface PublicIdentity {
  readonly providerId: string
  readonly publicKey?: string
  readonly args?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

/**
 * Secret material handed to a provider at signing time. A discriminated union so that future
 * signing backends (hardware, encrypted PQ vault) can be added without widening the private-key
 * shape. Secret material is created inside the wallet process and is never returned to the renderer.
 */
/**
 * Provider-defined secret material, discriminated by `type`.
 *
 * Deliberately open: the shape a lock needs is the lock's business, and enumerating every provider's
 * secret here would couple this interface to each of them. Providers narrow with a type guard and
 * must validate what they receive — this crosses a trust boundary, so runtime checking is required
 * regardless of what the type says.
 */
export interface SecretMaterial {
  readonly type: string
  readonly [field: string]: unknown
}

export interface PrivateKeySecret extends SecretMaterial {
  readonly type: 'private-key'
  readonly privateKey: string
}

/**
 * Everything a provider needs to size a witness without a transaction in hand — used by fee
 * estimation before witnesses exist.
 */
export interface WitnessSizeContext {
  readonly lockScript: Script
  /** Provider-specific hints taken from the persisted identity, e.g. an SLH-DSA parameter set. */
  readonly metadata?: Readonly<Record<string, unknown>>
}

/**
 * Everything a provider needs to sign one lock group. `witnesses` is the group's witnesses in
 * transaction order; `witnesses[0]` must be a structured `WitnessArgs`.
 */
export interface SigningContext extends WitnessSizeContext {
  readonly transactionHash: string
  readonly witnesses: readonly StructuredWitness[]
  /**
   * The cell each input spends, in input order.
   *
   * Optional because secp sighash-all does not need it: that message is computed from the
   * transaction hash alone. Locks whose signing message commits to input contents — the FIPS 205
   * lock's `CKB_TX_MESSAGE_ALL` among them — require it and must refuse to sign without it rather
   * than hash an incomplete transaction.
   */
  readonly resolvedInputs?: readonly ResolvedInput[]
}

/**
 * Lock-specific behaviour for one CKB lock script family.
 *
 * A provider owns only what is lock-specific: which scripts it is, how to derive one, which cell
 * deps it needs, what its witness looks like, what it signs, and how the signature goes back into
 * the witness. Everything generic — cell selection, grouping, change, fee mode, persistence,
 * broadcast — stays in the transaction engine.
 *
 * Providers are registered from bundled code only. This is deliberately not a plugin system: there
 * is no path that loads or executes signing code from disk, network or user input at runtime.
 */
export interface LockProvider {
  /** Stable identifier, persisted alongside identities. Must not change once released. */
  readonly id: string

  /**
   * Positively identify a script as belonging to this provider's lock family.
   *
   * This is a script-identification predicate for provider *resolution*. It is intentionally
   * narrow: a provider must never claim a script it cannot correctly sign.
   */
  supports(script: Script, network: Network): boolean

  /** Build the lock script for one identity. */
  deriveScript(identity: PublicIdentity, network: Network): Promise<Script>

  /** Cell deps a transaction must carry in order to unlock cells guarded by this lock. */
  getCellDeps(network: Network): Promise<CellDep[]>

  /**
   * The group's first witness with a correctly sized, zero-filled signature placeholder in its
   * lock field. The placeholder size is what makes the signing message computable before a
   * signature exists, and it must equal the size of the real signature.
   */
  prepareWitness(context: SigningContext): Promise<CKBComponents.WitnessArgs>

  /**
   * Serialized byte length this lock's witness contributes to a transaction, including the fixvec
   * item-count and offset overhead. Used for fee estimation, so it must be exact rather than
   * conservative.
   */
  estimateWitnessSize(context: WitnessSizeContext): number

  /** The message this lock expects to be signed for the given group. */
  getSigningMessage(context: SigningContext): Promise<string>

  /** Produce a signature over `getSigningMessage(context)`. */
  sign(context: SigningContext, secret: SecretMaterial): Promise<string>

  /** Put `signature` into the group's first witness and return the serialized witness. */
  finalizeWitness(context: SigningContext, signature: string): Promise<string>
}
