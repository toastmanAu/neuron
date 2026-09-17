import { t } from 'i18next'
import { dialog } from 'electron'
import { serializeWitnessArgs } from '../utils/serialization'
import { scriptToAddress } from '../utils/scriptAndAddress'
import { TargetOutput, TransactionGenerator, TransactionPersistor } from './tx'
import AddressService from './addresses'
import WalletService, { Wallet } from '../services/wallets'
import RpcService from '../services/rpc-service'
import { Address } from '../models/address'
import FeeMode from '../models/fee-mode'
import TransactionSize from '../models/transaction-size'
import TransactionFee from '../models/transaction-fee'
import Input from '../models/chain/input'
import OutPoint from '../models/chain/out-point'
import Output from '../models/chain/output'
import WitnessArgs from '../models/chain/witness-args'
import Transaction from '../models/chain/transaction'
import Script from '../models/chain/script'
import Multisig from '../models/multisig'
import Blake2b from '../models/blake2b'
import logger from '../utils/logger'
import {
  getDefaultLockProviderRegistry,
  LockProviderRegistry,
  Secp256k1LockProvider,
  SigningContext,
  StructuredWitness,
} from './lock-providers'
import { bytes, Uint64LE } from '@ckb-lumos/lumos/codec'
import SystemScriptInfo from '../models/system-script-info'
import AddressParser from '../models/address-parser'
import HardwareWalletService from './hardware'
import {
  CapacityNotEnoughForChange,
  CapacityNotEnoughForChangeByTransfer,
  CellIsNotYetLive,
  MultisigConfigNeedError,
  NoMatchAddressForSign,
  SignTransactionFailed,
  TransactionIsNotCommittedYet,
  UnrecognizedLockScript,
} from '../exceptions'
import AssetAccountInfo from '../models/asset-account-info'
import MultisigConfigModel from '../models/multisig-config'
import { Hardware } from './hardware/hardware'
import MultisigService from './multisig'
import AmendTransactionService from './amend-transaction'
import { getMultisigStatus } from '../utils/multisig'
import { SignStatus } from '../models/offline-sign'
import NetworksService from './networks'
import { generateRPC } from '../utils/ckb-rpc'
import CellsService from './cells'
import ScriptIdentityService from './script-identities'
import ScriptIdentityModel from '../models/script-identity'
import resolveInputsForSigning from './tx/resolve-inputs'
import ScriptDeploymentChecker from './script-deployment-checks'
import { getDefaultSecretSourceRegistry, SecretSourceRegistry } from './secret-sources'
import { hd } from '@ckb-lumos/lumos'
import { getClusterByOutPoint } from '@spore-sdk/core'
import CellDep, { DepType } from '../models/chain/cell-dep'
import { dao } from '@ckb-lumos/lumos/common-scripts'

interface SignInfo {
  witnessArgs: WitnessArgs
  lockHash: string
  witness: string
  lockArgs: string
}

interface PathAndPrivateKey {
  path: string
  privateKey: string
}

export default class TransactionSender {
  static MULTISIGN_ARGS_LENGTH = 58

  private walletService: WalletService

  private lockProviders: LockProviderRegistry

  private secretSources: SecretSourceRegistry

  private deploymentChecker: ScriptDeploymentChecker

  constructor(
    lockProviders: LockProviderRegistry = getDefaultLockProviderRegistry(),
    secretSources: SecretSourceRegistry = getDefaultSecretSourceRegistry(),
    deploymentChecker: ScriptDeploymentChecker = new ScriptDeploymentChecker()
  ) {
    this.walletService = WalletService.getInstance()
    this.lockProviders = lockProviders
    this.secretSources = secretSources
    this.deploymentChecker = deploymentChecker
  }

  public async sendTx(
    walletID: string = '',
    transaction: Transaction,
    password: string = '',
    skipLastInputs: boolean = true,
    skipSign = false,
    amendHash = ''
  ) {
    const tx = skipSign
      ? Transaction.fromObject(transaction)
      : await this.sign(walletID, transaction, password, skipLastInputs)

    return this.broadcastTx(walletID, tx, amendHash)
  }

  public async sendMultisigTx(
    walletID: string = '',
    transaction: Transaction,
    password: string = '',
    multisigConfigs: MultisigConfigModel[],
    skipSign = false
  ) {
    const tx = skipSign
      ? Transaction.fromObject(transaction)
      : await this.signMultisig(walletID, transaction, password, multisigConfigs)

    return this.broadcastTx(walletID, tx)
  }

  public async broadcastTx(walletID: string = '', tx: Transaction, amendHash = '') {
    const currentNetwork = NetworksService.getInstance().getCurrent()
    const rpc = generateRPC(currentNetwork.remote, currentNetwork.type)
    await rpc.sendTransaction(tx.toSDKRawTransaction(), 'passthrough')
    const txHash = tx.hash!

    await TransactionPersistor.saveSentTx(tx, txHash)
    await MultisigService.saveSentMultisigOutput(tx)
    if (amendHash) {
      await AmendTransactionService.save(txHash, amendHash)
    }

    if (walletID) {
      const wallet = WalletService.getInstance().get(walletID)
      await wallet.checkAndGenerateAddresses()
    }
    return txHash
  }

