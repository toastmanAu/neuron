import crypto from 'crypto'
import { hd } from '@ckb-lumos/lumos'
import { bytes } from '@ckb-lumos/lumos/codec'
import FileService from './file'
import ScriptIdentityService from './script-identities'
import ScriptIdentity from '../models/script-identity'
import SlhDsaKeystore, { IncorrectVaultPassword, SlhDsaKeystoreJson } from '../models/keys/slh-dsa-keystore'
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

  public static hasVault(walletId: string): boolean {
    return fileService.hasFile(MODULE_NAME, SlhDsaWalletService.vaultFileName(walletId))
  }

  /**
   * Generate a key pair and store it encrypted.
   *
   * The seed comes from the platform CSPRNG and is wiped after key generation. The returned public
   * key is not secret and is what the caller needs in order to show an address.
   */
  public static async create(
    { walletId, parameterSet, password }: CreateSlhDsaWalletParams,
    options: { kdfparams?: { n: number; r: number; p: number } } = {}
  ): Promise<{ publicKey: string; parameterSet: SlhDsaParameterSetName }> {
    if (SlhDsaWalletService.hasVault(walletId)) {
      throw new VaultAlreadyExists(walletId)
    }

    const set = getParameterSet(parameterSet)
    // FIPS 205 key generation consumes three n-byte seeds: SK.seed, SK.prf and PK.seed.
    const seed = crypto.randomBytes(set.publicKeyLength + set.publicKeyLength / 2)
    try {
      const { secretKey, publicKey } = set.signer.keygen(seed)
      const keystore = SlhDsaKeystore.create(
        {
          secretKey: bytes.hexify(secretKey),
          publicKey: bytes.hexify(publicKey),
          parameterSet,
        },
        password,
        options
      )
      secretKey.fill(0)

      SlhDsaWalletService.writeVault(walletId, keystore)
      return { publicKey: bytes.hexify(publicKey), parameterSet }
    } finally {
      seed.fill(0)
    }
  }

  public static loadVault(walletId: string): SlhDsaKeystore {
    if (!SlhDsaWalletService.hasVault(walletId)) {
      throw new VaultNotFound(walletId)
    }
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

  public static async getSecret(walletId: string, password: string): Promise<SlhDsaSecret> {
    const keystore = SlhDsaWalletService.loadVault(walletId)
    const secretKey = keystore.decrypt(password)
    return { type: 'slh-dsa-secret-key', secretKey, parameterSet: keystore.parameterSet }
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
    fileService.addModule(MODULE_NAME)
    fileService.writeFileSync(
      MODULE_NAME,
      SlhDsaWalletService.vaultFileName(walletId),
      JSON.stringify(keystore.toJson())
    )
  }
}

export { IncorrectVaultPassword }
