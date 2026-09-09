import 'dotenv/config'
import { getDefaultLockProviderRegistry, Secp256k1LockProvider } from '../../../src/services/lock-providers'
import SystemScriptInfo from '../../../src/models/system-script-info'
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

const BLAKE160 = '0x36c329ed630d6ce750712a477543672adab57f4c'

describe('default lock provider registry', () => {
  it('has the secp256k1 provider registered under its stable id', () => {
    expect(getDefaultLockProviderRegistry().getOrThrow(Secp256k1LockProvider.ID)).toBeInstanceOf(Secp256k1LockProvider)
  })

  it('resolves the system secp script to the secp256k1 provider', () => {
    const script = SystemScriptInfo.generateSecpScript(BLAKE160)

    expect(getDefaultLockProviderRegistry().resolve(script, network)?.id).toBe(Secp256k1LockProvider.ID)
  })

  it('resolves nothing for a lock no built-in provider claims', () => {
    const unknown = new Script(`0x${'99'.repeat(32)}`, BLAKE160, ScriptHashType.Type)

    expect(getDefaultLockProviderRegistry().resolve(unknown, network)).toBeUndefined()
  })

  it('memoises the default registry rather than rebuilding it per call', () => {
    expect(getDefaultLockProviderRegistry()).toBe(getDefaultLockProviderRegistry())
  })

  it('ships exactly one built-in provider in this release', () => {
    expect(
      getDefaultLockProviderRegistry()
        .list()
        .map(p => p.id)
    ).toEqual([Secp256k1LockProvider.ID])
  })
})