  public async sign(
    walletID: string = '',
    transaction: Transaction,
    password: string = '',
    skipLastInputs: boolean = true,
    context?: RPC.RawTransaction[]
  ) {
    const wallet = this.walletService.get(walletID)
    const tx = Transaction.fromObject(transaction)
    const txHash: string = tx.computeHash()
    if (wallet.isHardware()) {
      let device = HardwareWalletService.getInstance().getCurrent()
      if (!device) {
        const wallet = WalletService.getInstance().getCurrent()
        const deviceInfo = wallet!.getDeviceInfo()
        device = await HardwareWalletService.getInstance().initHardware(deviceInfo)
        await device.connect()
      }
      try {
        return await device.signTx(walletID, tx, txHash, skipLastInputs, context)
      } catch (err) {
        if (err instanceof TypeError) {
          throw err
        }
        throw new SignTransactionFailed(err.message)
      }
    }

    // Only a wallet that declares a lock provider takes the provider path. Deciding this from the
    // wallet rather than by looking for stored identities matters: a database query here would add
    // a failure mode to signing for every legacy secp wallet, which have no provider and never did.
    if (wallet.getLockProviderId?.()) {
      return this.signWithLockProviders(walletID, tx, txHash, password, skipLastInputs, context)
    }

    // Only one multi sign input now.
    const isMultisig =
      tx.inputs.length === 1 && tx.inputs[0].lock!.args.length === TransactionSender.MULTISIGN_ARGS_LENGTH

    const addressInfos = await this.getAddressInfos(walletID)
    const multiSignBlake160s = isMultisig
      ? addressInfos.map(i => {
          return {
            multiSignBlake160: Multisig.hash([i.blake160]),
            path: i.path,
          }
        })
      : []
    const paths = addressInfos.map(info => info.path)
    const pathAndPrivateKeys = this.getPrivateKeys(wallet, paths, password)
    const findPrivateKey = (args: string) => {
      let path: string | undefined
      if (args.length === TransactionSender.MULTISIGN_ARGS_LENGTH) {
        path = multiSignBlake160s.find(i => args.slice(0, 42) === i.multiSignBlake160)!.path
      } else if (args.length === 42) {
        path = addressInfos.find(i => i.blake160 === args)!.path
      } else {
        const addressInfo = AssetAccountInfo.findSignPathForCheque(addressInfos, args)
        path = addressInfo?.path
      }

      const pathAndPrivateKey = pathAndPrivateKeys.find(p => p.path === path)
      if (!pathAndPrivateKey) {
        throw new Error('no private key found')
      }
      return pathAndPrivateKey.privateKey
    }

    const witnessSigningEntries: SignInfo[] = tx.inputs
      .slice(0, skipLastInputs ? -1 : tx.inputs.length)
      .map((input: Input, index: number) => {
        const lockArgs: string = input.lock!.args!
        const wit: WitnessArgs | string = tx.witnesses[index]
        const witnessArgs: WitnessArgs = wit instanceof WitnessArgs ? wit : WitnessArgs.generateEmpty()
        return {
          // TODO: fill in required DAO's type witness here
          witnessArgs,
          lockHash: input.lockHash!,
          witness: '',
          lockArgs,
        }
      })

    const lockHashes = new Set(witnessSigningEntries.map(w => w.lockHash))

    // Software signing is routed through the secp256k1 sighash-all provider, selected explicitly by
    // id rather than resolved from the input's lock script. That is deliberate and must not be
    // "tightened" into a `supports()` check without a matching change to key resolution: this path
    // also signs anyone-can-pay, cheque and sUDT-ACP inputs, which carry different code hashes but
    // use the same secp sighash-all witness convention. Gating on script identity here would stop
    // asset-account transactions from being signed. Provider-per-script resolution arrives with the
    // script-identity work, together with the identity records that say which provider owns a lock.
    const lockProvider = this.lockProviders.getOrThrow(Secp256k1LockProvider.ID)

    for (const lockHash of lockHashes) {
      const witnessesArgs = witnessSigningEntries.filter(w => w.lockHash === lockHash)
      const lockScript = tx.inputs.find(input => input.lockHash === lockHash)!.lock!
      const signingContextOf = (witnesses: StructuredWitness[]): SigningContext => ({
        transactionHash: txHash,
        lockScript,
        witnesses,
      })

      // A 65-byte empty signature used as placeholder
      witnessesArgs[0].witnessArgs = WitnessArgs.fromObject(
        await lockProvider.prepareWitness(signingContextOf([witnessesArgs[0].witnessArgs.toSDK()]))
      )

      let privateKey = ''
      try {
        privateKey = findPrivateKey(witnessesArgs[0].lockArgs)
      } catch (error) {
        const BLOCK_UNRECOGNIZED = 0
        const IGNORE_UNRECOGNIZED_AND_CONTINUE = 1

        let message = t('messageBox.unrecognized-lock-script.message')
        let buttons = [
          t('messageBox.unrecognized-lock-script.buttons.cancel'),
          t('messageBox.unrecognized-lock-script.buttons.ignore'),
        ]

        const input = tx.inputs.find(input => input.lockHash === lockHash)
        if (input && input.lock && SystemScriptInfo.isMultiSignCodeHash(input.lock.codeHash)) {
          message = t('messageBox.unrecognized-multisig-transaction.message')
          buttons = [t('messageBox.unrecognized-multisig-transaction.buttons.cancel')]
        }

        const res = await dialog.showMessageBox({
          type: 'warning',
          message,
          buttons,
          defaultId: BLOCK_UNRECOGNIZED,
          cancelId: IGNORE_UNRECOGNIZED_AND_CONTINUE,
        })
        if (res.response === IGNORE_UNRECOGNIZED_AND_CONTINUE) {
          continue
        }
        if (res.response === BLOCK_UNRECOGNIZED) {
          throw new UnrecognizedLockScript(message)
        }
        throw error
      }

      const serializedWitnesses: (WitnessArgs | string)[] = witnessesArgs.map((value: SignInfo, index: number) => {
        const args = value.witnessArgs
        if (index === 0) {
          return args
        }
        if (args.lock === undefined && args.inputType === undefined && args.outputType === undefined) {
          return '0x'
        }
        return serializeWitnessArgs(args.toSDK())
      })
      let signed: (string | CKBComponents.WitnessArgs | WitnessArgs)[] = []

      if (isMultisig) {
        const blake160 = addressInfos.find(
          i => witnessesArgs[0].lockArgs.slice(0, 42) === Multisig.hash([i.blake160])
        )!.blake160
        const serializedMultisig: string = Multisig.serialize([blake160])
        signed = await TransactionSender.signSingleMultiSignScript(
          privateKey,
          serializedWitnesses,
          txHash,
          serializedMultisig,
          wallet
        )
        const wit = signed[0] as WitnessArgs
        wit.lock = serializedMultisig + wit.lock!.slice(2)
        signed[0] = serializeWitnessArgs(wit.toSDK())
      } else {
        const signingContext = signingContextOf(
          serializedWitnesses.map(wit => {
            if (typeof wit === 'string') {
              return wit
            }
            return wit.toSDK()
          })
        )
        const signature = await lockProvider.sign(signingContext, { type: 'private-key', privateKey })
        signed = [await lockProvider.finalizeWitness(signingContext, signature), ...signingContext.witnesses.slice(1)]
      }

      for (let i = 0; i < witnessesArgs.length; ++i) {
        witnessesArgs[i].witness = signed[i] as string
      }
    }

    tx.witnesses = witnessSigningEntries.map(w => w.witness)
    tx.hash = txHash

    return tx
  }

