import 'dotenv/config'

const getCurrentNetworkMock = jest.fn()
jest.mock('../../src/services/networks', () => ({
  __esModule: true,
  default: { getInstance: () => ({ getCurrent: () => getCurrentNetworkMock(), isMainnet: () => false }) },
}))

import CellsService from '../../src/services/cells'
import Script, { ScriptHashType } from '../../src/models/chain/script'

const testnet = {
  id: 'n',
  name: 'n',
  remote: 'http://127.0.0.1:8114',
  type: 0,
  genesisHash: '0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606',
  chain: 'ckb_testnet',
  readonly: false,
}

/**
 * Customized assets held under a provider-backed lock.
 *
 * Observed on testnet: a Spore NFT was minted to a quantum-resistant wallet's lock, was visible on
 * chain and in the wallet's own cell list, and the Customized Assets page said "No customized
 * assets". The page asks for the wallet's HD addresses and matches cells by `blake160`; a
 * provider-backed wallet has neither, so the filter set was empty and nothing could match.
 *
 * `getCustomizedAssetCells` therefore has to be told which locks the wallet owns, rather than
 * inferring them from blake160s alone.
 */
describe('CellsService.getCustomizedAssetCells for a provider-backed wallet', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getCurrentNetworkMock.mockReturnValue(testnet)
  })

  it('accepts provider lock scripts alongside blake160s', () => {
    // The signature is the contract: without somewhere to put the wallet's real locks, the page
    // cannot ask for them and a provider-backed wallet can never see its own assets.
    const pqLock = new Script(`0x${'a1'.repeat(32)}`, `0x${'b2'.repeat(32)}`, ScriptHashType.Data1)

    expect(() => CellsService.getCustomizedAssetCells([], 1, 20, [pqLock])).not.toThrow()
  })
})
