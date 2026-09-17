/**
 * Why asset accounts are unavailable to a wallet, if they are.
 *
 * An asset account is a cell under the deployed anyone-can-pay lock: its args are a 20-byte
 * secp256k1 public key hash and it verifies a secp256k1 signature. A quantum-resistant wallet has
 * neither, so an account created for one could be funded and never spent.
 *
 * The backend refuses for the same reason, but it can only do so once a transaction is being
 * generated — the last step. Checking here lets the page say so before offering the feature,
 * instead of letting someone fill in a token and reach the second page of the dialog first.
 */
export const assetAccountsUnavailableReason = (lockProviderId?: string): string | undefined => {
  if (!lockProviderId) {
    return undefined
  }
  return 's-udt.account-list.unavailable-for-lock-provider'
}

export default assetAccountsUnavailableReason
