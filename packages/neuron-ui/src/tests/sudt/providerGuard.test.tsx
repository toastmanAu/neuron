import { describe, it, expect } from 'vitest'
import { assetAccountsUnavailableReason } from '../../utils/assetAccounts'
import en from '../../locales/en.json'

const resolve = (key?: string) =>
  key ? (key.split('.').reduce<any>((node, part) => node?.[part], en.translation) as string | undefined) : undefined

/**
 * Asset accounts and a quantum-resistant wallet.
 *
 * The backend refuses these, and rightly: an asset account is a cell under the deployed
 * anyone-can-pay lock, whose args are a 20-byte secp256k1 public key hash and which verifies a
 * secp256k1 signature. The refusal used to arrive only when the transaction was generated, which
 * is the *last* step — the user could open the page, press "create asset account", fill in a token
 * and reach the second page of the dialog before anything said no.
 */
describe('assetAccountsUnavailableReason', () => {
  it('names the obstacle for a provider-backed wallet', () => {
    const reason = resolve(assetAccountsUnavailableReason('slh-dsa-fips205'))

    expect(reason).toBeTruthy()
    expect(reason).toMatch(/anyone-can-pay/i)
    expect(reason).toMatch(/secp256k1/i)
  })

  it('does not mention an internal method name', () => {
    // The old message was "This wallet does not support getNextReceivingAddresses function", which
    // named a private method as though it were a feature the user had asked for.
    expect(resolve(assetAccountsUnavailableReason('slh-dsa-fips205'))).not.toMatch(/getNext|function\./)
  })

  it('is silent for an ordinary wallet', () => {
    expect(assetAccountsUnavailableReason(undefined)).toBeUndefined()
    expect(assetAccountsUnavailableReason('')).toBeUndefined()
  })
})
