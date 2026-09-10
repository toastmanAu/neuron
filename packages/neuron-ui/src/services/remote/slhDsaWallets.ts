import { remoteApi } from './remoteApiWrapper'

/**
 * Quantum-resistant (SLH-DSA) wallets.
 *
 * Separate channels from the mnemonic and keystore ones: a FIPS 205 key pair has no mnemonic, no
 * extended key and no derivation path, so routing it through those APIs would mean lying about
 * what it is.
 */
export const getSlhDsaParameterSets = remoteApi<void, Controller.SlhDsaParameterSetSummary[]>('slh-dsa-parameter-sets')
export const createSlhDsaWallet = remoteApi<
  Controller.CreateSlhDsaWalletParams,
  { id: string; name: string; addresses: Controller.SlhDsaAddress[] }
>('create-slh-dsa-wallet')
export const getSlhDsaAddresses = remoteApi<{ walletID: string }, Controller.SlhDsaAddress[]>('get-slh-dsa-addresses')
export const exportSlhDsaBackup = remoteApi<{ walletID: string }, unknown>('export-slh-dsa-backup')
export const importSlhDsaBackup = remoteApi<{ name: string; backup: string }, { id: string; name: string }>(
  'import-slh-dsa-backup'
)
export const importSlhDsaWatchOnly = remoteApi<
  Controller.ImportSlhDsaWatchOnlyParams,
  { id: string; name: string; addresses: Controller.SlhDsaAddress[] }
>('import-slh-dsa-watch-only')