  /**
   * Sign a transaction whose inputs are guarded by provider-backed locks.
   *
   * Structurally similar to the secp path, with two differences that come from the locks rather
   * than from preference:
   *
   * - Input cells are resolved from the node first. Locks such as the FIPS 205 one sign a message
   *   committing to the contents of every input cell, which the transaction alone does not carry.
   * - There is no "unrecognised lock, continue anyway" dialog. That escape hatch exists on the secp
   *   path because args conventions can match a lock this wallet did not record; here a lock either
   *   belongs to a stored identity or it is not ours, and signing it anyway is never right.
   */
  private async signWithLockProviders(
    walletID: string,
    tx: Transaction,
    txHash: string,
    password: string,
    skipLastInputs: boolean,
    context?: RPC.RawTransaction[]
  ): Promise<Transaction> {
    const identities: ScriptIdentityModel[] = await ScriptIdentityService.getByWalletId(walletID)
    if (identities.length === 0) {
      throw new NoMatchAddressForSign()
    }

    const network = NetworksService.getInstance().getCurrent()
    // `context` is the previous-transaction bundle Neuron already exports for offline signing, so an
    // offline signer resolves inputs from the file instead of needing a node.
    const resolvedInputs = await resolveInputsForSigning(tx, network, context)

    const witnessSigningEntries: SignInfo[] = tx.inputs
      .slice(0, skipLastInputs ? -1 : tx.inputs.length)
      .map((input: Input, index: number) => {
        const wit: WitnessArgs | string = tx.witnesses[index]
        return {
          witnessArgs: wit instanceof WitnessArgs ? wit : WitnessArgs.generateEmpty(),
          lockHash: input.lockHash!,
          witness: '',
          lockArgs: input.lock!.args!,
        }
      })

    const identityByLockHash = new Map(identities.map(identity => [identity.lockHash(), identity]))

    for (const lockHash of new Set(witnessSigningEntries.map(w => w.lockHash))) {
      const group = witnessSigningEntries.filter(w => w.lockHash === lockHash)
      const identity = identityByLockHash.get(lockHash)
      if (!identity) {
        throw new UnrecognizedLockScript(
          `No stored identity claims the lock script of input group ${lockHash}, so it cannot be signed`
        )
      }

      const provider = this.lockProviders.getOrThrow(identity.providerId)

      // A signature is only worth anything against the code that will check it. On mainnet this
      // lock sits behind a Type ID, so the deployed binary can be replaced while the code hash —
      // and therefore every stored identity and every cell already locked — stays byte for byte
      // identical. Checked here rather than at the cell-dep site so that nothing is signed against
      // a script this build has not been verified against. The result is cached, so several groups
      // under the same provider cost one lookup.
      await this.deploymentChecker.assertUsableFor(identity.providerId, network)

      const metadata = identity.metadata ?? undefined

      group[0].witnessArgs = WitnessArgs.fromObject(
        await provider.prepareWitness({
          transactionHash: txHash,
          lockScript: identity.lockScript(),
          metadata,
          // A single-element list, so the group's first witness is at index 0 for this call.
          witnesses: [group[0].witnessArgs.toSDK()],
          resolvedInputs: undefined,
        })
      )

      // The witness list handed to the provider is the transaction's, indexed by input, not the
      // group's. A transaction can carry several script groups and a group need not start at input
      // 0; CKB_TX_MESSAGE_ALL commits to witnesses by absolute index, so a group-relative slice
      // would build the message over the wrong ones.
      const groupFirstIndex = witnessSigningEntries.indexOf(group[0])
      const absoluteWitnesses: StructuredWitness[] = witnessSigningEntries.map((entry, index) => {
        const args = entry.witnessArgs
        if (index === groupFirstIndex) {
          return args.toSDK()
        }
        if (args.lock === undefined && args.inputType === undefined && args.outputType === undefined) {
          return '0x'
        }
        return serializeWitnessArgs(args.toSDK())
      })

      const signingContext: SigningContext = {
        transactionHash: txHash,
        lockScript: identity.lockScript(),
        metadata,
        witnesses: absoluteWitnesses,
        resolvedInputs,
      }

      const secret = await this.secretSources.getOrThrow(identity.providerId)(walletID, password)
      const signature = await provider.sign(signingContext, secret)
      const finalized = await provider.finalizeWitness(signingContext, signature)

      group[0].witness = finalized
      for (let i = 1; i < group.length; ++i) {
        const witness = absoluteWitnesses[witnessSigningEntries.indexOf(group[i])]
        group[i].witness = typeof witness === 'string' ? witness : serializeWitnessArgs(witness)
      }
    }

    tx.witnesses = witnessSigningEntries.map(w => w.witness)
    tx.hash = txHash

    return tx
  }

