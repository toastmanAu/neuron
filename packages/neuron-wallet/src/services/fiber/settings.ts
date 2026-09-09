import Store from '../../models/store'
import FiberRpcClient from './rpc-client'
import FiberService from './service'

const MODULE_NAME = 'fiber'
const FILE_NAME = 'endpoint.json'
const KEY = 'endpoint'

export interface FiberEndpoint {
  url: string
  /** Biscuit token. A credential: it authorises channel and payment operations. */
  token?: string
}

/** What the renderer is allowed to see: that an endpoint exists, never the credential. */
export interface FiberEndpointView {
  url: string
  hasToken: boolean
}

/**
 * Where the configured Fiber node lives.
 *
 * Neuron does not run or manage the node; it points at one. The node stays the authority on channel
 * state, so nothing about channels is stored here.
 */
export default class FiberSettingsService {
  private static instance: FiberSettingsService | undefined

  public static getInstance(): FiberSettingsService {
    if (!FiberSettingsService.instance) {
      FiberSettingsService.instance = new FiberSettingsService()
    }
    return FiberSettingsService.instance
  }

  /** Drop the memoised instance. Used when the underlying store is replaced. */
  public static reset(): void {
    FiberSettingsService.instance = undefined
  }

  private readonly store: Store

  constructor() {
    this.store = new Store(MODULE_NAME, FILE_NAME, JSON.stringify({}))
  }

  public get(): FiberEndpoint | undefined {
    return this.store.readSync<FiberEndpoint | undefined>(KEY)
  }

  public getPublic(): FiberEndpointView | undefined {
    const endpoint = this.get()
    if (!endpoint) {
      return undefined
    }
    return { url: endpoint.url, hasToken: Boolean(endpoint.token) }
  }

  public set(endpoint: FiberEndpoint): void {
    let parsed: URL
    try {
      parsed = new URL(endpoint.url)
    } catch {
      throw new Error(`"${endpoint.url}" is not a valid URL`)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`A Fiber endpoint must be http or https, got "${parsed.protocol}"`)
    }

    this.store.writeSync(KEY, endpoint)
  }

  public clear(): void {
    this.store.writeSync(KEY, undefined)
  }

  public createService(): FiberService | undefined {
    const endpoint = this.get()
    if (!endpoint) {
      return undefined
    }
    return new FiberService(new FiberRpcClient({ url: endpoint.url, token: endpoint.token }))
  }
}
