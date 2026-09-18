import 'dotenv/config'

const getLiveCellMock = jest.fn()
jest.mock('../../src/utils/ckb-rpc', () => ({
  generateRPC: () => ({ getLiveCell: getLiveCellMock }),
}))

import ScriptDeploymentChecker from '../../src/services/script-deployment-checks'
import { ScriptDeployment, ScriptDeploymentRegistry } from '../../src/models/script-deployments'
import { ScriptHashType } from '../../src/models/chain/script'
import { DepType } from '../../src/models/chain/cell-dep'
import { Network, NetworkType, MAINNET_GENESIS_HASH } from '../../src/models/network'

const PINNED = `0x${'ab'.repeat(32)}`
const OTHER = `0x${'cd'.repeat(32)}`

const network: Network = {
  id: 'n',
  name: 'n',
  remote: 'http://127.0.0.1:8114',
  type: NetworkType.Normal,
  genesisHash: MAINNET_GENESIS_HASH,
  chain: 'ckb',
  readonly: false,
}

const deployment = (overrides: Partial<ScriptDeployment> = {}): ScriptDeployment => ({
  id: 'p/mainnet',
  providerId: 'p',
  network: 'mainnet',
  codeHash: `0x${'11'.repeat(32)}`,
  hashType: ScriptHashType.Type,
  cellDep: { txHash: `0x${'22'.repeat(32)}`, index: '0x0', depType: DepType.Code },
  status: 'verified',
  verifiedBinaryHash: PINNED,
  ...overrides,
})

const liveWith = (hash: string) => ({ status: 'live', cell: { data: { hash, content: '0x' }, output: {} } })

