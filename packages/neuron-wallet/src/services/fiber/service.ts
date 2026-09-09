import FiberRpcClient from './rpc-client'
import {
  FiberChannel,
  FiberInvoice,
  FiberNodeInfo,
  FiberPayment,
  FiberPeer,
  NewInvoiceParams,
  SendPaymentParams,
} from './types'
import { asRecord, optionalString, requireArray, requireBoolean, requireString, toScript } from './validate'

/**
 * Typed access to a Fiber node.
 *
 * The node stays the authority on channel and payment state; nothing here caches or reconstructs it.
 * Responses are validated before being handed on, because the endpoint is untrusted input.
 */
export default class FiberService {
  private readonly client: FiberRpcClient

  constructor(client: FiberRpcClient) {
    this.client = client
  }

  public get endpoint(): string {
    return this.client.url
  }

  public isHealthy(): Promise<boolean> {
    return this.client.isHealthy()
  }

  public async nodeInfo(): Promise<FiberNodeInfo> {
    const raw = asRecord(await this.client.call('node_info'), 'node_info')
    return {
      version: requireString(raw, 'version', 'node_info'),
      commitHash: optionalString(raw, 'commit_hash') ?? '',
      pubkey: requireString(raw, 'pubkey', 'node_info'),
      nodeName: optionalString(raw, 'node_name') ?? null,
      addresses: requireArray(raw, 'addresses', 'node_info').map(String),
      chainHash: requireString(raw, 'chain_hash', 'node_info'),
      channelCount: optionalString(raw, 'channel_count') ?? '0x0',
      pendingChannelCount: optionalString(raw, 'pending_channel_count') ?? '0x0',
      peersCount: optionalString(raw, 'peers_count') ?? '0x0',
      defaultFundingLockScript: toScript(raw.default_funding_lock_script, 'node_info') ?? undefined,
    }
  }

  public async listPeers(): Promise<FiberPeer[]> {
    const raw = asRecord(await this.client.call('list_peers', [{}]), 'list_peers')
    return requireArray(raw, 'peers', 'list_peers').map(entry => {
      const peer = asRecord(entry, 'list_peers')
      return {
        pubkey: requireString(peer, 'pubkey', 'list_peers'),
        address: optionalString(peer, 'address') ?? '',
      }
    })
  }

  public async listChannels(filter: { peerPubkey?: string } = {}): Promise<FiberChannel[]> {
    const params = filter.peerPubkey ? { peer_pubkey: filter.peerPubkey } : {}
    const raw = asRecord(await this.client.call('list_channels', [params]), 'list_channels')

    return requireArray(raw, 'channels', 'list_channels').map(entry => {
      const channel = asRecord(entry, 'list_channels')
      const state = asRecord(channel.state, 'list_channels')
      return {
        channelId: requireString(channel, 'channel_id', 'list_channels'),
        channelOutpoint: optionalString(channel, 'channel_outpoint') ?? null,
        peerPubkey: requireString(channel, 'pubkey', 'list_channels'),
        stateName: requireString(state, 'state_name', 'list_channels'),
        isPublic: requireBoolean(channel, 'is_public', 'list_channels'),
        isAcceptor: requireBoolean(channel, 'is_acceptor', 'list_channels'),
        enabled: requireBoolean(channel, 'enabled', 'list_channels'),
        localBalance: requireString(channel, 'local_balance', 'list_channels'),
        remoteBalance: requireString(channel, 'remote_balance', 'list_channels'),
        offeredTlcBalance: optionalString(channel, 'offered_tlc_balance') ?? '0x0',
        receivedTlcBalance: optionalString(channel, 'received_tlc_balance') ?? '0x0',
        fundingUdtTypeScript: toScript(channel.funding_udt_type_script, 'list_channels'),
        createdAt: optionalString(channel, 'created_at') ?? '0x0',
      }
    })
  }

  public async connectPeer(address: string): Promise<void> {
    await this.client.call('connect_peer', [{ address }])
  }

  public async disconnectPeer(pubkey: string): Promise<void> {
    await this.client.call('disconnect_peer', [{ peer_id: pubkey }])
  }

  public async newInvoice(params: NewInvoiceParams): Promise<FiberInvoice> {
    const raw = asRecord(
      await this.client.call('new_invoice', [
        {
          amount: params.amount,
          description: params.description,
          currency: params.currency,
          expiry: params.expiry,
          payment_preimage: params.paymentPreimage,
        },
      ]),
      'new_invoice'
    )
    return { invoiceAddress: requireString(raw, 'invoice_address', 'new_invoice'), raw }
  }

  public async parseInvoice(invoice: string): Promise<unknown> {
    return this.client.call('parse_invoice', [{ invoice }])
  }

  public async sendPayment(params: SendPaymentParams): Promise<FiberPayment> {
    const raw = asRecord(
      await this.client.call('send_payment', [
        {
          invoice: params.invoice,
          target_pubkey: params.targetPubkey,
          amount: params.amount,
          keysend: params.keysend,
        },
      ]),
      'send_payment'
    )
    return FiberService.toPayment(raw, 'send_payment')
  }

  public async getPayment(paymentHash: string): Promise<FiberPayment> {
    const raw = asRecord(await this.client.call('get_payment', [{ payment_hash: paymentHash }]), 'get_payment')
    return FiberService.toPayment(raw, 'get_payment')
  }

  private static toPayment(raw: Record<string, unknown>, method: string): FiberPayment {
    return {
      paymentHash: requireString(raw, 'payment_hash', method),
      status: requireString(raw, 'status', method),
      createdAt: optionalString(raw, 'created_at') ?? '0x0',
      failedError: optionalString(raw, 'failed_error'),
      raw,
    }
  }
}
