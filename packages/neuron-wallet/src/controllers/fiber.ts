import { ResponseCode } from '../utils/const'
import FiberSettingsService, { FiberEndpoint, FiberEndpointView } from '../services/fiber/settings'
import FiberService from '../services/fiber/service'

/** What the renderer needs to render a status badge without knowing about RPC. */
export interface FiberStatus {
  configured: boolean
  healthy: boolean
  version?: string
  pubkey?: string
  chainHash?: string
  channelCount?: number
  peersCount?: number
  /** Present when the node answered but the answer was an error, e.g. a rejected token. */
  error?: string
}

export interface FiberChannelView {
  channelId: string
  peerPubkey: string
  stateName: string
  /** Shannons as a decimal string. Converted once, here, rather than in every component. */
  localBalance: string
  remoteBalance: string
  isPublic: boolean
  isAcceptor: boolean
  enabled: boolean
  channelOutpoint: string | null
  /** Whether the channel can actually carry a payment right now. */
  ready: boolean
}

const hexToDecimal = (hex: string): string => BigInt(hex).toString()

/**
 * Renderer-facing Fiber operations.
 *
 * The node is the authority on channel and payment state; nothing is cached here. Status never
 * throws, because a Fiber node being down or misconfigured is an ordinary thing for the UI to
 * display rather than an error to handle.
 */
export default class FiberController {
  private service(): FiberService {
    const service = FiberSettingsService.getInstance().createService()
    if (!service) {
      throw new Error('No Fiber node is configured. Add an endpoint in settings first.')
    }
    return service
  }

  public async getEndpoint(): Promise<{ status: ResponseCode; result?: FiberEndpointView }> {
    return { status: ResponseCode.Success, result: FiberSettingsService.getInstance().getPublic() }
  }

  public async setEndpoint(params: FiberEndpoint): Promise<{ status: ResponseCode }> {
    FiberSettingsService.getInstance().set(params)
    return { status: ResponseCode.Success }
  }

  public async clearEndpoint(): Promise<{ status: ResponseCode }> {
    FiberSettingsService.getInstance().clear()
    return { status: ResponseCode.Success }
  }

  public async getStatus(): Promise<{ status: ResponseCode; result: FiberStatus }> {
    const service = FiberSettingsService.getInstance().createService()
    if (!service) {
      return { status: ResponseCode.Success, result: { configured: false, healthy: false } }
    }

    if (!(await service.isHealthy())) {
      return { status: ResponseCode.Success, result: { configured: true, healthy: false } }
    }

    try {
      const info = await service.nodeInfo()
      return {
        status: ResponseCode.Success,
        result: {
          configured: true,
          healthy: true,
          version: info.version,
          pubkey: info.pubkey,
          chainHash: info.chainHash,
          channelCount: Number(BigInt(info.channelCount)),
          peersCount: Number(BigInt(info.peersCount)),
        },
      }
    } catch (error) {
      // Reachable but unusable — a rejected token looks exactly like this, and the UI should say so
      // rather than show a healthy badge over a node it cannot talk to.
      return {
        status: ResponseCode.Success,
        result: { configured: true, healthy: false, error: (error as Error).message },
      }
    }
  }

  public async listChannels(): Promise<{ status: ResponseCode; result?: FiberChannelView[] }> {
    const channels = await this.service().listChannels()
    return {
      status: ResponseCode.Success,
      result: channels.map(channel => ({
        channelId: channel.channelId,
        peerPubkey: channel.peerPubkey,
        stateName: channel.stateName,
        localBalance: hexToDecimal(channel.localBalance),
        remoteBalance: hexToDecimal(channel.remoteBalance),
        isPublic: channel.isPublic,
        isAcceptor: channel.isAcceptor,
        enabled: channel.enabled,
        channelOutpoint: channel.channelOutpoint,
        ready: channel.stateName === 'ChannelReady' && channel.enabled,
      })),
    }
  }

  public async listPeers() {
    return { status: ResponseCode.Success, result: await this.service().listPeers() }
  }

  public async newInvoice(params: { amount: string; description?: string }) {
    return { status: ResponseCode.Success, result: await this.service().newInvoice(params) }
  }

  public async sendPayment(params: { invoice?: string; targetPubkey?: string; amount?: string }) {
    return { status: ResponseCode.Success, result: await this.service().sendPayment(params) }
  }

  public async getPayment(params: { paymentHash: string }) {
    return { status: ResponseCode.Success, result: await this.service().getPayment(params.paymentHash) }
  }
}
