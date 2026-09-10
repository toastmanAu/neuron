import { v4 as uuid } from 'uuid'
import { WalletNotFound, IsRequired, UsedName, WalletFunctionNotSupported, DuplicateImportWallet } from '../exceptions'
import Store from '../models/store'
import { hd } from '@ckb-lumos/lumos'
import WalletDeletedSubject from '../models/subjects/wallet-deleted-subject'
import { WalletListSubject, CurrentWalletSubject } from '../models/subjects/wallets'
import { DefaultAddressNumber } from '../utils/scriptAndAddress'
import { Address as AddressInterface } from '../models/address'

import FileService from './file'
import AddressService from './addresses'
import { DeviceInfo } from './hardware/common'
import HdPublicKeyInfo from '../database/chain/entities/hd-public-key-info'
import { In, Not } from 'typeorm'
import { getConnection } from '../database/chain/connection'
import NetworksService from './networks'
import { NetworkType } from '../models/network'
import { resetSyncTaskQueue } from '../block-sync-renderer'
import SyncProgressService from './sync-progress'
import ScriptIdentityService from './script-identities'
import ScriptIdentity from '../models/script-identity'
import { prefixWith0x } from '../utils/scriptAndAddress'

const fileService = FileService.getInstance()

const MODULE_NAME = 'wallets'

export interface WalletProperties {
  id: string
  name: string
  extendedKey: string // Serialized account extended public key
  isHDWallet?: boolean
  device?: DeviceInfo
  keystore?: hd.Keystore
  startBlockNumber?: string
  /**
   * Lock provider backing this wallet, when it is not a legacy secp wallet.
   *
   * Absent on every wallet written by an earlier Neuron, which is what keeps those wallets on the
   * original signing path untouched.
   */
  lockProviderId?: string
}

export abstract class Wallet {
  public id: string
  public name: string
  public device?: DeviceInfo
  protected extendedKey: string = ''
  protected isHD: boolean
  protected startBlockNumber?: string
  protected lockProviderId?: string

  constructor(props: WalletProperties) {
    const { id, name, extendedKey, device, isHDWallet, startBlockNumber, lockProviderId } = props

    if (id === undefined) {
      throw new IsRequired('ID')
    }
    if (name === undefined) {
      throw new IsRequired('Name')
    }

    if (!extendedKey && !device && !lockProviderId) {
      throw new IsRequired('Extended Public Key or Device Info')
    }

    this.id = id
    this.name = name
    this.extendedKey = prefixWith0x(extendedKey)
    this.device = device
    this.isHD = isHDWallet ?? true
    this.startBlockNumber = startBlockNumber
    this.lockProviderId = lockProviderId
  }

  /**
   * The lock provider that owns this wallet's scripts, or undefined for legacy secp wallets.
   *
   * Read before signing so that a wallet with no provider never touches provider-backed code, and
   * in particular never incurs a database lookup it did not need before.
   */
  public getLockProviderId = (): string | undefined => {
    return this.lockProviderId
  }

  public toJSON = () => ({
    id: this.id,
    name: this.name,
    extendedKey: this.extendedKey,
    device: this.device,
    isHD: this.isHD,
    startBlockNumber: this.startBlockNumber,
    lockProviderId: this.lockProviderId,
  })

  public fromJSON = () => {
    throw new Error('not implemented')
  }

  public loadKeystore = (): hd.Keystore => {
    throw new WalletFunctionNotSupported(this.loadKeystore.name)
  }

  public saveKeystore = (_keystore: hd.Keystore): void => {
    throw new WalletFunctionNotSupported(this.saveKeystore.name)
  }

  public deleteKeystore = (): void => {
    throw new WalletFunctionNotSupported(this.deleteKeystore.name)
  }

  public getDeviceInfo = (): DeviceInfo => {
    throw new WalletFunctionNotSupported(this.getDeviceInfo.name)
  }

  public accountExtendedPublicKey = (): hd.AccountExtendedPublicKey => {
    throw new WalletFunctionNotSupported(this.accountExtendedPublicKey.name)
  }

