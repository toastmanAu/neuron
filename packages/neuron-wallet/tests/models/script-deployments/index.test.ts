import 'dotenv/config'
import {
  getDefaultScriptDeploymentRegistry,
  SLH_DSA_PROVIDER_ID,
  BUNDLED_SCRIPT_DEPLOYMENTS,
  verifyDeployedBinary,
  ScriptDeployment,
} from '../../../src/models/script-deployments'
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

describe('verifyDeployedBinary', () => {
  const deployment = (overrides: Partial<ScriptDeployment> = {}): ScriptDeployment => ({
    id: 'x/testnet',
    providerId: 'x',
    network: 'testnet',
    codeHash: `0x${'11'.repeat(32)}`,
    hashType: ScriptHashType.Data1,
    cellDep: { txHash: `0x${'22'.repeat(32)}`, index: '0x0', depType: DepType.Code },
    status: 'verified',
    ...overrides,
  })

  it('agrees when the deployed binary is the one that was verified', () => {
    const d = deployment({ verifiedBinaryHash: `0x${'ab'.repeat(32)}` })

    expect(verifyDeployedBinary(d, `0x${'ab'.repeat(32)}`)).toEqual({ result: 'match' })
  })

  it('ignores case, since hex casing is not meaningful', () => {
    const d = deployment({ verifiedBinaryHash: `0x${'ab'.repeat(32)}` })

    expect(verifyDeployedBinary(d, `0x${'AB'.repeat(32)}`)).toEqual({ result: 'match' })
  })

  it('reports a changed binary, naming both hashes', () => {
    const d = deployment({ verifiedBinaryHash: `0x${'ab'.repeat(32)}` })

    expect(verifyDeployedBinary(d, `0x${'cd'.repeat(32)}`)).toEqual({
      result: 'changed',
      expected: `0x${'ab'.repeat(32)}`,
      actual: `0x${'cd'.repeat(32)}`,
    })
  })

  it('reports an unpinned record distinctly, rather than as agreement', () => {
    // A record that never said which binary it was checked against cannot agree with anything.
    // Returning 'match' here would let a missing pin read as a passed check.
    expect(verifyDeployedBinary(deployment(), `0x${'ab'.repeat(32)}`)).toEqual({ result: 'unpinned' })
  })
})

describe('bundled deployments pin the binary they were verified against', () => {
  // Read from the live chains on 2026-09-12: each dep cell was fetched and hashed, and every one
  // of the twelve parameter sets was executed against both binaries under ckb-debugger.
  const LIVE = {
    mainnet: '0x49417a0ed39196e8d90d0088ca98bf6b881966ba1c2ea12160ca42141787565e',
    testnet: '0x147ecbb5c5127d982ee1362d2c2bb4267803da2eb006d150e88af6caaa0a7eaf',
  }

  BUNDLED_SCRIPT_DEPLOYMENTS.forEach(d => {
    it(`${d.id} pins the binary observed on chain`, () => {
      expect(d.verifiedBinaryHash).toBe(LIVE[d.network])
    })

    it(`${d.id} agrees with that binary`, () => {
      expect(verifyDeployedBinary(d, LIVE[d.network])).toEqual({ result: 'match' })
    })
  })

  it('pins mainnet to something other than its code hash, because a Type ID cannot detect a redeploy', () => {
    // The whole point of the field. Mainnet's codeHash is stable by construction across upgrades,
    // so if the pin were merely a copy of it the check could never fail.
    const mainnet = BUNDLED_SCRIPT_DEPLOYMENTS.find(d => d.network === 'mainnet')!

    expect(mainnet.hashType).toBe(ScriptHashType.Type)
    expect(mainnet.verifiedBinaryHash).not.toBe(mainnet.codeHash)
  })

  it('pins testnet to its code hash, because data1 makes them the same thing', () => {
    const testnet = BUNDLED_SCRIPT_DEPLOYMENTS.find(d => d.network === 'testnet')!

    expect(testnet.hashType).toBe(ScriptHashType.Data1)
    expect(testnet.verifiedBinaryHash).toBe(testnet.codeHash)
  })
})