  public async signMultisig(
    walletID: string = '',
    transaction: Transaction,
    password: string = '',
    multisigConfigs: MultisigConfigModel[],
    context?: RPC.RawTransaction[]
  ) {
    const wallet = this.walletService.get(walletID)
    const tx = Transaction.fromObject(transaction)
    const txHash: string = tx.computeHash()
    const addressInfos = await this.getAddressInfos(walletID)
    const paths = addressInfos.map(info => info.path)
    let device: Hardware | undefined
    let pathAndPrivateKeys: PathAndPrivateKey[] | undefined
    if (wallet.isHardware()) {
      device = HardwareWalletService.getInstance().getCurrent()
      if (!device) {
        const wallet = WalletService.getInstance().getCurrent()
        const deviceInfo = wallet!.getDeviceInfo()
        device = await HardwareWalletService.getInstance().initHardware(deviceInfo)
        await device.connect()
      }
    } else {
      pathAndPrivateKeys = this.getPrivateKeys(wallet, paths, password)
    }
    const findPrivateKeyAndBlake160 = (argsList: string[], signedBlake160s?: string[]) => {
      let path: string | undefined
      let matchArgs: string | undefined
      argsList.some(args => {
        if (signedBlake160s?.includes(args)) {
          return false
        }
        if (args.length === 42) {
          const matchAddress = addressInfos.find(i => i.blake160 === args)
          path = matchAddress?.path
          matchArgs = matchAddress?.blake160
        } else {
          const addressInfo = AssetAccountInfo.findSignPathForCheque(addressInfos, args)
          path = addressInfo?.path
          matchArgs = addressInfo?.blake160
        }
        return !!path
      })
      if (!path) {
        throw new NoMatchAddressForSign()
      }
      if (!pathAndPrivateKeys) {
        return [path, matchArgs]
      }
      const pathAndPrivateKey = pathAndPrivateKeys.find(p => p.path === path)
      if (!pathAndPrivateKey) {
        throw new Error('no private key found')
      }
      return [pathAndPrivateKey.privateKey, matchArgs]
    }

    const witnessSigningEntries: SignInfo[] = tx.inputs.map((input: Input, index: number) => {
      const lockArgs: string = input.lock!.args!
      const wit: WitnessArgs | string = tx.witnesses[index]
      const witnessArgs: WitnessArgs = wit instanceof WitnessArgs ? wit : WitnessArgs.generateEmpty()
      return {
        witnessArgs,
        lockHash: input.lockHash!,
        witness: '',
        lockArgs,
      }
    })

    const lockHashes = new Set(witnessSigningEntries.map(w => w.lockHash))
    const multisigConfigMap: Record<string, MultisigConfigModel> = multisigConfigs.reduce(
      (pre, cur) => ({
        ...pre,
        [cur.getLockHash()]: cur,
      }),
      {}
    )
    for (const lockHash of lockHashes) {
      const multisigConfig = multisigConfigMap[lockHash]
      if (!multisigConfig) {
        const BLOCK_UNRECOGNIZED = 0
        const IGNORE_UNRECOGNIZED_AND_CONTINUE = 1
        const res = await dialog.showMessageBox({
          type: 'warning',
          message: t('messageBox.unrecognized-lock-script.message'),
          buttons: [
            t('messageBox.unrecognized-lock-script.buttons.cancel'),
            t('messageBox.unrecognized-lock-script.buttons.ignore'),
          ],
          defaultId: BLOCK_UNRECOGNIZED,
          cancelId: IGNORE_UNRECOGNIZED_AND_CONTINUE,
        })
        if (res.response === IGNORE_UNRECOGNIZED_AND_CONTINUE) {
          continue
        }
        throw new MultisigConfigNeedError()
      }
      const [privateKey, blake160] = findPrivateKeyAndBlake160(multisigConfig.blake160s, tx.signatures?.[lockHash])

      const witnessesArgs = witnessSigningEntries.filter(w => w.lockHash === lockHash)
      const serializedWitnesses: (WitnessArgs | string)[] = witnessesArgs.map((value: SignInfo, index: number) => {
        const args = value.witnessArgs
        if (index === 0) {
          return args
        }
        if (args.lock === undefined && args.inputType === undefined && args.outputType === undefined) {
          return '0x'
        }
        return serializeWitnessArgs(args.toSDK())
      })
      let witnesses: (string | WitnessArgs)[] = []
      const serializedMultiSign: string = Multisig.serialize(
        multisigConfig.blake160s,
        multisigConfig.r,
        multisigConfig.m,
        multisigConfig.n
      )
      witnesses = await TransactionSender.signSingleMultiSignScript(
        privateKey!,
        serializedWitnesses,
        txHash,
        serializedMultiSign,
        wallet,
        multisigConfig.m
      )
      const wit = witnesses[0] as WitnessArgs
      if (wallet.isHardware()) {
        wit.lock = await device!.signTransaction(
          walletID,
          tx,
          witnesses.map(w => (typeof w === 'string' ? w : serializeWitnessArgs(w.toSDK()))),
          privateKey!,
          context
        )
      } else {
        wit.lock = wit.lock!.slice(2)
      }
      if (!witnessesArgs[0].witnessArgs.lock) {
        wit.lock = serializedMultiSign + wit.lock
      } else {
        wit.lock = witnessesArgs[0].witnessArgs.lock + wit.lock
      }
      tx.setSignatures(lockHash, blake160!)
      const signStatus = getMultisigStatus(multisigConfig, tx.signatures)
      if (signStatus === SignStatus.Signed) {
        witnesses[0] = serializeWitnessArgs(wit.toSDK())
      } else {
        witnesses[0] = wit
      }

      for (let i = 0; i < witnessesArgs.length; ++i) {
        witnessesArgs[i].witness = witnesses[i] as string
      }
    }
    tx.witnesses = witnessSigningEntries.map(w => w.witness)
    tx.hash = txHash

    return tx
  }

  public static signSingleMultiSignScript(
    privateKeyOrPath: string,
    witnesses: (string | WitnessArgs)[],
    txHash: string,
    serializedMultiSign: string,
    wallet: Wallet,
    m: number = 1
  ) {
    const firstWitness = witnesses[0]
    if (typeof firstWitness === 'string') {
      throw new Error('First witness must be WitnessArgs')
    }
    const restWitnesses = witnesses.slice(1)

    const emptyWitness = WitnessArgs.fromObject({
      ...firstWitness,
      lock: `0x` + serializedMultiSign.slice(2) + '0'.repeat(130 * m),
    })
    const serializedEmptyWitness = serializeWitnessArgs(emptyWitness.toSDK())
    const serializedEmptyWitnessSize = bytes.bytify(serializedEmptyWitness).byteLength
    const blake2b = new Blake2b()
    blake2b.update(txHash)
    blake2b.update(bytes.hexify(Uint64LE.pack(`0x${serializedEmptyWitnessSize.toString(16)}`)))
    blake2b.update(serializedEmptyWitness)

    restWitnesses.forEach(w => {
      const wit: string = typeof w === 'string' ? w : serializeWitnessArgs(w.toSDK())
      const byteLength = bytes.bytify(wit).byteLength
      blake2b.update(bytes.hexify(Uint64LE.pack(`0x${byteLength.toString(16)}`)))
      blake2b.update(wit)
    })

    const message = blake2b.digest()

    if (!wallet.isHardware()) {
      // `privateKeyOrPath` variable here is a private key because wallet is not a hardware one. Otherwise, it will be a private key path.
      const privateKey = privateKeyOrPath
      emptyWitness.lock = hd.key.signRecoverable(message, privateKey)
    }

    return [emptyWitness, ...restWitnesses]
  }

