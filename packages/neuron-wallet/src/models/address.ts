import { ScriptHashType } from './chain/script'
import { hd } from '@ckb-lumos/lumos'

export enum AddressVersion {
  Testnet = 'testnet',
  Mainnet = 'mainnet',
}

export interface Address {
  walletId: string
  address: string
  path: string
  addressType: hd.AddressType
  addressIndex: number
  blake160: string
  /**
   * The lock this address is for, when it is not the secp256k1 default.
   *
   * An HD address is always secp and says nothing, which is why every consumer could assume it. A
   * provider-backed identity is a different lock entirely, and an address that cannot say so forces
   * each consumer to special-case it — which is exactly how a funded wallet came to report a zero
   * balance six different ways.
   */
  lockCodeHash?: string
  lockHashType?: ScriptHashType
  txCount?: number
  liveBalance?: string
  sentBalance?: string
  pendingBalance?: string
  balance?: string
  version?: AddressVersion
  description?: string
  isImporting?: boolean
  usedByAnyoneCanPay?: boolean
}
