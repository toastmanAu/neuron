import { hd } from '@ckb-lumos/lumos'
import { bytes } from '@ckb-lumos/lumos/codec'
import FileService from './file'
import ScriptIdentityService from './script-identities'
import ScriptIdentity from '../models/script-identity'
import SlhDsaKeystore, { IncorrectVaultPassword, SlhDsaKeystoreJson } from '../models/keys/slh-dsa-keystore'
import {
  deriveChildKeyPair,
  generateMasterSeed,
  masterSeedToMnemonic,
  mnemonicToMasterSeed,
  wordCount,
} from '../models/keys/slh-dsa-mnemonic'
import SlhDsaLockProvider, { SlhDsaSecret } from './lock-providers/slh-dsa/provider'
import { getParameterSet, SlhDsaParameterSetName } from './lock-providers/slh-dsa/parameter-sets'
import { Network } from '../models/network'
import { scriptToAddress } from '../utils/scriptAndAddress'
import { MAINNET_GENESIS_HASH } from '../models/network'

const fileService = FileService.getInstance()

/** Vaults live beside, not inside, the secp keystore directory so the two cannot be confused. */
const MODULE_NAME = 'pq-vaults'

export class VaultNotFound extends Error {
  constructor(walletId: string) {
    super(`No quantum-resistant key vault found for wallet ${walletId}`)
  }
}

export class VaultAlreadyExists extends Error {
  constructor(walletId: string) {
    super(`Wallet ${walletId} already has a quantum-resistant key vault`)
  }
}

export interface CreateSlhDsaWalletParams {
  walletId: string
  parameterSet: SlhDsaParameterSetName
  password: string
}

export interface ImportMnemonicParams extends CreateSlhDsaWalletParams {
  mnemonic: string
}

export interface CreatedSlhDsaWallet {
  publicKey: string
  parameterSet: SlhDsaParameterSetName
  /** The three BIP39 phrases behind this wallet. Shown once, at creation, and never stored. */
  mnemonic: string
}

/** The account a newly created wallet uses. Further accounts are derivable but not yet exposed. */
const FIRST_ACCOUNT_INDEX = 0

export class VaultHasNoMnemonic extends Error {
  constructor(walletId: string) {
    super(`Wallet ${walletId} was created before recovery phrases and has none`)
  }
}

export interface WatchOnlyParams {
  walletId: string
  publicKey: string
  parameterSet: SlhDsaParameterSetName
}

/**
 * Owns SLH-DSA key material and the identities derived from it.
 *
 * Separate from `WalletService`, which is built around an extended public key or a hardware device.
 * A FIPS 205 wallet has neither: it is one key pair, with no standard hierarchical derivation, whose
 * lock script differs between networks because the lock is deployed under a different code hash and
 * hash type on each.
 */
export default class SlhDsaWalletService {
  private static vaultFileName = (walletId: string) => `${walletId}.json`

  /**
   * Create the vault directory if it is not there yet.
   *
   * `FileService` throws `ModuleNotFound` for reads as well as writes, so this cannot be left to
   * the first write: on a fresh profile the first thing that happens is a read — `create` checks
   * `hasVault` before generating a key — and that threw before any vault had ever been written,
   * which made creating the very first quantum-resistant wallet impossible.
   */
  private static ensureModule(): void {
    if (!fileService.hasModule(MODULE_NAME)) {
      fileService.addModule(MODULE_NAME)
    }
  }

  public static hasVault(walletId: string): boolean {
    SlhDsaWalletService.ensureModule()
    return fileService.hasFile(MODULE_NAME, SlhDsaWalletService.vaultFileName(walletId))
  }

  /**
   * Generate a wallet and store its master seed encrypted.
   *
   * The seed comes from the platform CSPRNG. The returned mnemonic is the only copy the user will
   * ever be offered without their password, and it is not stored anywhere in the clear.
   */
  public static async create(
    { walletId, parameterSet, password }: CreateSlhDsaWalletParams,
    options: { kdfparams?: { n: number; r: number; p: number } } = {}
  ): Promise<CreatedSlhDsaWallet> {
    const masterSeed = generateMasterSeed(parameterSet)
    try {
      return SlhDsaWalletService.storeMasterSeed({ walletId, parameterSet, password }, masterSeed, options)
    } finally {
      masterSeed.fill(0)
    }
  }