  /**
   * Everything a provider-backed lock needs before a transaction can be built for it.
   *
   * The lock is deployed per network under a different code hash, so an identity is only usable on
   * the network it was derived for; a mismatch is refused rather than silently producing a
   * transaction against a script that does not exist here.
   */
  /**
   * The provider lock class for this wallet, or undefined if it is an ordinary HD wallet.
   *
   * Every transaction path needs the same three things for a provider-backed wallet — its address,
   * its cell dep and its witness size — and originally only the plain send path asked for them.
   * Everything else called the HD-only address methods and refused the wallet outright.
   */
  private async providerLockClassFor(walletID: string) {
    const providerId = this.walletService.get(walletID).getLockProviderId?.()
    return providerId ? this.resolveProviderLockClass(walletID, providerId) : undefined
  }

  private async resolveProviderLockClass(walletID: string, providerId: string) {
    const network = NetworksService.getInstance().getCurrent()
    const identities = await ScriptIdentityService.getByWalletId(walletID)
    const provider = this.lockProviders.getOrThrow(providerId)

    const identity = identities.find(candidate => provider.supports(candidate.lockScript(), network))
    if (!identity) {
      throw new Error(
        `This wallet has no ${providerId} identity for the current network. Its lock is deployed separately on each network, so an identity derived elsewhere cannot be used here.`
      )
    }

    const [cellDep] = await provider.getCellDeps(network)
    return {
      changeAddress: identity.address,
      lockClass: {
        codeHash: identity.lockCodeHash,
        hashType: identity.lockHashType,
        lockArgs: [identity.lockArgs],
        cellDep,
        witnessSize: provider.estimateWitnessSize({
          lockScript: identity.lockScript(),
          metadata: identity.metadata ?? undefined,
        }),
      },
    }
  }

  public generateTx = async ({
    walletID = '',
    items = [],
    fee = '0',
    feeRate = '0',
    consumeOutPoints,
    enableUseSentCell,
  }: {
    walletID: string
    items: TargetOutput[]
    fee: string
    feeRate: string
    consumeOutPoints?: CKBComponents.OutPoint[]
    enableUseSentCell?: boolean
  }): Promise<Transaction> => {
    const targetOutputs = items.map(item => ({
      ...item,
      capacity: BigInt(item.capacity).toString(),
    }))

    const providerId = this.walletService.get(walletID).getLockProviderId?.()
    if (providerId) {
      const { changeAddress, lockClass } = await this.resolveProviderLockClass(walletID, providerId)
      return TransactionGenerator.generateTx({
        walletID,
        targetOutputs,
        changeAddress,
        fee,
        feeRate,
        lockClass,
        consumeOutPoints,
        enableUseSentCell,
      })
    }

    const changeAddress: string = await this.getChangeAddress()

    try {
      const tx: Transaction = await TransactionGenerator.generateTx({
        walletID,
        targetOutputs,
        changeAddress,
        fee,
        feeRate,
        consumeOutPoints,
        enableUseSentCell,
      })

      return tx
    } catch (error) {
      if (error instanceof CapacityNotEnoughForChange) {
        throw new CapacityNotEnoughForChangeByTransfer()
      }
      throw error
    }
  }

  public generateSendingAllTx = async ({
    walletID = '',
    items = [],
    fee = '0',
    feeRate = '0',
    consumeOutPoints,
    enableUseSentCell,
  }: {
    walletID: string
    items: TargetOutput[]
    fee: string
    feeRate: string
    consumeOutPoints?: CKBComponents.OutPoint[]
    enableUseSentCell?: boolean
  }): Promise<Transaction> => {
    const targetOutputs = items.map(item => ({
      ...item,
      capacity: BigInt(item.capacity).toString(),
    }))

    const tx: Transaction = await TransactionGenerator.generateSendingAllTx({
      walletID,
      targetOutputs,
      fee,
      feeRate,
      consumeOutPoints,
      enableUseSentCell,
    })

    return tx
  }

  public generateMultisigSendAllTx = async (
    items: TargetOutput[] = [],
    multisigConfig: MultisigConfigModel
  ): Promise<Transaction> => {
    const targetOutputs = items.map(item => ({
      ...item,
      capacity: BigInt(item.capacity).toString(),
    }))

    const tx: Transaction = await TransactionGenerator.generateSendingAllTx({
      walletID: '',
      targetOutputs,
      fee: '0',
      feeRate: '2000',
      multisigConfig,
    })

    return tx
  }

  public async generateMultisigTx(
    items: TargetOutput[] = [],
    multisigConfig: MultisigConfigModel
  ): Promise<Transaction> {
    const targetOutputs = items.map(item => ({
      ...item,
      capacity: BigInt(item.capacity).toString(),
    }))

    try {
      const lockScript = Multisig.getMultisigScript(
        multisigConfig.blake160s,
        multisigConfig.r,
        multisigConfig.m,
        multisigConfig.n,
        multisigConfig.lockCodeHash
      )
      const multisigAddresses = scriptToAddress(lockScript, NetworksService.getInstance().isMainnet())
      const tx: Transaction = await TransactionGenerator.generateTx({
        walletID: '',
        targetOutputs,
        changeAddress: multisigAddresses,
        fee: '0',
        feeRate: '2000',
        lockClass: {
          lockArgs: [lockScript.args],
          codeHash: lockScript.codeHash,
          hashType: lockScript.hashType,
        },
        multisigConfig,
      })
      return tx
    } catch (error) {
      if (error instanceof CapacityNotEnoughForChange) {
        throw new CapacityNotEnoughForChangeByTransfer()
      }
      throw error
    }
  }

  public generateTransferNftTx = async (
    walletId: string,
    outPoint: OutPoint,
    receiveAddress: string,
    fee: string = '0',
    feeRate: string = '0'
  ): Promise<Transaction> => {
    const changeAddress: string = await this.getChangeAddress()
    const nftCellOutput = await CellsService.getLiveCell(new OutPoint(outPoint.txHash, outPoint.index))
    if (!nftCellOutput) {
      throw new CellIsNotYetLive()
    }

    const tx = await TransactionGenerator.generateTransferNftTx(
      walletId,
      outPoint,
      nftCellOutput,
      receiveAddress,
      changeAddress,
      fee,
      feeRate
    )

    return tx
  }

