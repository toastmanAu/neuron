import 'dotenv/config'
import { bytes } from '@ckb-lumos/lumos/codec'

const getByWalletIdMock = jest.fn()
const getSecretMock = jest.fn()
const resolveInputsMock = jest.fn()
const getCurrentNetworkMock = jest.fn()
const getWalletMock = jest.fn()
const assertUsableForMock = jest.fn()

jest.mock('../../../src/services/script-identities', () => ({
  __esModule: true,
  default: { getByWalletId: (...args: unknown[]) => getByWalletIdMock(...args) },
}))
jest.mock('../../../src/services/tx/resolve-inputs', () => ({
  __esModule: true,
  default: (...args: unknown[]) => resolveInputsMock(...args),
}))
jest.mock('../../../src/services/secret-sources', () => ({
  __esModule: true,
  getDefaultSecretSourceRegistry: () => ({
    getOrThrow:
      () =>
      (...args: unknown[]) =>
        getSecretMock(...args),
  }),
}))
jest.mock('../../../src/services/script-deployment-checks', () => ({
  __esModule: true,
  default: class {
    // eslint-disable-next-line class-methods-use-this
    assertUsableFor(...args: unknown[]) {
      return assertUsableForMock(...args)
    }
  },
}))
jest.mock('../../../src/services/networks', () => ({
  __esModule: true,
  default: { getInstance: () => ({ getCurrent: () => getCurrentNetworkMock() }) },
}))
jest.mock('../../../src/services/wallets', () => ({
  __esModule: true,
  default: { getInstance: () => ({ get: (...a: unknown[]) => getWalletMock(...a) }) },
  Wallet: class {},
}))

import TransactionSender from '../../../src/services/transaction-sender'
import ScriptIdentity from '../../../src/models/script-identity'
import Transaction from '../../../src/models/chain/transaction'
import Input from '../../../src/models/chain/input'
import OutPoint from '../../../src/models/chain/out-point'
import Output from '../../../src/models/chain/output'
import Script, { ScriptHashType } from '../../../src/models/chain/script'
import WitnessArgs from '../../../src/models/chain/witness-args'
import { hd } from '@ckb-lumos/lumos'
import { getParameterSet, parseWitnessLock } from '../../../src/services/lock-providers/slh-dsa/parameter-sets'
import ckbTxMessageAll from '../../../src/models/ckb-tx-message-all'
import { NetworkType, TESTNET_GENESIS_HASH } from '../../../src/models/network'
import { SLH_DSA_VECTORS } from '../../fixtures/slh-dsa-vectors'

const PARAM = 'SLH-DSA-SHA2-128s' as const
const keyVector = SLH_DSA_VECTORS.keyPairs.find(k => k.paramSet === PARAM)!
const TESTNET_CODE_HASH = '0x147ecbb5c5127d982ee1362d2c2bb4267803da2eb006d150e88af6caaa0a7eaf'

const network = {
  id: 'n',
  name: 'n',
  remote: 'http://127.0.0.1:8114',
  type: NetworkType.Normal,
  genesisHash: TESTNET_GENESIS_HASH,
  chain: 'ckb_testnet',
  readonly: false,
}

const lockScript = new Script(
  TESTNET_CODE_HASH,
  require('../../../src/services/lock-providers/slh-dsa/parameter-sets').deriveLockArgs(PARAM, keyVector.publicKey),
  ScriptHashType.Data1
)

const identity = ScriptIdentity.fromObject({
  walletId: 'pq',
  providerId: 'slh-dsa-fips205',
  addressType: hd.AddressType.Receiving,
  addressIndex: 0,
  address: 'ckt1...',
  lockCodeHash: lockScript.codeHash,
  lockHashType: lockScript.hashType,
  lockArgs: lockScript.args,
  derivationPath: 'vault:pq',
  publicKey: keyVector.publicKey,
  metadata: { parameterSet: PARAM, publicKey: keyVector.publicKey },
})

const buildTx = () =>
  Transaction.fromObject({
    version: '0',
    inputs: [
      Input.fromObject({
        previousOutput: OutPoint.fromObject({ txHash: `0x${'01'.repeat(32)}`, index: '0x0' }),
        since: '0',
        capacity: '10000000000',
        lock: lockScript,
      }),
    ],
    outputs: [Output.fromObject({ capacity: '9000000000', lock: lockScript })],
    outputsData: ['0x'],
    witnesses: [WitnessArgs.generateEmpty()],
  })

