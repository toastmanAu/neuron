import { ResponseCode } from '../utils/const'
import WalletService from '../services/wallets'
import NetworksService from '../services/networks'
import SlhDsaWalletService from '../services/slh-dsa-wallets'
import ScriptIdentity from '../models/script-identity'
import {
  estimateWitnessSize,
  getParameterSet,
  SLH_DSA_PARAMETER_SETS,
  SlhDsaParameterSetName,
} from '../services/lock-providers/slh-dsa/parameter-sets'
import { SLH_DSA_PROVIDER_ID } from '../models/script-deployments'
import { bytes } from '@ckb-lumos/lumos/codec'

/** What the renderer needs to describe one parameter set. Never includes key material. */
export interface ParameterSetSummary {
  name: SlhDsaParameterSetName
  publicKeyLength: number
  signatureLength: number
  /** Serialized bytes the witness adds to a transaction, which is what the fee is charged on. */
  witnessSize: number
  /**
   * SHAKE sets are several times slower to sign in JavaScript than their SHA2 equivalents, and
   * signing happens in the main process. Measured, not assumed: SHAKE-256s takes ~14s where
   * SHA2-256s takes ~3s.
   */
  slowSigning: boolean
}

/** A provider-backed address, described honestly: a full lock script, not a blake160. */
export interface SlhDsaAddress {
  address: string
  lockCodeHash: string
  lockHashType: string
  lockArgs: string
  addressType: number
  addressIndex: number
  parameterSet?: string
  watchOnly: boolean
}

const toAddress = (identity: ScriptIdentity): SlhDsaAddress => ({
  address: identity.address,
  lockCodeHash: identity.lockCodeHash,
  lockHashType: identity.lockHashType,
  lockArgs: identity.lockArgs,
  addressType: identity.addressType,
  addressIndex: identity.addressIndex,
  parameterSet: identity.metadata?.parameterSet as string | undefined,
  watchOnly: identity.isWatchOnly(),
})

export interface CreatedWallet {
  id: string
  name: string
  addresses: SlhDsaAddress[]
  /** Present only when the phrase was generated here, i.e. on creation. */
  mnemonic?: string
}

/**
 * Renderer-facing operations for quantum-resistant wallets.
 *
 * Separate from `WalletsController`, which is built around mnemonics, keystores and HD derivation —
 * none of which an SLH-DSA wallet has. Nothing here returns key material or a password.
 */
export default class SlhDsaWalletsController {
  public async getParameterSets(): Promise<{ status: ResponseCode; result?: ParameterSetSummary[] }> {
    const result = Object.values(SLH_DSA_PARAMETER_SETS).map(set => ({
      name: set.name,
      publicKeyLength: set.publicKeyLength,
      signatureLength: set.signatureLength,
      witnessSize: estimateWitnessSize(set.name),
      slowSigning: set.name.includes('SHAKE'),
    }))
    return { status: ResponseCode.Success, result }
  }

  public async createWallet(params: {
    name: string
    password: string
    /** Untrusted at this boundary: narrowed by `getParameterSet`, which rejects anything unknown. */
    parameterSet: string
  }): Promise<{ status: ResponseCode; result?: CreatedWallet }> {
    const parameterSet = SlhDsaWalletsController.checkedParameterSet(params)

    return SlhDsaWalletsController.withWalletRecord(params.name, async walletId => {
      const { mnemonic } = await SlhDsaWalletService.create(
        { walletId, parameterSet, password: params.password },
        undefined
      )
      // Returned once, at creation, and never stored. This is the only moment the user can write
      // it down without their password.
      return { mnemonic }
    })
  }

  /** Restore a wallet from its three BIP39 phrases. */
  public async importMnemonic(params: {
    name: string
    password: string
    parameterSet: string
    mnemonic: string
  }): Promise<{ status: ResponseCode; result?: CreatedWallet }> {
    const parameterSet = SlhDsaWalletsController.checkedParameterSet(params)

    return SlhDsaWalletsController.withWalletRecord(params.name, async walletId => {
      await SlhDsaWalletService.importMnemonic(
        { walletId, parameterSet, password: params.password, mnemonic: params.mnemonic },
        undefined
      )
      // Deliberately not echoed back: the renderer already has it, and returning it would put a
      // second copy of the wallet across the boundary and into whatever the caller logs.
      return {}
    })
  }