  public update = ({
    name,
    device,
    startBlockNumber,
  }: Pick<Partial<WalletProperties>, 'name' | 'device' | 'startBlockNumber'>) => {
    if (name) {
      this.name = name
    }
    if (device) {
      this.device = device
    }
    if (startBlockNumber) {
      this.startBlockNumber = startBlockNumber
    }
  }

  public async needsGenerateAddress() {
    return false
  }

  public abstract checkAndGenerateAddresses(
    isImporting?: boolean,
    receivingAddressCount?: number,
    changeAddressCount?: number
  ): Promise<AddressInterface[] | undefined>

  public abstract getNextAddress(): Promise<AddressInterface | undefined>

  public abstract getNextChangeAddress(): Promise<AddressInterface | undefined>

  public abstract getNextReceivingAddresses(): Promise<AddressInterface[]>

  public abstract getAllAddresses(): Promise<AddressInterface[]>

  public abstract isHDWallet(): boolean

  public abstract isHardware(): boolean
}

export class FileKeystoreWallet extends Wallet {
  public isHardware = (): boolean => {
    return false
  }

  public isHDWallet() {
    return true
  }

  constructor(props: WalletProperties) {
    super(props)
    this.isHD = true
  }

  accountExtendedPublicKey = (): hd.AccountExtendedPublicKey => {
    return hd.AccountExtendedPublicKey.parse(this.extendedKey)
  }

  public toJSON = () => {
    return {
      id: this.id,
      name: this.name,
      extendedKey: this.extendedKey,
      device: this.device,
      isHD: this.isHD,
      startBlockNumber: this.startBlockNumber,
      lockProviderId: this.lockProviderId,
    }
  }

  public loadKeystore = () => {
    const data = fileService.readFileSync(MODULE_NAME, this.keystoreFileName())
    return hd.Keystore.fromJson(data)
  }

  static fromJSON = (json: WalletProperties) => {
    return new FileKeystoreWallet(json)
  }

  public saveKeystore = (keystore: hd.Keystore): void => {
    fileService.writeFileSync(MODULE_NAME, this.keystoreFileName(), JSON.stringify({ ...keystore, id: this.id }))
  }

  deleteKeystore = () => {
    fileService.deleteFileSync(MODULE_NAME, this.keystoreFileName())
  }

  keystoreFileName = () => {
    return `${this.id}.json`
  }

  public async needsGenerateAddress() {
    const [receiveCount, changeCount] = await AddressService.getAddressCountsToFillGapLimit(this.id)
    return receiveCount !== 0 || changeCount !== 0
  }

  public checkAndGenerateAddresses = async (
    isImporting: boolean = false,
    receivingAddressCount: number = DefaultAddressNumber.Receiving,
    changeAddressCount: number = DefaultAddressNumber.Change
  ): Promise<AddressInterface[] | undefined> => {
    return await AddressService.generateAndSaveForExtendedKeyQueue.asyncPush({
      walletId: this.id,
      extendedKey: this.accountExtendedPublicKey(),
      isImporting,
      receivingAddressCount,
      changeAddressCount,
    })
  }

  public getNextAddress = async (): Promise<AddressInterface | undefined> => {
    return AddressService.getNextUnusedAddressByWalletId(this.id)
  }

  public getNextChangeAddress = async (): Promise<AddressInterface | undefined> => {
    return AddressService.getNextUnusedChangeAddressByWalletId(this.id)
  }

  public getNextReceivingAddresses = async (): Promise<AddressInterface[]> => {
    return AddressService.getUnusedReceivingAddressesByWalletId(this.id)
  }

  public getAllAddresses = async (): Promise<AddressInterface[]> => {
    return AddressService.getAddressesByWalletId(this.id)
  }
}

export class HardwareWallet extends Wallet {
  public isHardware = (): boolean => {
    return true
  }

  public isHDWallet() {
    return this.isHD
  }

  constructor(props: WalletProperties) {
    super(props)
    this.isHD = false
  }

  accountExtendedPublicKey = (): hd.AccountExtendedPublicKey => {
    return hd.AccountExtendedPublicKey.parse(this.extendedKey)
  }

