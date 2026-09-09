import 'dotenv/config'
import ScriptDeploymentRegistry from '../../../src/models/script-deployments/registry'
import { deploymentNetworkOf, ScriptDeployment } from '../../../src/models/script-deployments/types'
import Script, { ScriptHashType } from '../../../src/models/chain/script'
import { DepType } from '../../../src/models/chain/cell-dep'
import {
  Network,
  NetworkType,
  MAINNET_GENESIS_HASH,
  TESTNET_GENESIS_HASH,
  EMPTY_GENESIS_HASH,
} from '../../../src/models/network'

const networkWithGenesis = (genesisHash: string, chain = 'ckb_testnet'): Network => ({
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
const unsynced = networkWithGenesis(EMPTY_GENESIS_HASH, 'ckb')

const CODE_HASH_MAINNET = `0x${'a1'.repeat(32)}`
const CODE_HASH_TESTNET = `0x${'b2'.repeat(32)}`
const TX_HASH = `0x${'c3'.repeat(32)}`

const record = (overrides: Partial<ScriptDeployment> = {}): ScriptDeployment =>
  ({
    id: 'demo-lock/mainnet',
    providerId: 'demo-lock',
    network: 'mainnet',
    codeHash: CODE_HASH_MAINNET,
    hashType: ScriptHashType.Type,
    cellDep: { txHash: TX_HASH, index: '0x0', depType: DepType.Code },
    status: 'verified',
    source: 'https://example.invalid/deployment',
    ...overrides,
  } as ScriptDeployment)

const testnetRecord = record({
  id: 'demo-lock/testnet',
  network: 'testnet',
  codeHash: CODE_HASH_TESTNET,
  hashType: ScriptHashType.Data1,
})

describe('deploymentNetworkOf', () => {
  it('identifies mainnet by its genesis hash', () => {
    expect(deploymentNetworkOf(mainnet)).toBe('mainnet')
  })

  it('identifies testnet by its genesis hash', () => {
    expect(deploymentNetworkOf(testnet)).toBe('testnet')
  })

  it('refuses to identify a dev chain', () => {
    expect(deploymentNetworkOf(devnet)).toBeUndefined()
  })

  it('refuses to identify a node whose genesis hash is not known yet', () => {
    // Falling back to `chain` here would hand out mainnet deployment data to a node that has not
    // proven which chain it is on.
    expect(deploymentNetworkOf(unsynced)).toBeUndefined()
  })
})

describe('ScriptDeploymentRegistry', () => {
  describe('lookup', () => {
    const registry = new ScriptDeploymentRegistry([record(), testnetRecord])

    it('finds a deployment by provider and network', () => {
      expect(registry.forProvider('demo-lock', mainnet)?.codeHash).toBe(CODE_HASH_MAINNET)
      expect(registry.forProvider('demo-lock', testnet)?.codeHash).toBe(CODE_HASH_TESTNET)
    })

    it('returns nothing for a provider that has no deployment', () => {
      expect(registry.forProvider('never-deployed', mainnet)).toBeUndefined()
    })

    it('returns nothing on a network it cannot identify', () => {
      expect(registry.forProvider('demo-lock', devnet)).toBeUndefined()
    })

    it('finds a deployment by script', () => {
      const script = new Script(CODE_HASH_MAINNET, '0x', ScriptHashType.Type)

      expect(registry.forScript(script, mainnet)?.id).toBe('demo-lock/mainnet')
    })

    it('does not match a script whose hash type differs', () => {
      const script = new Script(CODE_HASH_MAINNET, '0x', ScriptHashType.Data)

      expect(registry.forScript(script, mainnet)).toBeUndefined()
    })

    it('does not match a mainnet code hash while on testnet', () => {
      const script = new Script(CODE_HASH_MAINNET, '0x', ScriptHashType.Type)

      expect(registry.forScript(script, testnet)).toBeUndefined()
    })

    it('builds a cell dep from the record', () => {
      const cellDep = registry.cellDepFor('demo-lock', mainnet)

      expect(cellDep?.outPoint.txHash).toBe(TX_HASH)
      expect(cellDep?.depType).toBe(DepType.Code)
    })

    it('stores the cell dep index as upstream publishes it, in hex', () => {
      // Deployment records mirror what the publishing project states, so they can be diffed against
      // it by eye. Upstream publishes `index: 0x0`.
      expect(registry.forProvider('demo-lock', mainnet)?.cellDep.index).toBe('0x0')
    })

    it('converts the hex index to the decimal form Neuron OutPoint uses internally', () => {
      // Neuron's OutPoint normalises index to a decimal string and only converts back to hex in
      // toSDK(). A record carrying hex must not reach an OutPoint unconverted, or a non-zero index
      // would silently point at the wrong cell.
      const hexIndexed = new ScriptDeploymentRegistry([
        record({ id: 'demo-lock/mainnet', cellDep: { txHash: TX_HASH, index: '0x1a', depType: DepType.Code } }),
      ])

      expect(hexIndexed.cellDepFor('demo-lock', mainnet)?.outPoint.index).toBe('26')
      expect(hexIndexed.cellDepFor('demo-lock', mainnet)?.outPoint.toSDK().index).toBe('0x1a')
    })

    it('returns no cell dep when there is no deployment', () => {
      expect(registry.cellDepFor('never-deployed', mainnet)).toBeUndefined()
    })

    it('lists every record it holds', () => {
      expect(registry.list().map(d => d.id)).toEqual(['demo-lock/mainnet', 'demo-lock/testnet'])
    })
  })

  describe('validation of bundled data', () => {
    it('rejects two records sharing an id', () => {
      expect(() => new ScriptDeploymentRegistry([record(), record({ network: 'testnet' })])).toThrow(/duplicate id/i)
    })

    it('rejects two deployments for the same provider on the same network', () => {
      expect(
        () => new ScriptDeploymentRegistry([record(), record({ id: 'other', codeHash: CODE_HASH_TESTNET })])
      ).toThrow(/demo-lock.*mainnet|mainnet.*demo-lock/i)
    })

    it('rejects a record with an empty provider id', () => {
      expect(() => new ScriptDeploymentRegistry([record({ providerId: '' })])).toThrow(/provider/i)
    })

    it('rejects a code hash that is not 32 bytes of hex', () => {
      expect(() => new ScriptDeploymentRegistry([record({ codeHash: '0xdeadbeef' })])).toThrow(/code hash/i)
    })

    it('rejects a cell dep tx hash that is not 32 bytes of hex', () => {
      expect(
        () =>
          new ScriptDeploymentRegistry([record({ cellDep: { txHash: '0x00', index: '0x0', depType: DepType.Code } })])
      ).toThrow(/tx hash/i)
    })

    it('rejects a cell dep index that is not a hex quantity', () => {
      expect(
        () =>
          new ScriptDeploymentRegistry([record({ cellDep: { txHash: TX_HASH, index: '0', depType: DepType.Code } })])
      ).toThrow(/index/i)
    })

    it('rejects an unknown hash type', () => {
      expect(() => new ScriptDeploymentRegistry([record({ hashType: 'data9' as ScriptHashType })])).toThrow(
        /hash type/i
      )
    })

    it('rejects an unknown dep type', () => {
      expect(
        () =>
          new ScriptDeploymentRegistry([
            record({ cellDep: { txHash: TX_HASH, index: '0x0', depType: 'depgroup' as DepType } }),
          ])
      ).toThrow(/dep type/i)
    })

    it('rejects an unknown network', () => {
      expect(() => new ScriptDeploymentRegistry([record({ network: 'stagenet' as never })])).toThrow(/network/i)
    })

    it('rejects an unknown status', () => {
      expect(() => new ScriptDeploymentRegistry([record({ status: 'probably-fine' as never })])).toThrow(/status/i)
    })

    it('accepts a well formed record', () => {
      expect(() => new ScriptDeploymentRegistry([record()])).not.toThrow()
    })
  })
})