  public generateTransferSporeTx = async (
    walletId: string,
    outPoint: OutPoint,
    receiveAddress: string,
    fee: string = '0',
    feeRate: string = '0'
  ): Promise<Transaction> => {
    const changeAddress: string = await this.getChangeAddress()
    const nftCellOutput = await CellsService.getLiveCell(new OutPoint(outPoint.txHash, outPoint.index))
    if (!nftCellOutput) {
      throw new CellIsNotYetLive()
    }

    const assetAccountInfo = new AssetAccountInfo()
    // const rpcUrl: string = NodeService.getInstance().nodeUrl
    const rpcUrl = NetworksService.getInstance().getCurrent().remote

    // https://github.com/sporeprotocol/spore-sdk/blob/05f2cbe1c03d03e334ebd3b440b5b3b20ec67da7/packages/core/src/api/joints/spore.ts#L154-L158
    const clusterDep = await (async () => {
      const clusterCell = await getClusterByOutPoint(outPoint, assetAccountInfo.getSporeConfig(rpcUrl)).then(
        _ => _,
        () => undefined
      )

      if (!clusterCell?.outPoint) {
        return undefined
      }

      return new CellDep(OutPoint.fromSDK(clusterCell.outPoint), DepType.Code)
    })()

    const tx = await TransactionGenerator.generateTransferNftTx(
      walletId,
      outPoint,
      nftCellOutput,
      receiveAddress,
      changeAddress,
      fee,
      feeRate,
      [assetAccountInfo.getSporeInfos()[0].cellDep].concat(clusterDep ?? [])
    )

    return tx
  }

  public generateDepositTx = async (
    walletID: string = '',
    capacity: string,
    fee: string = '0',
    feeRate: string = '0'
  ): Promise<Transaction> => {
    const provider = await this.providerLockClassFor(walletID)
    if (provider) {
      // One address: the deposit and any change both return to the wallet's own lock.
      return TransactionGenerator.generateDepositTx(
        walletID,
        capacity,
        provider.changeAddress,
        provider.changeAddress,
        fee,
        feeRate,
        provider.lockClass
      )
    }

    const wallet = WalletService.getInstance().get(walletID)

    const address = await wallet.getNextAddress()

    const changeAddress: string = await this.getChangeAddress()

    const tx = await TransactionGenerator.generateDepositTx(
      walletID,
      capacity,
      address!.address,
      changeAddress,
      fee,
      feeRate
    )

    return tx
  }

  public generateMultisigDepositTx = async (
    capacity: string,
    fee: string = '0',
    feeRate: string = '0',
    multisigConfig: MultisigConfigModel
  ): Promise<Transaction> => {
    const lockScript = Multisig.getMultisigScript(
      multisigConfig.blake160s,
      multisigConfig.r,
      multisigConfig.m,
      multisigConfig.n,
      multisigConfig.lockCodeHash
    )
    const multisigAddresses = scriptToAddress(lockScript, NetworksService.getInstance().isMainnet())

    const tx = await TransactionGenerator.generateDepositTx(
      '',
      capacity,
      multisigAddresses,
      multisigAddresses,
      fee,
      feeRate,
      {
        lockArgs: [lockScript.args],
        codeHash: lockScript.codeHash,
        hashType: lockScript.hashType,
      },
      multisigConfig
    )

    return tx
  }

  public startWithdrawFromDao = async (
    walletID: string,
    outPoint: OutPoint,
    fee: string = '0',
    feeRate: string = '0'
  ): Promise<Transaction> => {
    // only for check wallet exists
    this.walletService.get(walletID)

    const currentNetwork = NetworksService.getInstance().getCurrent()
    const rpcService = new RpcService(currentNetwork.remote, currentNetwork.type)
    const depositOutput = await CellsService.getLiveCell(outPoint)
    if (!depositOutput) {
      throw new CellIsNotYetLive()
    }
    const prevTx = await rpcService.getTransaction(outPoint.txHash)
    if (!prevTx || !prevTx.txStatus.isCommitted()) {
      throw new TransactionIsNotCommittedYet()
    }

    const depositBlockHeader = await rpcService.getHeader(prevTx.txStatus.blockHash!)

    const provider = await this.providerLockClassFor(walletID)
    const wallet = WalletService.getInstance().get(walletID)
    const changeAddress = provider ? provider.changeAddress : (await wallet.getNextChangeAddress())!.address
    const tx: Transaction = await TransactionGenerator.startWithdrawFromDao(
      walletID,
      outPoint,
      depositOutput,
      depositBlockHeader!.number,
      depositBlockHeader!.hash,
      changeAddress,
      fee,
      feeRate,
      provider?.lockClass
    )

    return tx
  }

  public startWithdrawFromMultisigDao = async (
    outPoint: OutPoint,
    fee: string = '0',
    feeRate: string = '0',
    multisigConfig: MultisigConfigModel
  ): Promise<Transaction> => {
    const lockScript = Multisig.getMultisigScript(
      multisigConfig.blake160s,
      multisigConfig.r,
      multisigConfig.m,
      multisigConfig.n,
      multisigConfig.lockCodeHash
    )
    const multisigAddresses = scriptToAddress(lockScript, NetworksService.getInstance().isMainnet())

    const currentNetwork = NetworksService.getInstance().getCurrent()
    const rpcService = new RpcService(currentNetwork.remote, currentNetwork.type)
    const depositOutput = await CellsService.getLiveCell(outPoint)
    if (!depositOutput) {
      throw new CellIsNotYetLive()
    }
    const prevTx = await rpcService.getTransaction(outPoint.txHash)
    if (!prevTx || !prevTx.txStatus.isCommitted()) {
      throw new TransactionIsNotCommittedYet()
    }

    const depositBlockHeader = await rpcService.getHeader(prevTx.txStatus.blockHash!)

    const tx: Transaction = await TransactionGenerator.startWithdrawFromDao(
      '',
      outPoint,
      depositOutput,
      depositBlockHeader!.number,
      depositBlockHeader!.hash,
      multisigAddresses,
      fee,
      feeRate,
      {
        lockArgs: [lockScript.args],
        codeHash: lockScript.codeHash,
        hashType: lockScript.hashType,
      },
      multisigConfig
    )

    return tx
  }