  /**
   * Restore a wallet from its three BIP39 phrases.
   *
   * The parameter set is taken from the caller rather than guessed from the word count, because a
   * phrase of a given length is valid for several sets and picking the wrong one silently yields a
   * different wallet. The word count is then checked against it.
   */
  public static async importMnemonic(
    { walletId, parameterSet, password, mnemonic }: ImportMnemonicParams,
    options: { kdfparams?: { n: number; r: number; p: number } } = {}
  ): Promise<CreatedSlhDsaWallet> {
    const words = mnemonic.trim().split(/\s+/).filter(Boolean)
    const expected = wordCount(parameterSet)
    if (words.length !== expected) {
      throw new Error(`${parameterSet} needs a ${expected} word recovery phrase, got ${words.length} words`)
    }

    const masterSeed = mnemonicToMasterSeed(mnemonic)
    try {
      return SlhDsaWalletService.storeMasterSeed({ walletId, parameterSet, password }, masterSeed, options)
    } finally {
      masterSeed.fill(0)
    }
  }

  /**
   * Show the user their recovery phrase again.
   *
   * Behind the password, because the phrase is the wallet: anyone holding it can spend.
   */
  public static async exportMnemonic(walletId: string, password: string): Promise<string> {
    const keystore = SlhDsaWalletService.loadVault(walletId)
    if (keystore.payload !== 'master-seed') {
      throw new VaultHasNoMnemonic(walletId)
    }

    const masterSeed = bytes.bytify(keystore.decrypt(password))
    try {
      return masterSeedToMnemonic(masterSeed)
    } finally {
      masterSeed.fill(0)
    }
  }

  private static storeMasterSeed(
    { walletId, parameterSet, password }: CreateSlhDsaWalletParams,
    masterSeed: Uint8Array,
    options: { kdfparams?: { n: number; r: number; p: number } }
  ): CreatedSlhDsaWallet {
    if (SlhDsaWalletService.hasVault(walletId)) {
      throw new VaultAlreadyExists(walletId)
    }

    const { publicKey } = deriveChildKeyPair(masterSeed, parameterSet, FIRST_ACCOUNT_INDEX)
    const keystore = SlhDsaKeystore.create(
      {
        masterSeed: bytes.hexify(masterSeed),
        publicKey,
        parameterSet,
        accountIndex: FIRST_ACCOUNT_INDEX,
      },
      password,
      options
    )

    SlhDsaWalletService.writeVault(walletId, keystore)
    return { publicKey, parameterSet, mnemonic: masterSeedToMnemonic(masterSeed) }
  }

  public static loadVault(walletId: string): SlhDsaKeystore {
    if (!SlhDsaWalletService.hasVault(walletId)) {
      throw new VaultNotFound(walletId)
    }
    SlhDsaWalletService.ensureModule()
    return SlhDsaKeystore.fromJson(fileService.readFileSync(MODULE_NAME, SlhDsaWalletService.vaultFileName(walletId)))
  }

  /** The vault file is itself the backup: it already carries the key under the user's password. */
  public static exportBackup(walletId: string): SlhDsaKeystoreJson {
    return SlhDsaWalletService.loadVault(walletId).toJson()
  }

  /**
   * Restore a wallet from a backup.
   *
   * No password is taken here: the backup stays encrypted under the password it was created with, so
   * recovery does not offer an opportunity to re-key it to something weaker.
   */
  public static async importBackup(walletId: string, backup: string): Promise<void> {
    if (SlhDsaWalletService.hasVault(walletId)) {
      throw new VaultAlreadyExists(walletId)
    }
    const keystore = SlhDsaKeystore.fromJson(backup)
    // Reject anything that parses but is not a vault we can later open.
    getParameterSet(keystore.parameterSet)
    if (!keystore.crypto?.ciphertext || !keystore.crypto?.authTag) {
      throw new Error('Backup does not contain an encrypted quantum-resistant key')
    }
    SlhDsaWalletService.writeVault(walletId, keystore)
  }