  static fromJSON = (json: WalletProperties) => {
    return new HardwareWallet(json)
  }

  public getDeviceInfo = (): DeviceInfo => {
    return this.device!
  }

  public checkAndGenerateAddresses = async (): Promise<AddressInterface[] | undefined> => {
    const { addressType, addressIndex } = this.getDeviceInfo()
    const { publicKey } = hd.AccountExtendedPublicKey.parse(this.extendedKey)
    const address = await AddressService.generateAndSaveForPublicKeyQueue.asyncPush({
      walletId: this.id,
      publicKey,
      addressType,
      addressIndex,
    })

    if (address) {
      return [address]
    }
  }

  public getNextAddress = async (): Promise<AddressInterface | undefined> => {
    return AddressService.getFirstAddressByWalletId(this.id)
  }

  public getNextChangeAddress = async (): Promise<AddressInterface | undefined> => {
    return AddressService.getFirstAddressByWalletId(this.id)
  }

  public getNextReceivingAddresses = async (): Promise<AddressInterface[]> => {
    const address = await AddressService.getFirstAddressByWalletId(this.id)
    if (address) {
      return [address]
    }

    return []
  }

  public getAllAddresses = async (): Promise<AddressInterface[]> => {
    return AddressService.getAddressesByWalletId(this.id)
  }
}

/**
 * A wallet whose addresses come from a lock provider rather than from HD secp derivation.
 *
 * It has no extended public key, no keystore and no BIP44 paths: an SLH-DSA wallet is one key pair
 * whose lock script differs per network. The HD-shaped address methods therefore throw
 * `WalletFunctionNotSupported`, the same way a hardware wallet refuses keystore operations — asking
 * an SLH-DSA wallet for its "next change address" is a category error, not a missing feature.
 *
 * `getAllAddresses()` returns an empty list rather than throwing, because callers treat it as "what
 * HD addresses does this wallet have" and the honest answer is none. Its real addresses are read
 * through `getScriptIdentities()`, which returns full lock scripts instead of blake160s.
 */
export class ScriptProviderWallet extends Wallet {
  public isHardware = (): boolean => false

  public isHDWallet(): boolean {
    return false
  }

  constructor(props: WalletProperties) {
    super(props)
    this.isHD = false
  }

  static fromJSON = (json: WalletProperties) => new ScriptProviderWallet(json)

  /** The wallet's real addresses, described by their complete lock scripts. */
  public getScriptIdentities = async (): Promise<ScriptIdentity[]> => {
    return ScriptIdentityService.getByWalletId(this.id)
  }

  public checkAndGenerateAddresses = async (): Promise<AddressInterface[] | undefined> => {
    // Identities are created when the wallet's key is generated or imported, not by gap-limit
    // scanning. Nothing to do, and nothing to fail.
    return undefined
  }

  public getAllAddresses = async (): Promise<AddressInterface[]> => []

  public getNextAddress = async (): Promise<AddressInterface | undefined> => {
    throw new WalletFunctionNotSupported('getNextAddress')
  }

  public getNextChangeAddress = async (): Promise<AddressInterface | undefined> => {
    throw new WalletFunctionNotSupported('getNextChangeAddress')
  }

  public getNextReceivingAddresses = async (): Promise<AddressInterface[]> => {
    throw new WalletFunctionNotSupported('getNextReceivingAddresses')
  }
}

export default class WalletService {
  private static instance: WalletService
  private listStore: Store // Save wallets (meta info except keystore, which is persisted separately)
  private walletsKey = 'wallets'
  private currentWalletKey = 'current'
  private importedWallet: Wallet | undefined

  public static getInstance = () => {
    if (!WalletService.instance) {
      WalletService.instance = new WalletService()
    }
    return WalletService.instance
  }