  public withdrawFromDao = async (
    walletID: string,
    depositOutPoint: OutPoint,
    withdrawingOutPoint: OutPoint,
    fee: string = '0',
    feeRate: string = '0',
    multisigConfig?: MultisigConfigModel
  ): Promise<Transaction> => {
    const DAO_LOCK_PERIOD_EPOCHS = BigInt(180)

    const feeInt = BigInt(fee)
    const feeRateInt = BigInt(feeRate)
    const mode = new FeeMode(feeRateInt)

    const currentNetwork = NetworksService.getInstance().getCurrent()
    const rpcService = new RpcService(currentNetwork.remote, currentNetwork.type)

    const withdrawOutput = await CellsService.getLiveCell(withdrawingOutPoint)
    if (!withdrawOutput) {
      throw new CellIsNotYetLive()
    }
    const prevTx = (await rpcService.getTransaction(withdrawingOutPoint.txHash))!
    if (!prevTx.txStatus.isCommitted()) {
      throw new TransactionIsNotCommittedYet()
    }

    const withdrawProvider = multisigConfig ? undefined : await this.providerLockClassFor(walletID)
    const cellDep = multisigConfig
      ? await SystemScriptInfo.getInstance().getMultiSignCellDep(multisigConfig.lockCodeHash)
      : withdrawProvider?.lockClass.cellDep ?? (await SystemScriptInfo.getInstance().getSecpCellDep())
    const daoCellDep = await SystemScriptInfo.getInstance().getDaoCellDep()

    const content = withdrawOutput.daoData
    if (!content) {
      throw new Error(`Withdraw output cell is not a dao cell, ${withdrawOutput.outPoint?.txHash}`)
    }
    if (!withdrawOutput.depositOutPoint) {
      throw new Error('DAO has not finish step first withdraw')
    }
    const depositTx = await rpcService.getTransaction(withdrawOutput.depositOutPoint.txHash)
    if (!depositTx?.txStatus.blockHash) {
      throw new Error(`Get deposit block hash failed with tx hash ${withdrawOutput.depositOutPoint.txHash}`)
    }
    const depositBlockHeader = await rpcService.getHeader(depositTx.txStatus.blockHash)
    if (!depositBlockHeader) {
      throw new Error(`Get Header failed with blockHash ${depositTx.txStatus.blockHash}`)
    }
    const depositEpoch = this.parseEpoch(BigInt(depositBlockHeader.epoch))
    const depositCapacity: bigint = BigInt(withdrawOutput.capacity)

    const withdrawBlockHeader = (await rpcService.getHeader(prevTx.txStatus.blockHash!))!
    const withdrawEpoch = this.parseEpoch(BigInt(withdrawBlockHeader.epoch))

    const withdrawFraction = withdrawEpoch.index * depositEpoch.length
    const depositFraction = depositEpoch.index * withdrawEpoch.length
    let depositedEpochs = withdrawEpoch.number - depositEpoch.number
    if (withdrawFraction > depositFraction) {
      depositedEpochs += BigInt(1)
    }
    const lockEpochs =
      ((depositedEpochs + (DAO_LOCK_PERIOD_EPOCHS - BigInt(1))) / DAO_LOCK_PERIOD_EPOCHS) * DAO_LOCK_PERIOD_EPOCHS
    const minimalSinceEpochNumber = depositEpoch.number + lockEpochs
    const minimalSinceEpochIndex = depositEpoch.index
    const minimalSinceEpochLength = depositEpoch.length

    const minimalSince = this.epochSince(minimalSinceEpochLength, minimalSinceEpochIndex, minimalSinceEpochNumber)

    const outputCapacity: bigint = await this.calculateDaoMaximumWithdraw(depositOutPoint, withdrawBlockHeader.hash)

    let output: Output
    if (multisigConfig) {
      const lockScript = Multisig.getMultisigScript(
        multisigConfig.blake160s,
        multisigConfig.r,
        multisigConfig.m,
        multisigConfig.n,
        multisigConfig.lockCodeHash
      )
      output = new Output(outputCapacity.toString(), lockScript, undefined, '0x')
    } else if (withdrawProvider) {
      // The wallet's own lock, taken whole. Rebuilding it as `Script(SECP_CODE_HASH, args)` the way
      // the branch below does would pay the withdrawal to a lock nobody holds the key for —
      // `AddressParser.toBlake160` refuses a non-secp address rather than allowing that, which is
      // why this path reported "not short address" instead of working.
      const { codeHash, hashType, lockArgs } = withdrawProvider.lockClass
      output = new Output(outputCapacity.toString(), new Script(codeHash, lockArgs[0], hashType), undefined, '0x')
    } else {
      const wallet = WalletService.getInstance().get(walletID)
      const address = await wallet.getNextAddress()
      const blake160 = AddressParser.toBlake160(address!.address)
      output = new Output(
        outputCapacity.toString(),
        new Script(SystemScriptInfo.SECP_CODE_HASH, blake160, SystemScriptInfo.SECP_HASH_TYPE),
        undefined,
        '0x'
      )
    }

    const outputs: Output[] = [output]

    const input: Input = new Input(
      withdrawingOutPoint,
      minimalSince.toString(),
      withdrawOutput.capacity,
      withdrawOutput.lock
    )

    const withdrawWitnessArgs: WitnessArgs = new WitnessArgs(
      multisigConfig ? '' : WitnessArgs.EMPTY_LOCK,
      '0x0000000000000000'
    )
    const tx: Transaction = Transaction.fromObject({
      version: '0',
      cellDeps: [cellDep, daoCellDep],
      headerDeps: [depositBlockHeader.hash, withdrawBlockHeader.hash],
      inputs: [input],
      outputs,
      outputsData: outputs.map(o => o.data || '0x'),
      witnesses: [withdrawWitnessArgs],
      interest: (BigInt(outputCapacity) - depositCapacity).toString(),
    })
    if (mode.isFeeRateMode()) {
      // `tx` carries a secp-shaped placeholder witness. An SLH-DSA witness is kilobytes rather than
      // 93 bytes, so pricing the transaction as built would underpay by roughly its whole size and
      // the pool would reject it.
      const witnessDelta = withdrawProvider
        ? withdrawProvider.lockClass.witnessSize - TransactionSize.secpLockWitness()
        : 0
      const txSize: number = TransactionSize.tx(tx) + witnessDelta
      const txFee: bigint = TransactionFee.fee(txSize, BigInt(feeRate))
      tx.fee = txFee.toString()
      tx.outputs[0].capacity = (outputCapacity - txFee).toString()
    } else {
      tx.fee = fee
      tx.outputs[0].capacity = (outputCapacity - feeInt).toString()
    }

    logger.debug('withdrawFromDao fee:', tx.fee)

    return tx
  }