describe('ScriptDeploymentChecker', () => {
  beforeEach(() => {
    getLiveCellMock.mockReset()
  })

  describe('check', () => {
    it('agrees when the node reports the pinned binary', async () => {
      getLiveCellMock.mockResolvedValue(liveWith(PINNED))

      await expect(new ScriptDeploymentChecker().check(deployment(), network)).resolves.toEqual({ result: 'match' })
    })

    it('reports a changed binary, naming both hashes', async () => {
      getLiveCellMock.mockResolvedValue(liveWith(OTHER))

      await expect(new ScriptDeploymentChecker().check(deployment(), network)).resolves.toEqual({
        result: 'changed',
        expected: PINNED,
        actual: OTHER,
      })
    })

    it('reports a dep cell that is no longer live', async () => {
      // Not the same as a changed binary: the code is gone rather than different, and a
      // transaction carrying this dep would fail to resolve it at all.
      getLiveCellMock.mockResolvedValue({ status: 'dead', cell: null })

      await expect(new ScriptDeploymentChecker().check(deployment(), network)).resolves.toEqual({ result: 'missing' })
    })

    it('reports that it could not ask, rather than inventing a verdict', async () => {
      getLiveCellMock.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(new ScriptDeploymentChecker().check(deployment(), network)).resolves.toEqual({
        result: 'unavailable',
        reason: 'ECONNREFUSED',
      })
    })

    it('does not ask the node about a record with nothing to check against', async () => {
      await expect(
        new ScriptDeploymentChecker().check(deployment({ verifiedBinaryHash: undefined }), network)
      ).resolves.toEqual({ result: 'unpinned' })
      expect(getLiveCellMock).not.toHaveBeenCalled()
    })
  })

  describe('caching', () => {
    it('asks the node once for a definitive answer', async () => {
      getLiveCellMock.mockResolvedValue(liveWith(PINNED))
      const checker = new ScriptDeploymentChecker()

      await checker.check(deployment(), network)
      await checker.check(deployment(), network)

      expect(getLiveCellMock).toHaveBeenCalledTimes(1)
    })

    it('does not remember a node failure as a verdict', async () => {
      // A wallet that cached "unavailable" would stop checking for the rest of the session on the
      // strength of one dropped connection.
      getLiveCellMock.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue(liveWith(PINNED))
      const checker = new ScriptDeploymentChecker()

      await expect(checker.check(deployment(), network)).resolves.toEqual({
        result: 'unavailable',
        reason: 'ECONNREFUSED',
      })
      await expect(checker.check(deployment(), network)).resolves.toEqual({ result: 'match' })
      expect(getLiveCellMock).toHaveBeenCalledTimes(2)
    })

    it('keys the answer to the cell dep, so a redeployed record is checked afresh', async () => {
      getLiveCellMock.mockResolvedValue(liveWith(PINNED))
      const checker = new ScriptDeploymentChecker()

      await checker.check(deployment(), network)
      await checker.check(
        deployment({ cellDep: { txHash: `0x${'33'.repeat(32)}`, index: '0x0', depType: DepType.Code } }),
        network
      )

      expect(getLiveCellMock).toHaveBeenCalledTimes(2)
    })

    it('forgets on request', async () => {
      getLiveCellMock.mockResolvedValue(liveWith(PINNED))
      const checker = new ScriptDeploymentChecker()

      await checker.check(deployment(), network)
      checker.forget()
      await checker.check(deployment(), network)

      expect(getLiveCellMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('assertUsable', () => {
    it('refuses to proceed when the deployed binary is not the one that was verified', async () => {
      getLiveCellMock.mockResolvedValue(liveWith(OTHER))

      await expect(new ScriptDeploymentChecker().assertUsable(deployment(), network)).rejects.toThrow(
        new RegExp(`${PINNED}[\\s\\S]*${OTHER}`)
      )
    })

    it('refuses to proceed when the dep cell is gone', async () => {
      getLiveCellMock.mockResolvedValue({ status: 'dead', cell: null })

      await expect(new ScriptDeploymentChecker().assertUsable(deployment(), network)).rejects.toThrow(/no longer/i)
    })

    it('proceeds when the binary is the one that was verified', async () => {
      getLiveCellMock.mockResolvedValue(liveWith(PINNED))

      await expect(new ScriptDeploymentChecker().assertUsable(deployment(), network)).resolves.toBeUndefined()
    })

    it('proceeds when the node could not be reached', async () => {
      // Deliberately fails open. This check exists to notice that the publisher replaced the
      // binary, not to defend against an attacker on the wire: someone who can block the RPC
      // cannot change what is deployed. Failing closed would make an unreachable node enough to
      // stop a user spending their own coins.
      getLiveCellMock.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(new ScriptDeploymentChecker().assertUsable(deployment(), network)).resolves.toBeUndefined()
    })

    it('proceeds when the record pins nothing', async () => {
      await expect(
        new ScriptDeploymentChecker().assertUsable(deployment({ verifiedBinaryHash: undefined }), network)
      ).resolves.toBeUndefined()
    })
  })

  describe('assertUsableFor', () => {
    const registryWith = (d: ScriptDeployment) => new ScriptDeploymentRegistry([d])

    it('looks the deployment up by provider and checks it', async () => {
      getLiveCellMock.mockResolvedValue(liveWith(OTHER))
      const checker = new ScriptDeploymentChecker(registryWith(deployment()))

      await expect(checker.assertUsableFor('p', network)).rejects.toThrow(
        /not the one this build was verified against/i
      )
    })

    it('passes when the deployed binary matches', async () => {
      getLiveCellMock.mockResolvedValue(liveWith(PINNED))
      const checker = new ScriptDeploymentChecker(registryWith(deployment()))

      await expect(checker.assertUsableFor('p', network)).resolves.toBeUndefined()
    })

    it('says nothing about a provider the registry does not describe', async () => {
      // Not this check's business. A provider with no record for this network fails later, in the
      // code that needs a cell dep and cannot find one, with an error about that.
      const checker = new ScriptDeploymentChecker(registryWith(deployment()))

      await expect(checker.assertUsableFor('someone-else', network)).resolves.toBeUndefined()
      expect(getLiveCellMock).not.toHaveBeenCalled()
    })
  })
})