  constructor() {
    this.listStore = new Store(MODULE_NAME, 'wallets.json')

    this.listStore.on(
      this.walletsKey,
      (previousWalletList: WalletProperties[] = [], currentWalletList: WalletProperties[] = []) => {
        if (process.type === 'browser') {
          const currentWallet = this.getCurrent()
          WalletListSubject.next({ currentWallet, previousWalletList, currentWalletList })
        }
      }
    )
    this.listStore.on(this.currentWalletKey, (_prevId: string | undefined, currentID: string | undefined) => {
      if (undefined === currentID) {
        return
      }
      if (process.type === 'browser') {
        const currentWallet = this.getCurrent() || null
        const walletList = this.getAll()
        CurrentWalletSubject.next({
          currentWallet,
          walletList,
        })
      }
    })
  }

  private fromJSON(json: WalletProperties) {
    if (json.device) {
      return HardwareWallet.fromJSON(json)
    }
    // Checked before the keystore wallet, which would reject a wallet with no extended public key.
    // Absent on every wallet written by an earlier Neuron, so nothing existing changes route.
    if (json.lockProviderId) {
      return ScriptProviderWallet.fromJSON(json)
    }
    return FileKeystoreWallet.fromJSON(json)
  }

  private async cleanupAddresses() {
    const allWallets = this.getAll()
    await getConnection()
      .getRepository(HdPublicKeyInfo)
      .delete({
        walletId: Not(In(allWallets.map(w => w.id))),
      })
  }

  public getAll = (): WalletProperties[] => {
    return this.listStore.readSync(this.walletsKey) || []
  }

  public get = (id: string): Wallet => {
    if (id === undefined) {
      throw new IsRequired('ID')
    }

    const wallet = this.getAll().find(w => w.id === id)
    if (!wallet) {
      throw new WalletNotFound(id)
    }

    return this.fromJSON(wallet)
  }

  public maintainAddressesIfNecessary = async () => {
    for (const { id } of this.getAll()) {
      const wallet = this.get(id)
      if ((await AddressService.getAddressesByWalletId(wallet.id)).length === 0) {
        await wallet.checkAndGenerateAddresses()
      }
    }

    await this.cleanupAddresses()
  }

  public async checkAndGenerateAddress(walletIds: string[]) {
    for (const walletId of new Set(walletIds)) {
      const wallet = this.get(walletId)
      await wallet.checkAndGenerateAddresses()
    }
  }

  public async checkNeedGenerateAddress(walletIds: string[]) {
    for (const walletId of new Set(walletIds)) {
      const wallet = this.get(walletId)
      if (await wallet.needsGenerateAddress()) {
        return true
      }
    }
    return false
  }

  public create = (props: WalletProperties) => {
    if (!props) {
      throw new IsRequired('wallet property')
    }
    props = { ...props, extendedKey: prefixWith0x(props.extendedKey) }
    const index = this.getAll().findIndex(wallet => wallet.name === props.name)

    if (index !== -1) {
      throw new UsedName('Wallet')
    }

    const id = uuid()

    const wallet = this.fromJSON({ ...props, id })

    if (!wallet.isHardware() && !wallet.getLockProviderId()) {
      wallet.saveKeystore(props.keystore!)
    }

    // Duplicate detection keys off the extended public key. A provider-backed wallet has none, so
    // every one of them would look like a duplicate of the first; their uniqueness lives in their
    // key material and identities instead.
    const existWalletsProperties = wallet.getLockProviderId()
      ? []
      : this.getAll().filter(item => item.extendedKey === props.extendedKey)
    if (existWalletsProperties.length) {
      const existWallets = existWalletsProperties.map(v => this.get(v.id))
      const duplicateWatchedWalletIds = existWallets
        .filter(v => v.isHDWallet() && v.loadKeystore().isEmpty())
        .map(v => v.id)
      this.importedWallet = wallet
      throw new DuplicateImportWallet(
        JSON.stringify({
          duplicateWalletIds: existWallets.map(v => v.id),
          duplicateWatchedWalletIds,
          id,
        })
      )
    }

    this.listStore.writeSync(this.walletsKey, [...this.getAll(), wallet.toJSON()])

    this.setCurrent(wallet.id)
    return wallet
  }