  /**
   * Recover the signing key.
   *
   * A version 2 vault holds the master seed, so the key is derived here rather than stored; a
   * version 1 vault holds the expanded key itself and is returned as-is. The derived public key is
   * checked against the one the vault records, which catches a corrupted seed or a wrong account
   * index here instead of as a rejected transaction.
   */
  public static async getSecret(walletId: string, password: string): Promise<SlhDsaSecret> {
    const keystore = SlhDsaWalletService.loadVault(walletId)
    const plaintext = keystore.decrypt(password)

    if (keystore.payload === 'secret-key') {
      return { type: 'slh-dsa-secret-key', secretKey: plaintext, parameterSet: keystore.parameterSet }
    }

    const masterSeed = bytes.bytify(plaintext)
    try {
      const { publicKey, secretKey } = deriveChildKeyPair(
        masterSeed,
        keystore.parameterSet,
        keystore.accountIndex ?? FIRST_ACCOUNT_INDEX
      )
      if (publicKey !== keystore.publicKey) {
        throw new Error(`The key derived for wallet ${walletId} does not match the public key its vault records`)
      }
      return { type: 'slh-dsa-secret-key', secretKey, parameterSet: keystore.parameterSet }
    } finally {
      masterSeed.fill(0)
    }
  }

  /**
   * Create (or return) this wallet's identity on a network.
   *
   * One key pair yields a different script per network, because the lock is deployed under a
   * different code hash and hash type on mainnet and testnet.
   */
  public static async deriveIdentity(walletId: string, network: Network): Promise<ScriptIdentity> {
    const keystore = SlhDsaWalletService.loadVault(walletId)
    return SlhDsaWalletService.persistIdentity(
      walletId,
      keystore.publicKey,
      keystore.parameterSet,
      network,
      `vault:${walletId}`
    )
  }

  /** Track an address from a public key alone. No vault is written, so nothing can be signed. */
  public static async importWatchOnly(
    { walletId, publicKey, parameterSet }: WatchOnlyParams,
    network: Network
  ): Promise<ScriptIdentity> {
    return SlhDsaWalletService.persistIdentity(walletId, publicKey, parameterSet, network, null)
  }

  public static async delete(walletId: string): Promise<void> {
    if (SlhDsaWalletService.hasVault(walletId)) {
      SlhDsaWalletService.ensureModule()
      fileService.deleteFileSync(MODULE_NAME, SlhDsaWalletService.vaultFileName(walletId))
    }
    await ScriptIdentityService.deleteByWalletId(walletId)
  }

  private static async persistIdentity(
    walletId: string,
    publicKey: string,
    parameterSet: SlhDsaParameterSetName,
    network: Network,
    derivationPath: string | null
  ): Promise<ScriptIdentity> {
    const provider = new SlhDsaLockProvider()
    const script = await provider.deriveScript(
      { providerId: provider.id, publicKey, metadata: { parameterSet } },
      network
    )

    const identity = ScriptIdentity.fromObject({
      walletId,
      providerId: provider.id,
      addressType: hd.AddressType.Receiving,
      addressIndex: 0,
      address: scriptToAddress(script.toSDK(), network.genesisHash === MAINNET_GENESIS_HASH),
      lockCodeHash: script.codeHash,
      lockHashType: script.hashType,
      lockArgs: script.args,
      derivationPath,
      publicKey,
      // The parameter set cannot be recovered from the script, and the public key has to be
      // available at signing time because the witness carries it alongside the signature.
      metadata: { parameterSet, publicKey },
    })

    await ScriptIdentityService.save([identity])
    const stored = await ScriptIdentityService.getByLockScript(script)
    return stored ?? identity
  }

  private static writeVault(walletId: string, keystore: SlhDsaKeystore): void {
    SlhDsaWalletService.ensureModule()
    fileService.writeFileSync(
      MODULE_NAME,
      SlhDsaWalletService.vaultFileName(walletId),
      JSON.stringify(keystore.toJson())
    )
  }
}

export { IncorrectVaultPassword }