  public generateDepositAllTx = async (
    walletID: string = '',
    isBalanceReserved = true,
    fee: string = '0',
    feeRate: string = '0'
  ): Promise<Transaction> => {
    const provider = await this.providerLockClassFor(walletID)
    if (provider) {
      return TransactionGenerator.generateDepositAllTx(
        walletID,
        provider.changeAddress,
        provider.changeAddress,
        isBalanceReserved,
        fee,
        feeRate,
        provider.lockClass
      )
    }

    const wallet = WalletService.getInstance().get(walletID)
    const receiveAddress = await wallet.getNextAddress()
    const changeAddress = await wallet.getNextChangeAddress()

    const tx = await TransactionGenerator.generateDepositAllTx(
      walletID,
      receiveAddress!.address,
      changeAddress!.address,
      isBalanceReserved,
      fee,
      feeRate
    )

    return tx
  }

  public generateMultisigDepositAllTx = async (
    isBalanceReserved = true,
    fee: string = '0',
    feeRate: string = '0',
    multisigConfig: MultisigConfigModel
  ): Promise<Transaction> => {
    const lockScript = Multisig.getMultisigScript(
      multisigConfig.blake160s,
      multisigConfig.r,
      multisigConfig.m,
      multisigConfig.n,
      multisigConfig.lockCodeHash
    )
    const multisigAddresses = scriptToAddress(lockScript, NetworksService.getInstance().isMainnet())

    const tx = await TransactionGenerator.generateDepositAllTx(
      '',
      multisigAddresses,
      multisigAddresses,
      isBalanceReserved,
      fee,
      feeRate,
      {
        lockArgs: [lockScript.args],
        codeHash: lockScript.codeHash,
        hashType: lockScript.hashType,
      },
      multisigConfig
    )

    return tx
  }

  public async generateWithdrawMultiSignTx(
    walletID: string,
    outPoint: OutPoint,
    fee: string = '0',
    feeRate: string = '0'
  ) {
    // only for check wallet exists
    this.walletService.get(walletID)

    const currentNetwork = NetworksService.getInstance().getCurrent()
    const rpcService = new RpcService(currentNetwork.remote, currentNetwork.type)
    const locktimeOutput = await CellsService.getLiveCell(outPoint)
    if (!locktimeOutput) {
      throw new CellIsNotYetLive()
    }
    const prevTx = await rpcService.getTransaction(outPoint.txHash)
    if (!prevTx || !prevTx.txStatus.isCommitted()) {
      throw new TransactionIsNotCommittedYet()
    }

    const wallet = WalletService.getInstance().get(walletID)
    const receivingAddressInfo = await wallet.getNextAddress()

    const receivingAddress = receivingAddressInfo!.address
    const tx: Transaction = await TransactionGenerator.generateWithdrawMultiSignTx(
      outPoint,
      locktimeOutput,
      receivingAddress,
      fee,
      feeRate
    )

    return tx
  }

  public calculateDaoMaximumWithdraw = async (
    depositOutPoint: OutPoint,
    withdrawBlockHash: string
  ): Promise<bigint> => {
    const currentNetwork = NetworksService.getInstance().getCurrent()
    const rpc = generateRPC(currentNetwork.remote, currentNetwork.type)

    let tx = await rpc.getTransaction(depositOutPoint.txHash)
    if (tx.txStatus.status !== 'committed' || !tx.txStatus.blockHash) {
      throw new Error('Transaction is not committed yet')
    }
    const depositBlockHash = tx.txStatus.blockHash

    const cellOutput = tx.transaction.outputs[+depositOutPoint.index]
    const cellOutputData = tx.transaction.outputsData[+depositOutPoint.index]

    const [depositHeader, withDrawHeader] = await Promise.all([
      rpc.getHeader(depositBlockHash),
      rpc.getHeader(withdrawBlockHash),
    ])

    return dao.calculateMaximumWithdraw(
      { outPoint: depositOutPoint.toSDK(), data: cellOutputData, cellOutput: cellOutput },
      depositHeader.dao,
      withDrawHeader.dao
    )
  }

  private parseEpoch = (epoch: bigint) => {
    return {
      length: (epoch >> BigInt(40)) & BigInt(0xffff),
      index: (epoch >> BigInt(24)) & BigInt(0xffff),
      number: epoch & BigInt(0xffffff),
    }
  }

  private epochSince = (length: bigint, index: bigint, number: bigint) => {
    return (BigInt(0x20) << BigInt(56)) + (length << BigInt(40)) + (index << BigInt(24)) + number
  }

  // path is a BIP44 full path such as "m/44'/309'/0'/0/0"
  public getAddressInfos = (walletID: string): Promise<Address[]> => {
    // only for check wallet exists
    this.walletService.get(walletID)
    return AddressService.getAddressesByWalletId(walletID)
  }

  public getChangeAddress = async (): Promise<string> => {
    const wallet = this.walletService.getCurrent()

    const unusedChangeAddress = await wallet!.getNextChangeAddress()

    return unusedChangeAddress!.address
  }

  // Derive all child private keys for specified BIP44 paths.
  public getPrivateKeys = (wallet: Wallet, paths: string[], password: string): PathAndPrivateKey[] => {
    const masterPrivateKey = wallet.loadKeystore().extendedPrivateKey(password)
    const masterKeychain = new hd.Keychain(
      Buffer.from(bytes.bytify(masterPrivateKey.privateKey)),
      Buffer.from(bytes.bytify(masterPrivateKey.chainCode))
    )

    const uniquePaths = paths.filter((value, idx, a) => a.indexOf(value) === idx)
    return uniquePaths.map(path => ({
      path,
      privateKey: bytes.hexify(masterKeychain.derivePath(path).privateKey),
    }))
  }
}