  public replace = async (existingWalletId: string, importedWalletId: string) => {
    const wallet = this.get(existingWalletId)
    if (!wallet || !this.importedWallet) {
      throw new WalletNotFound(existingWalletId)
    }

    const newWallet = this.importedWallet?.toJSON()
    if (importedWalletId !== newWallet.id) {
      throw new WalletNotFound(importedWalletId)
    }
    if (wallet.toJSON().extendedKey !== newWallet.extendedKey) {
      throw new Error('The wallets are not the same and cannot be replaced.')
    }

    const wallets = this.getAll()

    this.listStore.writeSync(this.walletsKey, [...wallets, newWallet])

    this.setCurrent(newWallet.id)

    await AddressService.deleteByWalletId(existingWalletId)
    await SyncProgressService.deleteWalletSyncProgress(existingWalletId)

    const newWallets = wallets.filter(w => w.id !== existingWalletId)
    this.listStore.writeSync(this.walletsKey, [...newWallets, newWallet])

    if (!wallet.isHardware() && !wallet.getLockProviderId()) {
      wallet.deleteKeystore()
    }
  }

  public update = (id: string, props: Omit<WalletProperties, 'id' | 'extendedKey'>) => {
    const wallets = this.getAll()
    const index = wallets.findIndex((w: WalletProperties) => w.id === id)
    if (index === -1) {
      throw new WalletNotFound(id)
    }

    const wallet = this.fromJSON(wallets[index])

    if (wallet.name !== props.name && wallets.findIndex(storeWallet => storeWallet.name === props.name) !== -1) {
      throw new UsedName('Wallet')
    }

    wallet.update(props)

    if (props.keystore) {
      wallet.saveKeystore(props.keystore)
    }
    wallets[index] = wallet.toJSON()
    this.listStore.writeSync(this.walletsKey, wallets)
  }

  public delete = async (id: string) => {
    const wallets = this.getAll()
    const walletJSON = wallets.find(w => w.id === id)

    if (!walletJSON) {
      throw new WalletNotFound(id)
    }

    const wallet = this.fromJSON(walletJSON)
    const newWallets = wallets.filter(w => w.id !== id)

    const current = this.getCurrent()
    const currentID = current ? current.id : ''

    if (currentID === id) {
      if (newWallets.length > 0) {
        this.setCurrent(newWallets[0].id)
      } else {
        this.setCurrent('')
      }
    }

    await AddressService.deleteByWalletId(id)
    await ScriptIdentityService.deleteByWalletId(id)
    await SyncProgressService.deleteWalletSyncProgress(id)

    this.listStore.writeSync(this.walletsKey, newWallets)

    if (!wallet.isHardware() && !wallet.getLockProviderId()) {
      wallet.deleteKeystore()
    }

    if (process.send) {
      process.send({ channel: 'wallet-deleted', message: id })
    } else {
      WalletDeletedSubject.getSubject().next(id)
    }
  }

  public setCurrent = (id: string) => {
    if (id === undefined) {
      throw new IsRequired('ID')
    }

    if (id !== '') {
      const wallet = this.get(id)
      if (!wallet) {
        throw new WalletNotFound(id)
      }
    }

    const network = NetworksService.getInstance().getCurrent()
    if (network.type === NetworkType.Light) {
      resetSyncTaskQueue.asyncPush(true)
    }

    this.listStore.writeSync(this.currentWalletKey, id)
  }

  public getCurrent = () => {
    const walletId = this.listStore.readSync(this.currentWalletKey) as string
    if (walletId) {
      return this.get(walletId)
    }
    return undefined
  }

  public validate = ({ id, password }: { id: string; password: string }) => {
    const wallet = this.get(id)
    if (!wallet) {
      throw new WalletNotFound(id)
    }

    return wallet.loadKeystore().checkPassword(password)
  }

  public clearAll = () => {
    this.getAll().forEach(w => {
      const wallet = this.fromJSON(w)
      if (!wallet.isHardware() && !wallet.getLockProviderId()) {
        wallet.deleteKeystore()
      }
    })
    this.listStore.clear()
  }
}
