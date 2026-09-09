import 'dotenv/config'
import LockProviderRegistry from '../../../src/services/lock-providers/registry'
import { LockProvider } from '../../../src/services/lock-providers/types'
import Script, { ScriptHashType } from '../../../src/models/chain/script'
import { Network, NetworkType } from '../../../src/models/network'

const network: Network = {
  id: 'test',
  name: 'test',
  remote: 'http://127.0.0.1:8114',
  type: NetworkType.Normal,
  genesisHash: '0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606',
  chain: 'ckb_testnet',
  readonly: false,
}

const scriptOf = (codeHash: string) => new Script(codeHash, '0x', ScriptHashType.Type)

const CODE_HASH_A = `0x${'aa'.repeat(32)}`
const CODE_HASH_B = `0x${'bb'.repeat(32)}`

const fakeProvider = (id: string, supportedCodeHash: string): LockProvider =>
  ({
    id,
    supports: (script: Script) => script.codeHash === supportedCodeHash,
  } as unknown as LockProvider)

describe('LockProviderRegistry', () => {
  it('returns a registered provider by id', () => {
    const registry = new LockProviderRegistry()
    const provider = fakeProvider('provider-a', CODE_HASH_A)

    registry.register(provider)

    expect(registry.get('provider-a')).toBe(provider)
  })

  it('returns undefined for an id that was never registered', () => {
    const registry = new LockProviderRegistry()

    expect(registry.get('nope')).toBeUndefined()
  })

  it('rejects a second provider claiming an already registered id', () => {
    const registry = new LockProviderRegistry()
    registry.register(fakeProvider('provider-a', CODE_HASH_A))

    expect(() => registry.register(fakeProvider('provider-a', CODE_HASH_B))).toThrow(
      /already registered.*provider-a|provider-a.*already registered/i
    )
  })

  it('throws from getOrThrow for an unknown id', () => {
    const registry = new LockProviderRegistry()

    expect(() => registry.getOrThrow('nope')).toThrow(/nope/)
  })

  it('resolves the provider whose supports() accepts the script', () => {
    const registry = new LockProviderRegistry()
    const a = fakeProvider('provider-a', CODE_HASH_A)
    const b = fakeProvider('provider-b', CODE_HASH_B)
    registry.register(a)
    registry.register(b)

    expect(registry.resolve(scriptOf(CODE_HASH_B), network)).toBe(b)
  })

  it('resolves to undefined when no provider claims the script', () => {
    const registry = new LockProviderRegistry()
    registry.register(fakeProvider('provider-a', CODE_HASH_A))

    expect(registry.resolve(scriptOf(CODE_HASH_B), network)).toBeUndefined()
  })

  it('throws from resolveOrThrow when no provider claims the script, naming the code hash', () => {
    const registry = new LockProviderRegistry()
    registry.register(fakeProvider('provider-a', CODE_HASH_A))

    expect(() => registry.resolveOrThrow(scriptOf(CODE_HASH_B), network)).toThrow(CODE_HASH_B)
  })

  it('lists registered providers in registration order', () => {
    const registry = new LockProviderRegistry()
    const a = fakeProvider('provider-a', CODE_HASH_A)
    const b = fakeProvider('provider-b', CODE_HASH_B)
    registry.register(a)
    registry.register(b)

    expect(registry.list()).toEqual([a, b])
  })

  it('isolates registrations between instances', () => {
    const one = new LockProviderRegistry()
    const two = new LockProviderRegistry()
    one.register(fakeProvider('provider-a', CODE_HASH_A))

    expect(two.get('provider-a')).toBeUndefined()
  })
})