const resolvedInputs = [{ capacity: '0x2540be400', lock: lockScript, type: null, data: '0x' }]

describe('TransactionSender with a provider-backed wallet', () => {
  const sender = new TransactionSender()

  beforeEach(() => {
    getByWalletIdMock.mockReset().mockResolvedValue([identity])
    resolveInputsMock.mockReset().mockResolvedValue(resolvedInputs)
    getCurrentNetworkMock.mockReset().mockReturnValue(network)
    getWalletMock.mockReset().mockReturnValue({ isHardware: () => false, getLockProviderId: () => 'slh-dsa-fips205' })
    getSecretMock
      .mockReset()
      .mockResolvedValue({ type: 'slh-dsa-secret-key', secretKey: keyVector.secretKey, parameterSet: PARAM })
  })

  it('signs with the identity provider and embeds a verifiable signature', async () => {
    const tx = buildTx()

    const signed = await sender.sign('pq', tx, 'password', false)

    const witnessArgs = WitnessArgs.deserialize(signed.witnesses[0] as string)
    const parsed = parseWitnessLock(witnessArgs.lock!)

    expect(parsed.parameterSet.name).toBe(PARAM)
    expect(parsed.publicKey).toBe(keyVector.publicKey)

    const message = ckbTxMessageAll({
      txHash: tx.computeHash(),
      resolvedInputs,
      witnesses: [
        require('../../../src/utils/serialization').serializeWitnessArgs(WitnessArgs.generateEmpty().toSDK()),
      ],
      scriptGroupIndex: 0,
    })

    expect(
      getParameterSet(PARAM).signer.verify(
        bytes.bytify(keyVector.publicKey),
        bytes.bytify(message),
        bytes.bytify(parsed.signature)
      )
    ).toBe(true)
  }, 120000)

  it('resolves input cells from the chain before signing', async () => {
    await sender.sign('pq', buildTx(), 'password', false)

    expect(resolveInputsMock).toHaveBeenCalledTimes(1)
  }, 120000)

  it('asks for secret material only for the provider the identity names', async () => {
    await sender.sign('pq', buildTx(), 'password', false)

    expect(getSecretMock).toHaveBeenCalledWith('pq', 'password')
  }, 120000)

  it('refuses to sign an input whose lock no identity claims', async () => {
    // The security invariant: an unidentified lock is never signed. There is no dialog offering to
    // continue here, unlike the legacy secp path, because a provider-backed wallet has no
    // convention-based fallback that could match it.
    const tx = buildTx()
    tx.inputs[0].lock = new Script(`0x${'99'.repeat(32)}`, '0x1234', ScriptHashType.Type)
    tx.inputs[0].lockHash = tx.inputs[0].lock.computeHash()

    await expect(sender.sign('pq', tx, 'password', false)).rejects.toThrow(/lock|identity/i)
  })

  it('leaves a wallet that declares no lock provider on the original signing path', async () => {
    // A legacy secp wallet must not reach provider code at all — not even to look for identities,
    // which would add a database dependency to a path that never had one.
    getWalletMock.mockReturnValue({ isHardware: () => false, getLockProviderId: () => undefined })

    await sender.sign('pq', buildTx(), 'password', false).catch(() => undefined)

    expect(getByWalletIdMock).not.toHaveBeenCalled()
    expect(resolveInputsMock).not.toHaveBeenCalled()
  })

  it('fails clearly when a provider-backed wallet has no stored identities', async () => {
    getByWalletIdMock.mockResolvedValue([])

    await expect(sender.sign('pq', buildTx(), 'password', false)).rejects.toThrow()
  })

  it('checks the deployed script before producing a signature', async () => {
    // The signature is only worth anything against the code that will check it. Mainnet deploys
    // the lock behind a Type ID, so the binary can be replaced while every lock script — and so
    // every stored identity — stays byte for byte identical.
    await sender.sign('pq', buildTx(), 'password', false)

    expect(assertUsableForMock).toHaveBeenCalledWith(
      'slh-dsa-fips205',
      expect.objectContaining({ genesisHash: TESTNET_GENESIS_HASH })
    )
  }, 120000)

  it('does not sign when the deployed script is not the one this build was verified against', async () => {
    assertUsableForMock.mockRejectedValueOnce(new Error('the deployed binary has changed'))

    await expect(sender.sign('pq', buildTx(), 'password', false)).rejects.toThrow(/deployed binary has changed/)
    expect(getSecretMock).not.toHaveBeenCalled()
  })
})
