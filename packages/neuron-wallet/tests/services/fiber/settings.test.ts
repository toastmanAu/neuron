import 'dotenv/config'

const store = new Map<string, unknown>()
jest.mock('../../../src/models/store', () => ({
  __esModule: true,
  default: class {
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor, no-useless-constructor
    constructor(_moduleName: string, _filename: string, _defaultValue?: unknown) {}

    readSync<T>(key: string): T {
      return store.get(key) as T
    }

    writeSync(key: string, value: unknown): void {
      store.set(key, value)
    }
  },
}))

import FiberSettingsService from '../../../src/services/fiber/settings'

describe('FiberSettingsService', () => {
  beforeEach(() => {
    store.clear()
    FiberSettingsService.reset()
  })

  it('has no endpoint configured out of the box', () => {
    expect(FiberSettingsService.getInstance().get()).toBeUndefined()
  })

  it('stores and returns an endpoint', () => {
    FiberSettingsService.getInstance().set({ url: 'http://127.0.0.1:8231' })

    expect(FiberSettingsService.getInstance().get()?.url).toBe('http://127.0.0.1:8231')
  })

  it('keeps the auth token so a configured node stays reachable across restarts', () => {
    FiberSettingsService.getInstance().set({ url: 'http://127.0.0.1:8231', token: 'secret-biscuit' })

    expect(FiberSettingsService.getInstance().get()?.token).toBe('secret-biscuit')
  })

  it('never includes the token in the renderer-facing view', () => {
    // A biscuit token authorises channel and payment operations. The renderer needs to know an
    // endpoint is configured, never what the credential is.
    FiberSettingsService.getInstance().set({ url: 'http://127.0.0.1:8231', token: 'secret-biscuit' })

    const view = FiberSettingsService.getInstance().getPublic()

    expect(view).toEqual({ url: 'http://127.0.0.1:8231', hasToken: true })
    expect(JSON.stringify(view)).not.toContain('secret-biscuit')
  })

  it('reports when no token is configured', () => {
    FiberSettingsService.getInstance().set({ url: 'http://127.0.0.1:8231' })

    expect(FiberSettingsService.getInstance().getPublic()).toEqual({
      url: 'http://127.0.0.1:8231',
      hasToken: false,
    })
  })

  it('rejects an endpoint that is not http or https', () => {
    expect(() => FiberSettingsService.getInstance().set({ url: 'file:///etc/passwd' })).toThrow(/http/i)
  })

  it('rejects an endpoint that is not a URL at all', () => {
    expect(() => FiberSettingsService.getInstance().set({ url: 'not a url' })).toThrow(/url/i)
  })

  it('clears a configured endpoint', () => {
    FiberSettingsService.getInstance().set({ url: 'http://127.0.0.1:8231', token: 'x' })

    FiberSettingsService.getInstance().clear()

    expect(FiberSettingsService.getInstance().get()).toBeUndefined()
  })

  it('builds a service for the configured endpoint', () => {
    FiberSettingsService.getInstance().set({ url: 'http://127.0.0.1:8231', token: 'x' })

    expect(FiberSettingsService.getInstance().createService()?.endpoint).toBe('http://127.0.0.1:8231')
  })

  it('builds no service when nothing is configured', () => {
    expect(FiberSettingsService.getInstance().createService()).toBeUndefined()
  })
})
