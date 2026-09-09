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

export interface FiberPayment {
  paymentHash: string
  status: string
  createdAt: string
  failedError?: string
  raw: unknown
}
