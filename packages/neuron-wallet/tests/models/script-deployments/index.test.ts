import 'dotenv/config'
import { getDefaultScriptDeploymentRegistry, SLH_DSA_PROVIDER_ID } from '../../../src/models/script-deployments'
import { ScriptHashType } from '../../../src/models/chain/script'
import { DepType } from '../../../src/models/chain/cell-dep'
import { Network, NetworkType, MAINNET_GENESIS_HASH, TESTNET_GENESIS_HASH } from '../../../src/models/network'

const networkWithGenesis = (genesisHash: string, chain: string): Network => ({
  id: 'test',
  name: 'test',
  remote: 'http://127.0.0.1:8114',
  type: NetworkType.Normal,
  genesisHash,
  chain,
  readonly: false,
})

const mainnet = networkWithGenesis(MAINNET_GENESIS_HASH, 'ckb')
const testnet = networkWithGenesis(TESTNET_GENESIS_HASH, 'ckb_testnet')
const devnet = networkWithGenesis(`0x${'ee'.repeat(32)}`, 'ckb_dev')

/**
 * Verified on 2026-09-09 against nervosnetwork/quantum-resistant-lock-script @ 082c0a19,
 * README.md "Deployment" and deployment/mainnet/info.json. These literals are the acceptance
 * criterion for the bundled data: if upstream redeploys, this test is what must be updated, and it
 * is the only place the values are asserted.
 */
const UPSTREAM = {
  mainnet: {
    codeHash: '0x302d35982f865ebcbedb9a9360e40530ed32adb8e10b42fbbe70d8312ff7cedf',
    hashType: ScriptHashType.Type,
    txHash: '0x4598d00df2f3dc8bc40eee38689a539c94f6cc3720b7a2a6746736daa60f500a',
    index: '0x0',
    depType: DepType.Code,
  },
  testnet: {
    codeHash: '0x147ecbb5c5127d982ee1362d2c2bb4267803da2eb006d150e88af6caaa0a7eaf',
    hashType: ScriptHashType.Data1,
    txHash: '0x631d9a6049fb1fc3790e89d9daf35abe535b5e754cd8c3404319319710f0b106',
    index: '0x0',
    depType: DepType.Code,
  },
} as const

describe('bundled script deployments', () => {
  const registry = getDefaultScriptDeploymentRegistry()

  it('memoises the default registry rather than revalidating per call', () => {
    expect(getDefaultScriptDeploymentRegistry()).toBe(getDefaultScriptDeploymentRegistry())
  })

  it.each(['mainnet', 'testnet'] as const)('matches the upstream %s deployment exactly', name => {
    const network = name === 'mainnet' ? mainnet : testnet
    const expected = UPSTREAM[name]
    const deployment = registry.forProvider(SLH_DSA_PROVIDER_ID, network)

    expect(deployment).toBeDefined()
    expect(deployment!.codeHash).toBe(expected.codeHash)
    expect(deployment!.hashType).toBe(expected.hashType)
    expect(deployment!.cellDep.txHash).toBe(expected.txHash)
    expect(deployment!.cellDep.index).toBe(expected.index)
    expect(deployment!.cellDep.depType).toBe(expected.depType)
  })

  it('records that mainnet is a Type ID and therefore upgradeable, while testnet is pinned to code', () => {
    // Not cosmetic: mainnet's code_hash is a Type ID whose code can be replaced by the upstream
    // 3-of-5 multisig, testnet's is a data1 hash of the binary itself. Anything that assumes one
    // hash type for both networks is wrong.
    expect(registry.forProvider(SLH_DSA_PROVIDER_ID, mainnet)!.hashType).toBe(ScriptHashType.Type)
    expect(registry.forProvider(SLH_DSA_PROVIDER_ID, testnet)!.hashType).toBe(ScriptHashType.Data1)
  })

  it('resolves the deployment from a script found on chain', () => {
    const script = {
      codeHash: UPSTREAM.testnet.codeHash,
      args: `0x${'11'.repeat(32)}`,
      hashType: UPSTREAM.testnet.hashType,
    }

    expect(registry.forScript(script as never, testnet)?.providerId).toBe(SLH_DSA_PROVIDER_ID)
  })

  it('offers no deployment on an unrecognised chain', () => {
    expect(registry.forProvider(SLH_DSA_PROVIDER_ID, devnet)).toBeUndefined()
  })

  it('does not resolve the mainnet script while connected to testnet', () => {
    const mainnetScript = {
      codeHash: UPSTREAM.mainnet.codeHash,
      args: '0x',
      hashType: UPSTREAM.mainnet.hashType,
    }

    expect(registry.forScript(mainnetScript as never, testnet)).toBeUndefined()
  })

  it('records provenance for every bundled deployment', () => {
    registry.list().forEach(deployment => {
      expect(deployment.source).toMatch(/^https:\/\//)
      expect(deployment.status).toBe('verified')
    })
  })

  it('bundles only the SLH-DSA deployments in this release', () => {
    expect(
      registry
        .list()
        .map(d => d.id)
        .sort()
    ).toEqual([`${SLH_DSA_PROVIDER_ID}/mainnet`, `${SLH_DSA_PROVIDER_ID}/testnet`])
  })
})
