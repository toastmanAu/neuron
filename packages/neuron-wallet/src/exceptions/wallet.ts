import { t } from 'i18next'

export class CurrentWalletNotSet extends Error {
  public code = 111
  constructor() {
    super(t('messages.current-wallet-not-set'))
  }
}
export class WalletNotFound extends Error {
  public code = 112
  public i18n: {
    id: string
  }

  constructor(id: string) {
    super(t('messages.wallet-not-found', { id }))
    this.i18n = { id }
  }
}

export class IncorrectPassword extends Error {
  public code = 103
  constructor() {
    super(t('messages.incorrect-password'))
  }
}

export class EmptyPassword extends Error {
  constructor() {
    super(t('messages.is-required', { field: t('keywords.password') }))
  }
}

export class CodeHashNotLoaded extends Error {
  constructor() {
    super(t('messages.codehash-not-loaded'))
  }
}

export class CapacityNotEnough extends Error {
  public code = 109
  constructor() {
    super(t('messages.capacity-not-enough'))
  }
}

export class LiveCapacityNotEnough extends Error {
  public code = 110
  constructor() {
    super(t('messages.live-capacity-not-enough'))
  }
}

export class CapacityNotEnoughForChange extends Error {
  public code = 105
  constructor() {
    super(t('messages.capacity-not-enough-for-change'))
  }
}

export class CapacityNotEnoughForChangeByTransfer extends Error {
  public code = 115
  constructor() {
    super(t('messages.capacity-not-enough-for-change-by-transfer'))
  }
}

export class InvalidKeystore extends Error {
  public code = 113
  constructor() {
    super(t('messages.invalid-keystore'))
  }
}

export class WalletFunctionNotSupported extends Error {
  constructor(name: string) {
    super(t('messages.wallet-not-supported-function', { name }))
  }
}

/**
 * Raised when a feature needs a lock that cannot verify this wallet's signatures.
 *
 * Asset accounts are the case this exists for. They are held under the deployed `anyone_can_pay`
 * lock, whose args are a 20-byte secp public key hash and which verifies a secp signature. A
 * quantum-resistant wallet has neither, so the account could be created but never spent — the cell
 * would be locked to a key nobody holds. Refusing with a reason beats producing that cell, and
 * beats the bare "does not support" message this used to surface as.
 */
export class LockProviderFeatureUnavailable extends Error {
  constructor(feature: string) {
    super(
      `${feature} is not available for this wallet. It requires the anyone-can-pay lock, which only verifies secp256k1 signatures, and this wallet signs with SLH-DSA.`
    )
  }
}

export class DuplicateImportWallet extends Error {
  public code = 118
  constructor(errorStr: string) {
    super(errorStr)
  }
}

export class UnsupportedCkbCliKeystore extends Error {
  public code = 119
  constructor() {
    super(t('messages.unsupported-ckb-cli-keystore'))
  }
}

export default {
  WalletNotFound,
  CurrentWalletNotSet,
  IncorrectPassword,
  EmptyPassword,
  CodeHashNotLoaded,
  CapacityNotEnough,
  LiveCapacityNotEnough,
  CapacityNotEnoughForChange,
  InvalidKeystore,
  DuplicateImportWallet,
  UnsupportedCkbCliKeystore,
}
