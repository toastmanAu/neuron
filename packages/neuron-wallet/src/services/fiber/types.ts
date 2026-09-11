import { ScriptHashType } from '../../models/chain/script'

/** A CKB script as a Fiber node reports it, already camelised. */
export interface FiberScript {
  codeHash: string
  hashType: ScriptHashType
  args: string
}

export interface FiberNodeInfo {
  version: string
  commitHash: string
  pubkey: string
  nodeName: string | null
  addresses: string[]
  chainHash: string
  channelCount: string
  pendingChannelCount: string
  peersCount: string
  /** Lock the node funds channels with; external funding has to pay into it. */
  defaultFundingLockScript?: FiberScript
}

export interface FiberPeer {
  pubkey: string
  address: string
}

export interface FiberChannel {
  channelId: string
  channelOutpoint: string | null
  peerPubkey: string
  stateName: string
  isPublic: boolean
  isAcceptor: boolean
  enabled: boolean
  /** Shannons, hex. Left as strings: these routinely exceed Number.MAX_SAFE_INTEGER. */
  localBalance: string
  remoteBalance: string
  offeredTlcBalance: string
  receivedTlcBalance: string
  fundingUdtTypeScript: FiberScript | null
  createdAt: string
}

export interface NewInvoiceParams {
  amount: string
  description?: string
  currency?: string
  expiry?: string
  paymentPreimage?: string
}

export interface FiberInvoice {
  invoiceAddress: string
  raw: unknown
}

export interface SendPaymentParams {
  invoice?: string
  targetPubkey?: string
  amount?: string
  keysend?: boolean
}

export interface CloseChannelParams {
  channelId: string
  /**
   * Where the channel balance goes.
   *
   * Matters most for an externally funded channel: the funds came from a lock the node does not
   * control, so they have to be able to go back to one. Omitted, the node uses the shutdown script
   * agreed when the channel was opened.
   */
  closeScript?: FiberScript
  feeRate?: string
  /** Broadcast the latest commitment transaction instead of agreeing a close with the peer. */
  force?: boolean
}

export interface FiberPayment {
  paymentHash: string
  status: string
  createdAt: string
  failedError?: string
  raw: unknown
}