  /** Show a wallet's recovery phrase again. Behind the password, because the phrase is the wallet. */
  public async exportMnemonic(params: {
    walletID: string
    password: string
  }): Promise<{ status: ResponseCode; result?: string }> {
    if (!params.password) {
      throw new Error('A password is required to show a recovery phrase')
    }
    return {
      status: ResponseCode.Success,
      result: await SlhDsaWalletService.exportMnemonic(params.walletID, params.password),
    }
  }

  private static checkedParameterSet(params: { password: string; parameterSet: string }): SlhDsaParameterSetName {
    if (!params.password) {
      throw new Error('A password is required to create a quantum-resistant wallet')
    }
    // Both checks run before any wallet record exists, so a bad request leaves nothing behind.
    return getParameterSet(params.parameterSet as SlhDsaParameterSetName).name
  }

  /**
   * Create the wallet record, run `withWallet`, and derive the identity for the current network.
   *
   * A wallet listed with no vault behind it is visible, unusable and awkward to remove, so anything
   * that throws takes the record with it.
   */
  private static async withWalletRecord(
    name: string,
    withWallet: (walletId: string) => Promise<{ mnemonic?: string }>
  ): Promise<{ status: ResponseCode; result?: CreatedWallet }> {
    const network = NetworksService.getInstance().getCurrent()
    const wallet = WalletService.getInstance().create({
      id: '',
      name,
      extendedKey: '',
      lockProviderId: SLH_DSA_PROVIDER_ID,
    })

    try {
      const extra = await withWallet(wallet.id)
      const identity = await SlhDsaWalletService.deriveIdentity(wallet.id, network)
      return {
        status: ResponseCode.Success,
        result: { id: wallet.id, name: wallet.name, addresses: [toAddress(identity)], ...extra },
      }
    } catch (error) {
      await WalletService.getInstance().delete(wallet.id)
      throw error
    }
  }

  public async getAddresses(params: { walletID: string }): Promise<{ status: ResponseCode; result?: SlhDsaAddress[] }> {
    const network = NetworksService.getInstance().getCurrent()
    const identity = await SlhDsaWalletService.deriveIdentity(params.walletID, network)
    return { status: ResponseCode.Success, result: [toAddress(identity)] }
  }

  public async exportBackup(params: { walletID: string }): Promise<{ status: ResponseCode; result?: unknown }> {
    return { status: ResponseCode.Success, result: SlhDsaWalletService.exportBackup(params.walletID) }
  }

  public async importBackup(params: {
    name: string
    backup: string
  }): Promise<{ status: ResponseCode; result?: { id: string; name: string } }> {
    const wallet = WalletService.getInstance().create({
      id: '',
      name: params.name,
      extendedKey: '',
      lockProviderId: SLH_DSA_PROVIDER_ID,
    })
    try {
      await SlhDsaWalletService.importBackup(wallet.id, params.backup)
      return { status: ResponseCode.Success, result: { id: wallet.id, name: wallet.name } }
    } catch (error) {
      await WalletService.getInstance().delete(wallet.id)
      throw error
    }
  }

  public async importWatchOnly(params: {
    name: string
    publicKey: string
    parameterSet: string
  }): Promise<{ status: ResponseCode; result?: { id: string; name: string; addresses: SlhDsaAddress[] } }> {
    const set = getParameterSet(params.parameterSet as SlhDsaParameterSetName)
    const length = bytes.bytify(params.publicKey).byteLength
    if (length !== set.publicKeyLength) {
      throw new Error(`${set.name} expects a ${set.publicKeyLength} byte public key, got ${length}`)
    }

    const network = NetworksService.getInstance().getCurrent()
    const wallet = WalletService.getInstance().create({
      id: '',
      name: params.name,
      extendedKey: '',
      lockProviderId: SLH_DSA_PROVIDER_ID,
    })
    try {
      const identity = await SlhDsaWalletService.importWatchOnly(
        { walletId: wallet.id, publicKey: params.publicKey, parameterSet: set.name },
        network
      )
      return {
        status: ResponseCode.Success,
        result: { id: wallet.id, name: wallet.name, addresses: [toAddress(identity)] },
      }
    } catch (error) {
      await WalletService.getInstance().delete(wallet.id)
      throw error
    }
  }
}
